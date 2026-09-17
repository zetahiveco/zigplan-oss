import { randomUUID } from 'crypto'
import type { Server as HttpServer } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { getDataDirectory } from './pouch'
import { registerZigplanMcpTools } from './mcp-tools'

export type McpHttpStatus = {
  running: boolean
  port: number | null
  url: string | null
  dataDir: string
}

const DEFAULT_PORT = 47821

let httpServer: HttpServer | null = null
let activePort: number | null = null
const transports = new Map<string, StreamableHTTPServerTransport>()

function createServer(): McpServer {
  const server = new McpServer({
    name: 'zigplan',
    version: '1.0.0-beta'
  })
  registerZigplanMcpTools(server)
  return server
}

export function getMcpHttpStatus(): McpHttpStatus {
  const port = activePort
  return {
    running: httpServer != null && port != null,
    port,
    url: port != null ? `http://127.0.0.1:${port}/mcp` : null,
    dataDir: getDataDirectory()
  }
}

export async function startMcpHttpServer(port = DEFAULT_PORT): Promise<McpHttpStatus> {
  if (httpServer) return getMcpHttpStatus()

  const app = createMcpExpressApp({ host: '127.0.0.1' })

  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    try {
      let transport: StreamableHTTPServerTransport
      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport)
          }
        })
        transport.onclose = (): void => {
          const sid = transport.sessionId
          if (sid) transports.delete(sid)
        }
        const server = createServer()
        await server.connect(transport)
        await transport.handleRequest(req, res, req.body)
        return
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null
        })
        return
      }
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      console.error('[zigplan] MCP HTTP request failed', error)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        })
      }
    }
  })

  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) {
      res.status(400).send('Invalid or missing session ID')
      return
    }
    await transport.handleRequest(req, res)
  })

  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const transport = sessionId ? transports.get(sessionId) : undefined
    if (!transport) {
      res.status(400).send('Invalid or missing session ID')
      return
    }
    await transport.handleRequest(req, res)
  })

  await new Promise<void>((resolve, reject) => {
    httpServer = app.listen(port, '127.0.0.1', () => {
      activePort = port
      console.log(`[zigplan] MCP HTTP server listening on http://127.0.0.1:${port}/mcp`)
      resolve()
    })
    httpServer.on('error', (err) => {
      httpServer = null
      activePort = null
      reject(err)
    })
  })

  return getMcpHttpStatus()
}

export async function stopMcpHttpServer(): Promise<McpHttpStatus> {
  for (const transport of transports.values()) {
    try {
      await transport.close()
    } catch {
      // ignore
    }
  }
  transports.clear()

  await new Promise<void>((resolve) => {
    if (!httpServer) {
      resolve()
      return
    }
    httpServer.close(() => resolve())
  })
  httpServer = null
  activePort = null
  console.log('[zigplan] MCP HTTP server stopped')
  return getMcpHttpStatus()
}
