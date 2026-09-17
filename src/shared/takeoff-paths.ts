export const TAKEOFF_PATH_V = 1 as const
export const TAKEOFF_PATHS_BUNDLE_V = 2 as const
export const DEFAULT_TAKEOFF_PATH_COLOR = '#2563eb'
export const TAKEOFF_PATH_NORM_VB = 1000

export type TakeoffDocumentContentInset = { x: number; y: number; w: number; h: number }

export type TakeoffPolygonPathV1 = {
  v: typeof TAKEOFF_PATH_V
  documentId: string
  points: { x: number; y: number }[]
}

export type TakeoffPathBundleV2 = {
  v: typeof TAKEOFF_PATHS_BUNDLE_V
  documentId: string
  polygons: { x: number; y: number }[][]
}

export type TakeoffDraftPath = {
  id: string
  points: { x: number; y: number }[]
}

function parsePointsArray(poly: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(poly) || poly.length < 3) return null
  const points: { x: number; y: number }[] = []
  for (const p of poly) {
    if (!p || typeof p !== 'object') return null
    const q = p as Record<string, unknown>
    if (typeof q.x !== 'number' || typeof q.y !== 'number' || !Number.isFinite(q.x) || !Number.isFinite(q.y)) {
      return null
    }
    points.push({ x: q.x, y: q.y })
  }
  return points
}

export function parseTakeoffPathsForDocument(raw: unknown, documentId: string): TakeoffPolygonPathV1[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>

  if (o.v === TAKEOFF_PATHS_BUNDLE_V && o.documentId === documentId && Array.isArray(o.polygons)) {
    const out: TakeoffPolygonPathV1[] = []
    for (const poly of o.polygons) {
      const points = parsePointsArray(poly)
      if (points) out.push({ v: TAKEOFF_PATH_V, documentId, points })
    }
    return out
  }

  if (o.v !== TAKEOFF_PATH_V || o.documentId !== documentId) return []
  const points = parsePointsArray(o.points)
  return points ? [{ v: TAKEOFF_PATH_V, documentId, points }] : []
}

export function parseTakeoffItemPathsForDocument(
  item: { path: unknown; documentId: string | null },
  selectedDocumentId: string
): TakeoffPolygonPathV1[] {
  if (!selectedDocumentId) return []
  if (item.documentId != null && item.documentId !== selectedDocumentId) return []
  return parseTakeoffPathsForDocument(item.path, selectedDocumentId)
}

export function buildTakeoffPathsBundle(documentId: string, polygons: { x: number; y: number }[][]): TakeoffPathBundleV2 {
  return {
    v: TAKEOFF_PATHS_BUNDLE_V,
    documentId,
    polygons: polygons.filter((p) => p.length >= 3)
  }
}

export function parseItemPathOverlayKey(key: string): { itemId: string; segmentIndex: number | null } | null {
  if (!key.startsWith('item:')) return null
  const rest = key.slice('item:'.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon === -1) return { itemId: rest, segmentIndex: null }
  const itemId = rest.slice(0, lastColon)
  const n = Number(rest.slice(lastColon + 1))
  if (!Number.isInteger(n) || n < 0) return { itemId: rest, segmentIndex: null }
  return { itemId, segmentIndex: n }
}

export function itemPathOverlayKey(itemId: string, segmentIndex: number): string {
  return `item:${itemId}:${segmentIndex}`
}

export const TAKEOFF_COUNT_PATHS_V = 1 as const

export type TakeoffCountRect = { x: number; y: number; w: number; h: number }

export type TakeoffCountPathsBundleV1 = {
  v: typeof TAKEOFF_COUNT_PATHS_V
  documentId: string
  rects: TakeoffCountRect[]
}

function parseCountRect(raw: unknown): TakeoffCountRect | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const w = Number(o.w)
  const h = Number(o.h)
  if (![x, y, w, h].every((n) => Number.isFinite(n)) || w <= 0 || h <= 0) return null
  return { x, y, w, h }
}

export function parseTakeoffCountPathsBundle(raw: unknown): TakeoffCountPathsBundleV1 | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.v !== TAKEOFF_COUNT_PATHS_V || typeof o.documentId !== 'string' || !o.documentId || !Array.isArray(o.rects)) {
    return null
  }
  const rects = o.rects.map(parseCountRect).filter((rect): rect is TakeoffCountRect => rect != null)
  return { v: TAKEOFF_COUNT_PATHS_V, documentId: o.documentId, rects }
}

export function parseTakeoffCountPathsForDocument(raw: unknown, documentId: string): TakeoffCountRect[] {
  if (!documentId) return []
  const bundle = parseTakeoffCountPathsBundle(raw)
  if (!bundle || bundle.documentId !== documentId) return []
  return bundle.rects
}

export function buildTakeoffCountPathsBundle(
  documentId: string,
  rects: TakeoffCountRect[]
): TakeoffCountPathsBundleV1 {
  return {
    v: TAKEOFF_COUNT_PATHS_V,
    documentId,
    rects: rects.filter((rect) => rect.w > 0 && rect.h > 0)
  }
}

export function itemCountMarkOverlayKey(itemId: string, index: number): string {
  return `tally:${itemId}:${index}`
}

export function parseItemCountMarkOverlayKey(key: string): { itemId: string; index: number } | null {
  if (!key.startsWith('tally:')) return null
  const rest = key.slice('tally:'.length)
  const lastColon = rest.lastIndexOf(':')
  if (lastColon === -1) return null
  const itemId = rest.slice(0, lastColon)
  const n = Number(rest.slice(lastColon + 1))
  if (!itemId || !Number.isInteger(n) || n < 0) return null
  return { itemId, index: n }
}

function clampNorm(n: number, vb: number): number {
  return Math.min(vb, Math.max(0, n))
}

export function translatePolygonByDeltaClamped(
  base: { x: number; y: number }[],
  dx: number,
  dy: number,
  vb = TAKEOFF_PATH_NORM_VB
): { x: number; y: number }[] {
  let tx = dx
  let ty = dy
  for (let iter = 0; iter < 8; iter++) {
    const pts = base.map((p) => ({ x: p.x + tx, y: p.y + ty }))
    const minX = Math.min(...pts.map((p) => p.x))
    if (minX < 0) {
      tx -= minX
      continue
    }
    const maxX = Math.max(...pts.map((p) => p.x))
    if (maxX > vb) {
      tx -= maxX - vb
      continue
    }
    const minY = Math.min(...pts.map((p) => p.y))
    if (minY < 0) {
      ty -= minY
      continue
    }
    const maxY = Math.max(...pts.map((p) => p.y))
    if (maxY > vb) {
      ty -= maxY - vb
      continue
    }
    return pts
  }
  return base.map((p) => ({ x: clampNorm(p.x + tx, vb), y: clampNorm(p.y + ty, vb) }))
}

export function polygonAreaNorm(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area / 2)
}
