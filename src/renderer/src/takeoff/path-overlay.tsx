import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  formatDim2,
  labelPointForPolygon,
  polygonMeasurementCaption,
  type TakeoffDocumentScaleV1
} from './document-scale'
import {
  itemCountMarkOverlayKey,
  itemPathOverlayKey,
  TAKEOFF_PATH_NORM_VB,
  translatePolygonByDeltaClamped,
  type TakeoffDocumentContentInset,
  type TakeoffDraftPath,
  type TakeoffPolygonPathV1
} from './path-types'

const VB = TAKEOFF_PATH_NORM_VB
const MIN_RECT_SIDE = 12
const MIN_COUNT_MARK_SIDE = 8
const DEFAULT_COUNT_MARK_SIDE = 36
const COUNT_MARK_FILL = 'rgba(250, 204, 21, 0.75)'
const COUNT_MARK_STROKE = '#ea580c'
const MIN_RULER_NORM2 = 10 * 10
const HANDLE_RADIUS_PX = 3
const CLOSE_NORM2 = 8 * 8
const PATH_DRAG_THRESHOLD_NORM2 = 6 * 6
const OVERLAY_LABEL_FONT = 13
const OVERLAY_LABEL_STROKE = 3
const FULL_CONTENT_INSET: TakeoffDocumentContentInset = { x: 0, y: 0, w: 1, h: 1 }

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function strokeForItemColor(color: string | null): string {
  return color?.trim() || '#2563eb'
}

