import { useEffect, useState, type JSX } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { TAKEOFF_PATH_NORM_VB, type TakeoffDocumentContentInset } from './path-types'
import type { NormBBox } from './snip-search-core'

if (!GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfWorker
}

const VB = TAKEOFF_PATH_NORM_VB
const FULL_CONTENT_INSET: TakeoffDocumentContentInset = { x: 0, y: 0, w: 1, h: 1 }

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Same 2D affine multiply as pdf.js `Util.transform`. */
function transform(m1: number[], m2: number[]): number[] {
  return [
    m1[0]! * m2[0]! + m1[2]! * m2[1]!,
    m1[1]! * m2[0]! + m1[3]! * m2[1]!,
    m1[0]! * m2[2]! + m1[2]! * m2[3]!,
    m1[1]! * m2[2]! + m1[3]! * m2[3]!,
    m1[0]! * m2[4]! + m1[2]! * m2[5]! + m1[4]!,
    m1[1]! * m2[4]! + m1[3]! * m2[5]! + m1[5]!
  ]
}

type RawDims = { pageWidth: number; pageHeight: number; pageX: number; pageY: number }

function pdfTextSliceToLayoutBox(
  viewport: { rawDims: object; width: number; height: number },
  geom: { transform: number[]; width: number },
  u0: number,
  u1: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const rd = viewport.rawDims as Partial<RawDims>
  const pageW = rd.pageWidth ?? viewport.width
  const pageH = rd.pageHeight ?? viewport.height
  const pageX = rd.pageX ?? 0
  const pageY = rd.pageY ?? 0
  if (!(pageW > 0) || !(pageH > 0)) return null

  const lo = Math.min(u0, u1)
  const hi = Math.max(u0, u1)
  if (!(hi > lo)) return null

  const baseTransform = [1, 0, 0, -1, -pageX, pageY + pageH]
  const tx = transform(baseTransform, geom.transform)
  const corners: [number, number][] = [
    [lo, 0],
    [hi, 0],
    [hi, 1],
    [lo, 1]
  ]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [px, py] of corners) {
    const x = tx[0]! * px + tx[2]! * py + tx[4]!
    const y = tx[1]! * px + tx[3]! * py + tx[5]!
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}

function effectivePdfRunWidthForLayout(
  viewport: { rawDims: object; width: number; height: number },
  geom: { transform: number[]; width: number },
  strLen: number
): number {
  const raw = Math.max(0, geom.width)
  if (strLen <= 0) return raw
  const rd = viewport.rawDims as Partial<RawDims>
  const pageW = rd.pageWidth ?? viewport.width
  const pageH = rd.pageHeight ?? viewport.height
  const pageX = rd.pageX ?? 0
  const pageY = rd.pageY ?? 0
  if (!(pageW > 0) || !(pageH > 0)) return raw

  const baseTransform = [1, 0, 0, -1, -pageX, pageY + pageH]
  const tx = transform(baseTransform, geom.transform)
  const baselineScale = Math.hypot(tx[0]!, tx[1]!)
  const em = Math.hypot(tx[2]!, tx[3]!)
  const scaleAlongRun = Math.max(baselineScale, 1e-8)

  let maxLayoutSpan = em * strLen * 0.75
  if (em < 1e-8) {
    maxLayoutSpan = Math.min(pageW, pageH) * 0.04 * strLen
  }

  const maxTextWidth = maxLayoutSpan / scaleAlongRun
  return Math.min(raw, Math.max(maxTextWidth, 1e-6))
}

function isPdfTextRun(item: unknown): item is { str: string; transform: number[]; width: number } {
  if (!item || typeof item !== 'object') return false
  const o = item as Record<string, unknown>
  return typeof o.str === 'string' && Array.isArray(o.transform) && typeof o.width === 'number'
}

function pdfMatchRangesInString(str: string, q: string): { start: number; len: number }[] {
  const lower = str.toLowerCase()
  const out: { start: number; len: number }[] = []
  let pos = 0
  while (pos < str.length) {
    const i = lower.indexOf(q, pos)
    if (i < 0) break
    out.push({ start: i, len: q.length })
    pos = i + Math.max(1, q.length)
  }
  return out
}

function takeoffPdfFindRectsForQueryOnPage(
  viewport: { rawDims: object; width: number; height: number },
  items: readonly unknown[],
  query: string
): NormBBox[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const rd = viewport.rawDims as Partial<RawDims>
  const pageW = rd.pageWidth ?? viewport.width
  const pageH = rd.pageHeight ?? viewport.height
  const out: NormBBox[] = []

  for (const item of items) {
    if (!isPdfTextRun(item)) continue
    const str = item.str
    const ranges = pdfMatchRangesInString(str, q)
    if (ranges.length === 0) continue

    const denom = Math.max(str.length, 1)
    const runW = effectivePdfRunWidthForLayout(viewport, item, denom)

    for (const { start, len } of ranges) {
      const u0 = runW * (start / denom)
      const u1 = runW * ((start + len) / denom)
      const box = pdfTextSliceToLayoutBox(viewport, item, u0, u1)
      if (!box) continue
      out.push({
        x1: clamp((box.minX / pageW) * VB, 0, VB),
        y1: clamp((box.minY / pageH) * VB, 0, VB),
        x2: clamp((box.maxX / pageW) * VB, 0, VB),
        y2: clamp((box.maxY / pageH) * VB, 0, VB)
      })
    }
  }

  return out
}

