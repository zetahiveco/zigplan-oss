import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { TakeoffDocumentContentInset } from './path-types'

GlobalWorkerOptions.workerSrc = pdfWorker

const MAX_CANVAS_EDGE = 8192

type TakeoffPdfFirstPageProps = {
  url: string
  fileName: string
  pageNumber?: number
  viewportZoom: number
  onDocumentContentInset?: (inset: TakeoffDocumentContentInset) => void
  onPageCount?: (pageCount: number) => void
}

export function TakeoffPdfFirstPage({
  url,
  fileName,
  pageNumber = 1,
  viewportZoom,
  onDocumentContentInset,
  onPageCount
}: TakeoffPdfFirstPageProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const pageRef = useRef<PDFPageProxy | null>(null)
  const renderTaskRef = useRef<RenderTask | null>(null)
  const urlGenRef = useRef(0)
  const zoomRef = useRef(viewportZoom)
  const [pdfError, setPdfError] = useState<string | null>(null)

  zoomRef.current = viewportZoom

  const paintPage = useCallback(async () => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const page = pageRef.current
    if (!host || !canvas || !page) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel()
      } catch {
        /* ignore */
      }
      renderTaskRef.current = null
    }

    const base = page.getViewport({ scale: 1 })
    const w = Math.max(1, host.offsetWidth)
    const h = Math.max(1, host.offsetHeight)
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    const zoom = Math.max(1, zoomRef.current)
    const fitScale = Math.min(w / base.width, h / base.height)
    const cssW = base.width * fitScale
    const cssH = base.height * fitScale

    let renderScale = fitScale * dpr * zoom
    let viewport = page.getViewport({ scale: renderScale })
    if (viewport.width > MAX_CANVAS_EDGE || viewport.height > MAX_CANVAS_EDGE) {
      const shrink = Math.min(MAX_CANVAS_EDGE / viewport.width, MAX_CANVAS_EDGE / viewport.height)
      renderScale *= shrink
      viewport = page.getViewport({ scale: renderScale })
    }

    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const task = page.render({ canvas, viewport })
    renderTaskRef.current = task
    try {
      await task.promise
    } catch (e) {
      const name = e instanceof Error ? e.name : ''
      if (name === 'RenderingCancelledException' || name === 'AbortException') return
      throw e
    } finally {
      renderTaskRef.current = null
    }

    const hostW = Math.max(1, host.offsetWidth)
    const hostH = Math.max(1, host.offsetHeight)
    onDocumentContentInset?.({
      x: (hostW - cssW) / (2 * hostW),
      y: (hostH - cssH) / (2 * hostH),
      w: cssW / hostW,
      h: cssH / hostH
    })
  }, [onDocumentContentInset])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const gen = ++urlGenRef.current
    setPdfError(null)
    let cancelled = false
    const loadingTask = getDocument({ url, withCredentials: false })

    void (async () => {
      try {
        const pdf = await loadingTask.promise
        if (cancelled || gen !== urlGenRef.current) {
          await pdf.cleanup().catch(() => undefined)
          return
        }
        if (pdfRef.current) await pdfRef.current.cleanup().catch(() => undefined)
        pdfRef.current = pdf
        onPageCount?.(Math.max(1, pdf.numPages || 1))
        const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages || 1))
        if (cancelled || gen !== urlGenRef.current) {
          await pdf.cleanup().catch(() => undefined)
          return
        }
        pageRef.current = page
        await paintPage()
      } catch (e) {
        if (!cancelled && gen === urlGenRef.current) {
          setPdfError(e instanceof Error ? e.message : 'Could not load PDF')
        }
      }
    })()

    const ro = new ResizeObserver(() => {
      if (cancelled || gen !== urlGenRef.current) return
      void paintPage()
    })
    ro.observe(host)

    return () => {
      cancelled = true
      ro.disconnect()
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      pageRef.current = null
      void pdfRef.current?.cleanup().catch(() => undefined)
      pdfRef.current = null
      void loadingTask.destroy().catch(() => undefined)
    }
  }, [url, pageNumber, paintPage])

  useEffect(() => {
    if (!pageRef.current) return
    const id = window.setTimeout(() => {
      void paintPage()
    }, 48)
    return () => window.clearTimeout(id)
  }, [viewportZoom, paintPage])

  return (
    <div ref={hostRef} className="relative box-border flex h-full min-h-0 w-full min-w-0 items-center justify-center">
      {pdfError ? (
        <p className="absolute inset-x-4 text-center text-sm text-destructive">{pdfError}</p>
      ) : null}
      <canvas ref={canvasRef} className="block bg-white shadow-sm" aria-label={fileName} />
    </div>
  )
}