function itemPathFillForColor(color: string | null): string {
  const stroke = strokeForItemColor(color)
  const hex = stroke.replace('#', '')
  if (hex.length !== 6) return 'rgba(37,99,235,0.18)'
  const n = Number.parseInt(hex, 16)
  if (!Number.isFinite(n)) return 'rgba(37,99,235,0.18)'
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.18)`
}

function eventToNorm1000(e: React.MouseEvent | React.PointerEvent, svg: SVGSVGElement): { x: number; y: number } {
  const r = svg.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return { x: 0, y: 0 }
  return {
    x: clamp(((e.clientX - r.left) / r.width) * VB, 0, VB),
    y: clamp(((e.clientY - r.top) / r.height) * VB, 0, VB)
  }
}

function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/** Snap `to` so the segment from `from` is a multiple of 45° (length preserved). */
function snapSegmentEndTo45(
  from: { x: number; y: number },
  to: { x: number; y: number }
): { x: number; y: number } {
  const snap = Math.PI / 4
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { x: clamp(to.x, 0, VB), y: clamp(to.y, 0, VB) }
  const snappedAng = Math.round(Math.atan2(dy, dx) / snap) * snap
  return {
    x: clamp(from.x + len * Math.cos(snappedAng), 0, VB),
    y: clamp(from.y + len * Math.sin(snappedAng), 0, VB)
  }
}

function pointsAttr(pts: { x: number; y: number }[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ')
}

function rectDragCaption(
  pr: { x: number; y: number; w: number; h: number },
  scale: TakeoffDocumentScaleV1 | null
): string | null {
  if (pr.w < MIN_RECT_SIDE || pr.h < MIN_RECT_SIDE) return null
  if (scale) return formatDim2(pr.w * scale.realPerNormX, pr.h * scale.realPerNormY, scale.unit)
  return `${Math.round(pr.w)}×${Math.round(pr.h)}`
}

type PathDragState = {
  key: string
  startNorm: { x: number; y: number }
  basePoints: { x: number; y: number }[]
  previewPoints: { x: number; y: number }[]
  pointerId: number
  additive: boolean
}

type ItemPath = { itemId: string; segmentIndex: number; path: TakeoffPolygonPathV1; color: string | null }

export type TakeoffItemCountMark = { itemId: string; index: number; x: number; y: number; w: number; h: number }

export type TakeoffNormRect = { x1: number; y1: number; x2: number; y2: number }

export type TakeoffCountMark = { id: string; x: number; y: number; w: number; h: number }

export function countMarkOverlayKey(id: string): string {
  return `count:${id}`
}

export function parseCountMarkOverlayKey(key: string): string | null {
  if (!key.startsWith('count:')) return null
  return key.slice('count:'.length)
}

export function countMarkPoints(mark: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] {
  return [
    { x: mark.x, y: mark.y },
    { x: mark.x + mark.w, y: mark.y },
    { x: mark.x + mark.w, y: mark.y + mark.h },
    { x: mark.x, y: mark.y + mark.h }
  ]
}

export function rectFromPoints(points: { x: number; y: number }[]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

type TakeoffPathOverlayProps = {
  pathToolActive: boolean
  rectangleToolActive: boolean
  countToolActive?: boolean
  countMarkToolActive?: boolean
  countMarks?: TakeoffCountMark[]
  itemCountMarks?: TakeoffItemCountMark[]
  onAppendCountMark?: (mark: TakeoffCountMark) => void
  onCountSearchRect?: (rect: TakeoffNormRect) => void
  rulerMode?: boolean
  onRulerLineComplete?: (a: { x: number; y: number }, b: { x: number; y: number }) => void
  documentScale?: TakeoffDocumentScaleV1 | null
  draftPaths: TakeoffDraftPath[]
  itemPaths: ItemPath[]
  selectedPathKeys: ReadonlySet<string>
  onTogglePathKey: (key: string, additive: boolean) => void
  onClearPathSelection: () => void
  onSelectSinglePathKey: (key: string) => void
  onAppendDraft: (draft: TakeoffDraftPath) => void
  onCommitPathMove?: (key: string, nextPoints: { x: number; y: number }[]) => void
  contentInset?: TakeoffDocumentContentInset
}

export function TakeoffPathOverlay({
  pathToolActive,
  rectangleToolActive,
  countToolActive = false,
  countMarkToolActive = false,
  countMarks = [],
  itemCountMarks = [],
  onAppendCountMark,
  onCountSearchRect,
  rulerMode = false,
  onRulerLineComplete,
  documentScale = null,
  draftPaths,
  itemPaths,
  selectedPathKeys,
  onTogglePathKey,
  onClearPathSelection,
  onSelectSinglePathKey,
  onAppendDraft,
  onCommitPathMove,
  contentInset = FULL_CONTENT_INSET
}: TakeoffPathOverlayProps): React.JSX.Element | null {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [svgPixelSize, setSvgPixelSize] = useState({ w: 1, h: 1 })
  const [building, setBuilding] = useState<{ x: number; y: number }[]>([])
  const buildingRef = useRef(building)
  buildingRef.current = building
  const [cursorNorm, setCursorNorm] = useState<{ x: number; y: number } | null>(null)
  const [pathShiftSnap, setPathShiftSnap] = useState(false)
  const [rectDrag, setRectDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(
    null
  )
  const rectDragRef = useRef(rectDrag)
  rectDragRef.current = rectDrag
  const [pathDrag, setPathDrag] = useState<PathDragState | null>(null)
  const pathDragRef = useRef<PathDragState | null>(null)
  pathDragRef.current = pathDrag
  const suppressClickRef = useRef(false)
  const lastFinishBuildingAtRef = useRef(0)

  const drawingInteractive =
    pathToolActive || rectangleToolActive || countToolActive || countMarkToolActive || rulerMode
  const overlayPointerInteractive =
    drawingInteractive || draftPaths.length > 0 || itemPaths.length > 0 || countMarks.length > 0 || itemCountMarks.length > 0

  useLayoutEffect(() => {
    const el = svgRef.current
    if (!el) return
    const measure = (): void => {
      const r = el.getBoundingClientRect()
      setSvgPixelSize({ w: Math.max(r.width, 1), h: Math.max(r.height, 1) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [drawingInteractive, draftPaths.length, itemPaths.length, contentInset])

  useEffect(() => {
    if (!pathToolActive) {
      setBuilding([])
      setCursorNorm(null)
    }
  }, [pathToolActive])

  useEffect(() => {
    if (rulerMode) {
      setBuilding([])
      setCursorNorm(null)
    }
  }, [rulerMode])

  useEffect(() => {
    if (!rectangleToolActive && !countToolActive && !countMarkToolActive) setRectDrag(null)
  }, [rectangleToolActive, countToolActive, countMarkToolActive])

  const finishBuilding = useCallback(() => {
    const now = performance.now()
    if (now - lastFinishBuildingAtRef.current < 120) return
    const pts = buildingRef.current
    if (pts.length < 3) return
    lastFinishBuildingAtRef.current = now
    const snapshot = [...pts]
    buildingRef.current = []
    setBuilding([])
    setCursorNorm(null)
    const id = crypto.randomUUID()
    onAppendDraft({ id, points: snapshot })
    onSelectSinglePathKey(`draft:${id}`)
  }, [onAppendDraft, onSelectSinglePathKey])

  const finishRectDrag = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const x1 = Math.min(start.x, end.x)
      const x2 = Math.max(start.x, end.x)
      const y1 = Math.min(start.y, end.y)
      const y2 = Math.max(start.y, end.y)
      if (x2 - x1 < MIN_RECT_SIDE || y2 - y1 < MIN_RECT_SIDE) return
      const points = [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 }
      ]
      const id = crypto.randomUUID()
      onAppendDraft({ id, points })
      onSelectSinglePathKey(`draft:${id}`)
      suppressClickRef.current = true
    },
    [onAppendDraft, onSelectSinglePathKey]
  )

  const finishCountSearchRect = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const x1 = Math.min(start.x, end.x)
      const x2 = Math.max(start.x, end.x)
      const y1 = Math.min(start.y, end.y)
      const y2 = Math.max(start.y, end.y)
      if (x2 - x1 < MIN_RECT_SIDE || y2 - y1 < MIN_RECT_SIDE) return
      onCountSearchRect?.({ x1, y1, x2, y2 })
      suppressClickRef.current = true
    },
    [onCountSearchRect]
  )

  const finishCountMark = useCallback(
    (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const x1 = Math.min(start.x, end.x)
      const x2 = Math.max(start.x, end.x)
      const y1 = Math.min(start.y, end.y)
      const y2 = Math.max(start.y, end.y)
      const draggedW = x2 - x1
      const draggedH = y2 - y1
      let mark: TakeoffCountMark
      if (draggedW < MIN_COUNT_MARK_SIDE || draggedH < MIN_COUNT_MARK_SIDE) {
        const side = DEFAULT_COUNT_MARK_SIDE
        mark = {
          id: crypto.randomUUID(),
          x: clamp(start.x - side / 2, 0, VB - side),
          y: clamp(start.y - side / 2, 0, VB - side),
          w: side,
          h: side
        }
      } else {
        mark = { id: crypto.randomUUID(), x: x1, y: y1, w: draggedW, h: draggedH }
      }
      onAppendCountMark?.(mark)
      onSelectSinglePathKey(countMarkOverlayKey(mark.id))
      suppressClickRef.current = true
    },
    [onAppendCountMark, onSelectSinglePathKey]
  )

  useEffect(() => {
    if (!pathToolActive) return
    const onKey = (e: KeyboardEvent): void => {
      setPathShiftSnap(e.shiftKey)
      if (!rulerMode && e.key === 'Enter') {
        e.preventDefault()
        finishBuilding()
      }
    }
    const onUp = (e: KeyboardEvent): void => {
      setPathShiftSnap(e.shiftKey)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [pathToolActive, rulerMode, finishBuilding])

  const onSvgClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return
      }
      const target = e.target as Element
      if (rulerMode && pathToolActive && svgRef.current) {
        if (target.closest('[data-path-key]')) return
        const raw = eventToNorm1000(e, svgRef.current)
        const b = buildingRef.current
        if (b.length === 0) {
          setBuilding([raw])
          onClearPathSelection()
          return
        }
        if (b.length === 1) {
          const p0 = b[0]!
          const p = e.shiftKey ? snapSegmentEndTo45(p0, raw) : raw
          if (dist2(p0, p) < MIN_RULER_NORM2) return
          setBuilding([])
          setCursorNorm(null)
          onRulerLineComplete?.(p0, p)
        }
        return
      }
      const poly = target.closest('[data-path-key]') as SVGPolygonElement | null
      if (poly) {
        const key = poly.getAttribute('data-path-key')
        if (key) onTogglePathKey(key, e.ctrlKey || e.metaKey || e.shiftKey)
        return
      }
      if (!pathToolActive || !svgRef.current) return
      const raw = eventToNorm1000(e, svgRef.current)
      const b = buildingRef.current
      if (b.length >= 3 && dist2(raw, b[0]!) < CLOSE_NORM2) {
        finishBuilding()
        return
      }
      const p = e.shiftKey && b.length > 0 ? snapSegmentEndTo45(b[b.length - 1]!, raw) : raw
      setBuilding((prev) => {
        const last = prev[prev.length - 1]
        if (last && dist2(last, p) < 4) return prev
        return [...prev, p]
      })
      if (b.length === 0) onClearPathSelection()
    },
    [pathToolActive, rulerMode, onTogglePathKey, onClearPathSelection, finishBuilding, onRulerLineComplete]
  )

  const onSvgDoubleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (rulerMode || !pathToolActive) return
      e.preventDefault()
      if (buildingRef.current.length >= 3) finishBuilding()
    },
    [pathToolActive, rulerMode, finishBuilding]
  )

  const onSvgPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if ((!rectangleToolActive && !countToolActive && !countMarkToolActive) || !svgRef.current || e.button !== 0)
        return
      const target = e.target as Element
      if (target.closest('[data-path-key]')) return
      const p = eventToNorm1000(e, svgRef.current)
      setRectDrag({ start: p, current: p })
      svgRef.current.setPointerCapture(e.pointerId)
    },
    [rectangleToolActive, countToolActive, countMarkToolActive]
  )

  const onSvgPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (pathDragRef.current && svgRef.current) {
        setPathDrag((prev) => {
          if (!prev || !svgRef.current) return prev
          const cur = eventToNorm1000(e, svgRef.current)
          return {
            ...prev,
            previewPoints: translatePolygonByDeltaClamped(
              prev.basePoints,
              cur.x - prev.startNorm.x,
              cur.y - prev.startNorm.y
            )
          }
        })
      }
      if (pathToolActive && svgRef.current && buildingRef.current.length > 0) {
        setPathShiftSnap(e.shiftKey)
        setCursorNorm(eventToNorm1000(e, svgRef.current))
      }
      if ((rectangleToolActive || countToolActive || countMarkToolActive) && rectDragRef.current && svgRef.current) {
        const p = eventToNorm1000(e, svgRef.current)
        setRectDrag((d) => (d ? { ...d, current: p } : null))
      }
    },
    [pathToolActive, rulerMode, rectangleToolActive, countToolActive, countMarkToolActive]
  )

  const onPathPolygonPointerDown = useCallback(
    (e: React.PointerEvent, key: string, basePoints: { x: number; y: number }[]) => {
      if (
        !(pathToolActive || rectangleToolActive || countMarkToolActive) ||
        rulerMode ||
        countToolActive ||
        !onCommitPathMove ||
        e.button !== 0
      )
        return
      const svg = svgRef.current
      if (!svg) return
      e.preventDefault()
      e.stopPropagation()
      const snapshot = basePoints.map((p) => ({ ...p }))
      const next: PathDragState = {
        key,
        startNorm: eventToNorm1000(e, svg),
        basePoints: snapshot,
        previewPoints: snapshot.map((p) => ({ ...p })),
        pointerId: e.pointerId,
        additive: Boolean(e.shiftKey || e.metaKey || e.ctrlKey)
      }
      pathDragRef.current = next
      setPathDrag(next)
      svg.setPointerCapture(e.pointerId)
    },
    [pathToolActive, rectangleToolActive, countMarkToolActive, rulerMode, countToolActive, onCommitPathMove]
  )

  const onSvgPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const pd = pathDragRef.current
      if (pd && e.pointerId === pd.pointerId) {
        svgRef.current.releasePointerCapture(e.pointerId)
        const moved = pd.basePoints.some((p, i) => dist2(p, pd.previewPoints[i]!) > PATH_DRAG_THRESHOLD_NORM2)
        suppressClickRef.current = true
        if (moved && onCommitPathMove) onCommitPathMove(pd.key, pd.previewPoints.map((p) => ({ ...p })))
        else onTogglePathKey(pd.key, pd.additive)
        pathDragRef.current = null
        setPathDrag(null)
        return
      }
      const d = rectDragRef.current
      if (!d) return
      if (countMarkToolActive) {
        setRectDrag(null)
        svgRef.current.releasePointerCapture(e.pointerId)
        finishCountMark(d.start, d.current)
        return
      }
      if (countToolActive) {
        setRectDrag(null)
        svgRef.current.releasePointerCapture(e.pointerId)
        finishCountSearchRect(d.start, d.current)
        return
      }
      if (!rectangleToolActive) return
      setRectDrag(null)
      svgRef.current.releasePointerCapture(e.pointerId)
      finishRectDrag(d.start, d.current)
    },
    [
      rectangleToolActive,
      countToolActive,
      countMarkToolActive,
      finishRectDrag,
      finishCountSearchRect,
      finishCountMark,
      onCommitPathMove,
      onTogglePathKey
    ]
  )

  if (
    !drawingInteractive &&
    draftPaths.length === 0 &&
    itemPaths.length === 0 &&
    countMarks.length === 0 &&
    itemCountMarks.length === 0
  )
    return null

  const previewCursor =
    building.length > 0 && cursorNorm
      ? pathToolActive && pathShiftSnap
        ? snapSegmentEndTo45(building[building.length - 1]!, cursorNorm)
        : cursorNorm
      : null
  const buildingLine =
    building.length > 0 && previewCursor
      ? `${pointsAttr(building)} ${previewCursor.x},${previewCursor.y}`
      : building.length > 1
        ? pointsAttr(building)
        : null

  let previewRect: { x: number; y: number; w: number; h: number } | null = null
  if (rectDrag) {
    const x1 = Math.min(rectDrag.start.x, rectDrag.current.x)
    const x2 = Math.max(rectDrag.start.x, rectDrag.current.x)
    const y1 = Math.min(rectDrag.start.y, rectDrag.current.y)
    const y2 = Math.max(rectDrag.start.y, rectDrag.current.y)
    previewRect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
  }

  const displayPts = (key: string, pts: { x: number; y: number }[]): { x: number; y: number }[] =>
    pathDrag && pathDrag.key === key ? pathDrag.previewPoints : pts

  const renderCountSquare = (key: string, mark: { x: number; y: number; w: number; h: number }, label: number) => {
    const selected = selectedPathKeys.has(key)
    const pts = displayPts(key, countMarkPoints(mark))
    const box = rectFromPoints(pts)
    return (
      <g key={key}>
        <rect
          data-path-key={key}
          x={box.x}
          y={box.y}
          width={Math.max(0, box.w)}
          height={Math.max(0, box.h)}
          fill={COUNT_MARK_FILL}
          stroke={COUNT_MARK_STROKE}
          strokeWidth={selected ? 2.5 : 2}
          strokeDasharray={selected ? '8 4' : undefined}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(e) => onPathPolygonPointerDown(e, key, countMarkPoints(mark))}
        />
        <text
          className="pointer-events-none select-none"
          x={box.x + box.w / 2}
          y={box.y + box.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={OVERLAY_LABEL_FONT}
          fill="#9a3412"
          stroke="#ffffff"
          strokeWidth={OVERLAY_LABEL_STROKE}
          paintOrder="stroke"
          vectorEffect="non-scaling-stroke"
        >
          {label}
        </text>
      </g>
    )
  }

  const { rx, ry } = {
    rx: HANDLE_RADIUS_PX / (svgPixelSize.w / VB),
    ry: HANDLE_RADIUS_PX / (svgPixelSize.h / VB)
  }

  return (
    <svg
      ref={svgRef}
      className="absolute z-5 overflow-visible"
      viewBox={`0 0 ${VB} ${VB}`}
      preserveAspectRatio="none"
      style={{
        left: `${contentInset.x * 100}%`,
        top: `${contentInset.y * 100}%`,
        width: `${contentInset.w * 100}%`,
        height: `${contentInset.h * 100}%`,
        pointerEvents: overlayPointerInteractive ? 'auto' : 'none'
      }}
      onClick={onSvgClick}
      onDoubleClick={onSvgDoubleClick}
      onPointerDown={onSvgPointerDown}
      onPointerMove={onSvgPointerMove}
      onPointerUp={onSvgPointerUp}
    >
      {itemPaths.map(({ itemId, segmentIndex, path, color }) => {
        const key = itemPathOverlayKey(itemId, segmentIndex)
        const selected = selectedPathKeys.has(key)
        const pts = displayPts(key, path.points)
        return (
          <polygon
            key={key}
            data-path-key={key}
            points={pointsAttr(pts)}
            fill={itemPathFillForColor(color)}
            stroke={strokeForItemColor(color)}
            strokeWidth={selected ? 1.75 : 1.25}
            strokeDasharray={selected ? '10 6' : undefined}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => onPathPolygonPointerDown(e, key, path.points)}
          />
        )
      })}
      {draftPaths.map((d) => {
        const key = `draft:${d.id}`
        const selected = selectedPathKeys.has(key)
        const pts = displayPts(key, d.points)
        return (
          <polygon
            key={key}
            data-path-key={key}
            points={pointsAttr(pts)}
            fill="rgba(37,99,235,0.12)"
            stroke="#2563eb"
            strokeWidth={selected ? 1.75 : 1.25}
            strokeDasharray={selected ? '10 6' : undefined}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => onPathPolygonPointerDown(e, key, d.points)}
          />
        )
      })}
      {itemCountMarks.map((mark) =>
        renderCountSquare(itemCountMarkOverlayKey(mark.itemId, mark.index), mark, mark.index + 1)
      )}
      {countMarks.map((mark, index) => renderCountSquare(countMarkOverlayKey(mark.id), mark, index + 1))}
      {(rectangleToolActive || countToolActive || countMarkToolActive) && previewRect && previewRect.w > 0 && previewRect.h > 0 ? (
        <rect
          x={previewRect.x}
          y={previewRect.y}
          width={previewRect.w}
          height={previewRect.h}
          fill={
            countMarkToolActive
              ? COUNT_MARK_FILL
              : countToolActive
                ? 'rgba(124,58,237,0.14)'
                : 'rgba(37,99,235,0.12)'
          }
          stroke={countMarkToolActive ? COUNT_MARK_STROKE : countToolActive ? '#7c3aed' : '#2563eb'}
          strokeWidth={countMarkToolActive ? 2 : 1.25}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {countMarkToolActive && previewRect && (previewRect.w > 0 || previewRect.h > 0) ? (
        <text
          className="pointer-events-none select-none"
          x={previewRect.x + previewRect.w / 2}
          y={previewRect.y + previewRect.h / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={OVERLAY_LABEL_FONT}
          fill="#9a3412"
          stroke="#ffffff"
          strokeWidth={OVERLAY_LABEL_STROKE}
          paintOrder="stroke"
          vectorEffect="non-scaling-stroke"
        >
          {countMarks.length + 1}
        </text>
      ) : null}
      {rectangleToolActive && !countToolActive && !countMarkToolActive && previewRect && previewRect.w >= MIN_RECT_SIDE && previewRect.h >= MIN_RECT_SIDE ? (
        <text
          className="pointer-events-none select-none"
          x={previewRect.x + previewRect.w / 2}
          y={Math.max(12, previewRect.y - 8)}
          textAnchor="middle"
          fontSize={OVERLAY_LABEL_FONT}
          fill="#1e3a8a"
          stroke="#ffffff"
          strokeWidth={OVERLAY_LABEL_STROKE}
          paintOrder="stroke"
          vectorEffect="non-scaling-stroke"
        >
          {rectDragCaption(previewRect, documentScale)}
        </text>
      ) : null}
      <g className="pointer-events-none select-none">
        {itemPaths.map(({ itemId, segmentIndex, path }) => {
          const key = itemPathOverlayKey(itemId, segmentIndex)
          const pts = displayPts(key, path.points)
          const cap = polygonMeasurementCaption(pts, documentScale)
          if (!cap) return null
          const { x, y } = labelPointForPolygon(pts)
          return (
            <text
              key={`ml-${key}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={OVERLAY_LABEL_FONT}
              fill="#111827"
              stroke="#ffffff"
              strokeWidth={OVERLAY_LABEL_STROKE}
              paintOrder="stroke"
              vectorEffect="non-scaling-stroke"
            >
              {cap}
            </text>
          )
        })}
        {draftPaths.map((d) => {
          const key = `draft:${d.id}`
          const pts = displayPts(key, d.points)
          const cap = polygonMeasurementCaption(pts, documentScale)
          if (!cap) return null
          const { x, y } = labelPointForPolygon(pts)
          return (
            <text
              key={`ml-${key}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={OVERLAY_LABEL_FONT}
              fill="#111827"
              stroke="#ffffff"
              strokeWidth={OVERLAY_LABEL_STROKE}
              paintOrder="stroke"
              vectorEffect="non-scaling-stroke"
            >
              {cap}
            </text>
          )
        })}
      </g>
      {pathToolActive && building.length > 0 ? (
        <>
          {buildingLine ? (
            <polyline
              points={buildingLine}
              fill="none"
              stroke="#2563eb"
              strokeWidth={1.25}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {building.map((p, i) => (
            <ellipse
              key={`b-${i}`}
              cx={p.x}
              cy={p.y}
              rx={rx}
              ry={ry}
              fill={i === 0 && building.length >= 3 && !rulerMode ? '#16a34a' : '#2563eb'}
              stroke="#fff"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      ) : null}
    </svg>
  )
}
