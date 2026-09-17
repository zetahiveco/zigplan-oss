export const TAKEOFF_DOCUMENT_SCALE_V = 1 as const

/** Saved on a project's `StoredDocument.scale` after ruler calibration. */
export type TakeoffDocumentScaleV1 = {
  v: typeof TAKEOFF_DOCUMENT_SCALE_V
  /** Display unit label (e.g. ft, m, in). */
  unit: string
  /** Real-world size of one horizontal norm unit (0–1000 spans full page width). */
  realPerNormX: number
  /** Real-world size of one vertical norm unit (0–1000 spans full page height). */
  realPerNormY: number
}

export function parseTakeoffDocumentScale(raw: unknown): TakeoffDocumentScaleV1 | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.v !== TAKEOFF_DOCUMENT_SCALE_V) return null
  if (typeof o.unit !== "string" || !o.unit.trim()) return null
  const rx = Number(o.realPerNormX)
  const ry = Number(o.realPerNormY)
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return null
  return { v: TAKEOFF_DOCUMENT_SCALE_V, unit: o.unit.trim(), realPerNormX: rx, realPerNormY: ry }
}

/**
 * From a ruler segment in norm space (0–1000) and the page aspect ratio (width / height),
 * derive real units per norm axis so that the segment length matches `realLength`.
 */
export function realPerNormAxesFromRuler(
  dx: number,
  dy: number,
  aspectWidthOverHeight: number,
  realLength: number,
): { realPerNormX: number; realPerNormY: number } | null {
  if (!Number.isFinite(realLength) || realLength <= 0) return null
  const ar = Number.isFinite(aspectWidthOverHeight) && aspectWidthOverHeight > 0 ? aspectWidthOverHeight : 1
  const denom = Math.hypot((dx * ar) / 1000, dy / 1000)
  if (!Number.isFinite(denom) || denom < 1e-12) return null
  const pageHeight = realLength / denom
  const pageWidth = ar * pageHeight
  return { realPerNormX: pageWidth / 1000, realPerNormY: pageHeight / 1000 }
}

export function buildTakeoffDocumentScaleJson(scale: TakeoffDocumentScaleV1): TakeoffDocumentScaleV1 {
  return {
    v: TAKEOFF_DOCUMENT_SCALE_V,
    unit: scale.unit,
    realPerNormX: scale.realPerNormX,
    realPerNormY: scale.realPerNormY,
  }
}

/** Shoelace area in "norm²" (multiply by realPerNormX * realPerNormY for physical area). */
export function polygonAreaNormPlane(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    sum += points[i]!.x * points[j]!.y - points[j]!.x * points[i]!.y
  }
  return Math.abs(sum) / 2
}

export function polygonRealArea(
  points: { x: number; y: number }[],
  scale: TakeoffDocumentScaleV1 | null,
): number | null {
  const aNorm = polygonAreaNormPlane(points)
  if (!scale) return null
  return aNorm * scale.realPerNormX * scale.realPerNormY
}

const RECT_EPS = 2

function nearly(a: number, b: number) {
  return Math.abs(a - b) <= RECT_EPS
}

/** True if 4 points form an axis-aligned rectangle in norm space. */
export function isAxisAlignedRectangle(points: { x: number; y: number }[]): boolean {
  if (points.length !== 4) return false
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x1 = Math.min(...xs)
  const x2 = Math.max(...xs)
  const y1 = Math.min(...ys)
  const y2 = Math.max(...ys)
  for (const p of points) {
    const onVert = nearly(p.x, x1) || nearly(p.x, x2)
    const onHorz = nearly(p.y, y1) || nearly(p.y, y2)
    if (!onVert || !onHorz) return false
  }
  return (x2 - x1) > RECT_EPS && (y2 - y1) > RECT_EPS
}

export function axisAlignedRectSizeNorm(points: { x: number; y: number }[]): { w: number; h: number } | null {
  if (!isAxisAlignedRectangle(points)) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

function roundMeasure(n: number, digits = 4): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** Real-world length (width) and breadth (height) for an axis-aligned square/rectangle. */
export function rectangleRealDimensions(
  points: { x: number; y: number }[],
  scale: TakeoffDocumentScaleV1
): { length: number; breadth: number; area: number } | null {
  const sz = axisAlignedRectSizeNorm(points)
  if (!sz) return null
  const length = roundMeasure(sz.w * scale.realPerNormX)
  const breadth = roundMeasure(sz.h * scale.realPerNormY)
  return { length, breadth, area: roundMeasure(length * breadth) }
}

export function polygonsRealArea(
  polygons: { x: number; y: number }[][],
  scale: TakeoffDocumentScaleV1 | null
): number | null {
  if (!scale) return null
  let sum = 0
  for (const points of polygons) {
    const area = polygonRealArea(points, scale)
    if (area == null) return null
    sum += area
  }
  return roundMeasure(sum)
}

export function formatDim2(w: number, h: number, unit: string, digits = 2) {
  const f = (n: number) => n.toFixed(digits).replace(/\.?0+$/, "")
  return `${f(w)}×${f(h)} ${unit}`
}

export function formatArea(a: number, unit: string, digits = 2) {
  if (!Number.isFinite(a)) return "—"
  return `${a.toFixed(digits).replace(/\.?0+$/, "")} ${unit}²`
}

export function polygonCentroid(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / points.length, y: sy / points.length }
}

export function polygonMeasurementCaption(
  points: { x: number; y: number }[],
  scale: TakeoffDocumentScaleV1 | null,
): string {
  if (points.length < 3) return ""
  if (isAxisAlignedRectangle(points)) {
    const sz = axisAlignedRectSizeNorm(points)
    if (!sz) return ""
    if (scale) {
      const rw = sz.w * scale.realPerNormX
      const rh = sz.h * scale.realPerNormY
      return formatDim2(rw, rh, scale.unit)
    }
    return `${Math.round(sz.w)}×${Math.round(sz.h)} norm`
  }
  if (scale) {
    const ar = polygonRealArea(points, scale)
    return ar != null ? formatArea(ar, scale.unit) : ""
  }
  const aNorm = polygonAreaNormPlane(points)
  return `${Math.round(aNorm)} norm²`
}

export function labelPointForPolygon(points: { x: number; y: number }[]): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 }
  if (isAxisAlignedRectangle(points)) {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minx = Math.min(...xs)
    const maxx = Math.max(...xs)
    const miny = Math.min(...ys)
    return { x: (minx + maxx) / 2, y: Math.max(14, miny - 12) }
  }
  return polygonCentroid(points)
}
