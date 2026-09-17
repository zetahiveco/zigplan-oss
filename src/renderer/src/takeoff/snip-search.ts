import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { runSnipSearchOnFullGray, type NormBBox } from './snip-search-core'

if (!GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorker
}

export type { NormBBox }
export type TakeoffSnipDocumentKind = 'pdf' | 'svg' | 'raster'

const MAX_SOURCE_LONG = 2400

let workerRef: Worker | null = null
let workerNextId = 1

function grayFromRgba(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const n = w * h
  const g = new Uint8Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = Math.round(0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!)
  }
  return g
}

function ensureSnipWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!workerRef) {
    try {
      workerRef = new Worker(new URL('./snip-search.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      workerRef = null
    }
  }
  return workerRef
}

async function pixelSnipSearchFromGrayBuffer(
  gray: Uint8Array,
  iw: number,
  ih: number,
  snipNorm: NormBBox,
  signal?: AbortSignal
): Promise<NormBBox[]> {
  if (signal?.aborted) return []
  const copy = new Uint8Array(gray)
  const w = ensureSnipWorker()
  if (!w) {
    if (signal?.aborted) return []
    return runSnipSearchOnFullGray(copy, iw, ih, snipNorm)
  }

  const id = workerNextId++
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      w.removeEventListener('message', onMsg)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
    const onAbort = (): void => {
      cleanup()
      resolve([])
    }
    const onMsg = (ev: MessageEvent<{ id: number; rects?: NormBBox[]; error?: string }>): void => {
      if (ev.data?.id !== id) return
      cleanup()
      if (signal?.aborted) {
        resolve([])
        return
      }
      if (ev.data.error) reject(new Error(ev.data.error))
      else resolve(ev.data.rects ?? [])
    }
    w.addEventListener('message', onMsg)
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort)
    }
    try {
      w.postMessage({ id, grayBuffer: copy.buffer, iw, ih, snip: snipNorm }, [copy.buffer])
    } catch (e) {
      cleanup()
      if (signal?.aborted) {
        resolve([])
        return
      }
      try {
        resolve(runSnipSearchOnFullGray(new Uint8Array(gray), iw, ih, snipNorm))
      } catch {
        reject(e)
      }
    }
  })
}

async function imageToCanvasAndGray(url: string): Promise<{ gray: Uint8Array; iw: number; ih: number } | null> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.decoding = 'async'
  img.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image load'))
    })
  } catch {
    return null
  }

  let iw = Math.max(1, img.naturalWidth)
  let ih = Math.max(1, img.naturalHeight)
  const long = Math.max(iw, ih)
  if (long > MAX_SOURCE_LONG) {
    const scale = MAX_SOURCE_LONG / long
    iw = Math.max(1, Math.round(iw * scale))
    ih = Math.max(1, Math.round(ih * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = iw
  canvas.height = ih
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, iw, ih)
  return { gray: grayFromRgba(ctx.getImageData(0, 0, iw, ih).data, iw, ih), iw, ih }
}

async function runPixelSnipSearchFromRasterUrl(
  url: string,
  snipNorm: NormBBox,
  signal?: AbortSignal
): Promise<NormBBox[]> {
  const g = await imageToCanvasAndGray(url)
  if (!g || signal?.aborted) return []
  return pixelSnipSearchFromGrayBuffer(g.gray, g.iw, g.ih, snipNorm, signal)
}

async function runPixelSnipSearchFromSvgUrl(
  url: string,
  snipNorm: NormBBox,
  signal?: AbortSignal
): Promise<NormBBox[]> {
  const res = await fetch(url)
  if (!res.ok) return []
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    return await runPixelSnipSearchFromRasterUrl(objectUrl, snipNorm, signal)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function runPixelSnipSearchFromPdfUrl(
  url: string,
  snipNorm: NormBBox,
  pageNumber: number,
  signal?: AbortSignal
): Promise<NormBBox[]> {
  const loadingTask = getDocument({ url, withCredentials: false })
  let pdf: PDFDocumentProxy | null = null
  try {
    pdf = await loadingTask.promise
    if (signal?.aborted) return []
    const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages || 1))
    const base = page.getViewport({ scale: 1 })
    const long = Math.max(base.width, base.height)
    const capScale = long > 0 ? Math.min(1, MAX_SOURCE_LONG / long) : 1
    const viewport = page.getViewport({ scale: capScale })
    const iw = Math.max(1, Math.floor(viewport.width))
    const ih = Math.max(1, Math.floor(viewport.height))
    const canvas = document.createElement('canvas')
    canvas.width = iw
    canvas.height = ih
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    await page.render({ canvas, viewport }).promise
    if (signal?.aborted) return []
    const gray = grayFromRgba(ctx.getImageData(0, 0, iw, ih).data, iw, ih)
    return pixelSnipSearchFromGrayBuffer(gray, iw, ih, snipNorm, signal)
  } finally {
    await pdf?.cleanup().catch(() => undefined)
    await loadingTask.destroy().catch(() => undefined)
  }
}

export async function runTakeoffCountSearch(args: {
  kind: TakeoffSnipDocumentKind
  url: string
  snipNorm: NormBBox
  pageNumber?: number
  signal?: AbortSignal
}): Promise<NormBBox[]> {
  const { kind, url, snipNorm, pageNumber = 1, signal } = args
  if (kind === 'pdf') return runPixelSnipSearchFromPdfUrl(url, snipNorm, pageNumber, signal)
  if (kind === 'svg') return runPixelSnipSearchFromSvgUrl(url, snipNorm, signal)
  return runPixelSnipSearchFromRasterUrl(url, snipNorm, signal)
}

export function classifyTakeoffSnipKind(fileType: string, fileName: string): TakeoffSnipDocumentKind | null {
  const t = fileType.trim().toLowerCase()
  if (t === 'application/pdf') return 'pdf'
  if (t === 'image/svg+xml') return 'svg'
  if (t === 'image/png' || t === 'image/jpeg') return 'raster'
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined
  if (ext === 'pdf') return 'pdf'
  if (ext === 'svg') return 'svg'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'raster'
  return null
}
