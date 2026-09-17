import { protocol, net } from 'electron'
import { pathToFileURL } from 'url'
import { findStoredDocument, resolveDocumentDiskPath } from './pouch'

export function registerFileProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'zigplan',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        bypassCSP: true
      }
    }
  ])
}

export function registerFileProtocol(): void {
  try {
    protocol.unhandle('zigplan')
  } catch {
    /* first registration */
  }

  protocol.handle('zigplan', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'file') {
        return new Response('Not found', { status: 404 })
      }

      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const document = await findStoredDocument(id)
      if (!document) {
        return new Response('Not found', { status: 404 })
      }

      const fileUrl = pathToFileURL(resolveDocumentDiskPath(document.filePath)).toString()
      const response = await net.fetch(fileUrl)
      const headers = new Headers(response.headers)
      headers.set('Content-Type', document.fileType)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(response.body, {
        status: response.status,
        headers
      })
    } catch (error) {
      console.error('[zigplan] Failed to serve local file', error)
      return new Response('Not found', { status: 404 })
    }
  })
}
