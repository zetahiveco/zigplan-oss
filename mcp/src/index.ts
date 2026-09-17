#!/usr/bin/env node
/**
 * Zigplan MCP server (stdio).
 * Prefer starting MCP from the Zigplan app (File → Start MCP Server) when the
 * desktop app is open — that shares the live database over HTTP.
 *
 * Env:
 *   ZIGPLAN_DATA_DIR — optional override of the Zigplan data root
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  closeDatabase,
  getDataDirectory,
  initializeDatabase
} from '../../src/main/pouch'
import { registerZigplanMcpTools } from '../../src/main/mcp-tools'

async function main(): Promise<void> {
  await initializeDatabase()
  console.error(`[zigplan-mcp] Data root: ${getDataDirectory()}`)

  const server = new McpServer({
    name: 'zigplan',
    version: '1.0.0-beta'
  })
  registerZigplanMcpTools(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  const shutdown = async (): Promise<void> => {
    await closeDatabase()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((err) => {
  console.error('[zigplan-mcp] Fatal', err)
  process.exit(1)
})