async function computePdfFindRects(url: string, query: string, pageNumber: number): Promise<NormBBox[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const loadingTask = getDocument({ url, withCredentials: false })
  let pdf: PDFDocumentProxy | null = null
  try {
    pdf = await loadingTask.promise
    const page = await pdf.getPage(Math.min(Math.max(1, pageNumber), pdf.numPages || 1))
    const viewport = page.getViewport({ scale: 1 })
    const { items } = await page.getTextContent()
    return takeoffPdfFindRectsForQueryOnPage(viewport, items, query)
  } finally {
    await pdf?.cleanup().catch(() => undefined)
    await loadingTask.destroy().catch(() => undefined)
  }
}

async function computeSvgFindRects(url: string, query: string): Promise<NormBBox[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const res = await fetch(url)
  if (!res.ok) return []
  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.localName !== 'svg') return []

  const vbAttr = svg.getAttribute('viewBox')
  let vx = 0
  let vy = 0
  let vw = 300
  let vh = 150
  if (vbAttr) {
    const p = vbAttr.trim().split(/[\s,]+/).map(Number)
    if (p.length >= 4 && p.every((n) => Number.isFinite(n))) {
      ;[vx, vy, vw, vh] = p as [number, number, number, number]
    }
  }
  if (vw <= 0 || vh <= 0) return []

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden'
  const clone = document.importNode(svg, true) as unknown as SVGSVGElement
  host.appendChild(clone)
  document.body.appendChild(host)

  const out: NormBBox[] = []
  try {
    clone.querySelectorAll('text, tspan').forEach((el) => {
      const text = el.textContent ?? ''
      if (!text.toLowerCase().includes(q)) return
      try {
        const g = el as SVGGraphicsElement
        const b = g.getBBox()
        const x1 = ((b.x - vx) / vw) * VB
        const y1 = ((b.y - vy) / vh) * VB
        const x2 = ((b.x + b.width - vx) / vw) * VB
        const y2 = ((b.y + b.height - vy) / vh) * VB
        out.push({
          x1: clamp(Math.min(x1, x2), 0, VB),
          y1: clamp(Math.min(y1, y2), 0, VB),
          x2: clamp(Math.max(x1, x2), 0, VB),
          y2: clamp(Math.max(y1, y2), 0, VB)
        })
      } catch {
        /* ignore bbox errors */
      }
    })
  } finally {
    host.remove()
  }
  return out
}

type UseTakeoffFindHighlightsArgs = {
  url: string | null
  query: string
  active: boolean
  mode: 'pdf' | 'svg' | null
  pageNumber?: number
}

export function useTakeoffFindHighlights({
  url,
  query,
  active,
  mode,
  pageNumber = 1
}: UseTakeoffFindHighlightsArgs): {
  rects: NormBBox[]
  searching: boolean
} {
  const [rects, setRects] = useState<NormBBox[]>([])
  const [searching, setSearching] = useState(false)
  const trimmed = query.trim()

  useEffect(() => {
    if (!active || !url || !mode || !trimmed) {
      setRects([])
      setSearching(false)
      return
    }

    let cancelled = false
    const t = window.setTimeout(() => {
      setSearching(true)
      void (async () => {
        try {
          const next =
            mode === 'pdf' ? await computePdfFindRects(url, trimmed, pageNumber) : await computeSvgFindRects(url, trimmed)
          if (!cancelled) setRects(next)
        } catch {
          if (!cancelled) setRects([])
        } finally {
          if (!cancelled) setSearching(false)
        }
      })()
    }, 200)

    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [url, trimmed, active, mode, pageNumber])

  return { rects, searching }
}

type TakeoffFindHighlightLayerProps = {
  rects: NormBBox[]
  contentInset?: TakeoffDocumentContentInset
  variant?: 'find' | 'snip'
}

export function TakeoffFindHighlightLayer({
  rects,
  contentInset = FULL_CONTENT_INSET,
  variant = 'find'
}: TakeoffFindHighlightLayerProps): JSX.Element | null {
  if (rects.length === 0) return null
  const { x, y, w, h } = contentInset
  const fill = variant === 'snip' ? 'rgba(139, 92, 246, 0.22)' : 'rgba(250, 204, 21, 0.28)'
  const stroke = variant === 'snip' ? 'rgb(109 40 217)' : 'rgb(217 119 6)'
  const zClass = variant === 'snip' ? 'z-6' : 'z-4'
  return (
    <svg
      className={`pointer-events-none absolute ${zClass} overflow-visible`}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`
      }}
      viewBox={`0 0 ${VB} ${VB}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {rects.map((r, i) => (
        <rect
          key={`${r.x1}-${r.y1}-${r.x2}-${r.y2}-${i}`}
          x={r.x1}
          y={r.y1}
          width={Math.max(0, r.x2 - r.x1)}
          height={Math.max(0, r.y2 - r.y1)}
          fill={fill}
          stroke={stroke}
          strokeWidth={3}
        />
      ))}
    </svg>
  )
}

export function takeoffDocumentSupportsFind(fileType: string, fileName: string): 'pdf' | 'svg' | null {
  const t = fileType.trim().toLowerCase()
  if (t === 'application/pdf') return 'pdf'
  if (t === 'image/svg+xml') return 'svg'
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined
  if (ext === 'pdf') return 'pdf'
  if (ext === 'svg') return 'svg'
  return null
}
