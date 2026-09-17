import { TAKEOFF_PATH_NORM_VB, type TakeoffDocumentContentInset } from './path-types'
import type { NormBBox } from './snip-search-core'

const VB = TAKEOFF_PATH_NORM_VB
const FULL_CONTENT_INSET: TakeoffDocumentContentInset = { x: 0, y: 0, w: 1, h: 1 }

type CountHighlightLayerProps = {
  rects: NormBBox[]
  contentInset?: TakeoffDocumentContentInset
}

export function TakeoffCountHighlightLayer({
  rects,
  contentInset = FULL_CONTENT_INSET
}: CountHighlightLayerProps): React.JSX.Element | null {
  if (rects.length === 0) return null
  const { x, y, w, h } = contentInset
  return (
    <svg
      className="pointer-events-none absolute z-6 overflow-visible"
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
          fill="rgba(139, 92, 246, 0.22)"
          stroke="rgb(109 40 217)"
          strokeWidth={3}
        />
      ))}
    </svg>
  )
}
