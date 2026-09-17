import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { McpSetupPayload } from '../../../shared/types'
import { desktopApi } from '@/lib/desktop-api'

function buildClaudeCodeExample(url: string): string {
  return `{
  "mcpServers": {
    "zigplan": {
      "type": "http",
      "url": "${url}"
    }
  }
}`
}

function buildClaudeCliExample(url: string): string {
  return `claude mcp add --transport http zigplan ${url}`
}

export function McpSetupDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [payload, setPayload] = useState<McpSetupPayload | null>(null)

  useEffect(() => {
    const api = desktopApi()
    if (typeof api.mcp?.onSetup !== 'function') return

    const offSetup = api.mcp.onSetup((next) => {
      setPayload(next)
      if (next.showDialog && next.running && next.url) {
        setOpen(true)
        toast.success('MCP server started')
      } else if (!next.running && !next.showDialog) {
        toast.message('MCP server stopped')
      }
    })

    const offError =
      typeof api.mcp.onError === 'function'
        ? api.mcp.onError((message) => {
            toast.error(message || 'Could not start MCP server')
          })
        : undefined

    return () => {
      offSetup()
      offError?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only subscribe once
  }, [])

  const url = payload?.url ?? 'http://127.0.0.1:47821/mcp'
  const jsonExample = useMemo(() => buildClaudeCodeExample(url), [url])
  const cliExample = useMemo(() => buildClaudeCliExample(url), [url])

  const copyText = async (text: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>MCP server running</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          <p className="text-muted-foreground">
            Zigplan is serving MCP tools at <span className="font-mono text-foreground">{url}</span>. Keep
            this app open while agents connect. Stop anytime with{' '}
            <span className="font-medium text-foreground">File → Stop MCP Server</span>.
          </p>

          <div className="grid gap-2">
            <p className="font-medium">Claude Code (example)</p>
            <p className="text-xs text-muted-foreground">
              Add the server with the CLI, or paste the JSON into Claude Code MCP settings /{' '}
              <code className="rounded bg-muted px-1">.mcp.json</code>.
            </p>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {cliExample}
            </pre>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyText(cliExample, 'CLI command')}
            >
              Copy CLI command
            </Button>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {jsonExample}
            </pre>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyText(jsonExample, 'JSON config')}
            >
              Copy JSON config
            </Button>
          </div>

          <div className="grid gap-1 text-xs text-muted-foreground">
            <p>After adding the server, restart Claude Code (or reload MCP), then try:</p>
            <p className="font-mono text-foreground">List my Zigplan projects</p>
            <p>
              Data directory:{' '}
              <span className="font-mono text-foreground">{payload?.dataDir ?? '—'}</span>
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
