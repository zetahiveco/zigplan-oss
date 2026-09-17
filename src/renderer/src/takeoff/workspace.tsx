import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import { IconButton } from '@/components/icon-button'
import { TakeoffPdfFirstPage } from './pdf-page'
import { TakeoffPathOverlay, type TakeoffCountMark, type TakeoffItemCountMark, type TakeoffNormRect } from './path-overlay'
import { TakeoffFindHighlightLayer, takeoffDocumentSupportsFind, useTakeoffFindHighlights } from './find-highlights'
import type { TakeoffDocumentScaleV1 } from './document-scale'
import type { TakeoffDocumentContentInset, TakeoffDraftPath, TakeoffPolygonPathV1 } from './path-types'
import type { NormBBox } from './snip-search-core'

type WorkspaceKind = 'pdf' | 'raster' | 'unsupported'

const MIN_SCALE = 1
const MAX_SCALE = 10
const ZOOM_FACTOR = 1.2
const FULL_CONTENT_INSET: TakeoffDocumentContentInset = { x: 0, y: 0, w: 1, h: 1 }

function clampContentInset(i: TakeoffDocumentContentInset): TakeoffDocumentContentInset {
  const w = Math.min(1, Math.max(1e-6, i.w))
  const h = Math.min(1, Math.max(1e-6, i.h))
  return {
    x: Math.min(Math.max(0, i.x), 1 - w),
    y: Math.min(Math.max(0, i.y), 1 - h),
    w,
    h
  }
}

function rasterObjectFitInset(cw: number, ch: number, iw: number, ih: number): TakeoffDocumentContentInset {
  if (cw <= 0 || ch <= 0 || iw <= 0 || ih <= 0) return FULL_CONTENT_INSET
  const scale = Math.min(cw / iw, ch / ih)
  const w = iw * scale
  const h = ih * scale
  return clampContentInset({ x: (cw - w) / (2 * cw), y: (ch - h) / (2 * ch), w: w / cw, h: h / ch })
}

function classifyWorkspaceKind(fileType: string, fileName: string): WorkspaceKind {
  const t = fileType.trim().toLowerCase()
  if (t === 'application/pdf') return 'pdf'
  if (t === 'image/png' || t === 'image/jpeg' || t === 'image/svg+xml') return 'raster'
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : undefined
  if (ext === 'pdf') return 'pdf'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'svg') return 'raster'
  return 'unsupported'
}

type ItemPathOverlay = { itemId: string; segmentIndex: number; path: TakeoffPolygonPathV1; color: string | null }

type TakeoffDocumentWorkspaceProps = {
  documentUrl: string | null
  fileName: string
  fileType: string
  pageNumber?: number
  panEnabled: boolean
  pathToolActive: boolean
  rectangleToolActive: boolean
  countToolActive?: boolean
  countMarkToolActive?: boolean
  countMarks?: TakeoffCountMark[]
  itemCountMarks?: TakeoffItemCountMark[]
  onAppendCountMark?: (mark: TakeoffCountMark) => void
  onCountSearchRect?: (rect: TakeoffNormRect) => void
  countHighlightRects?: NormBBox[]
  rulerMode?: boolean
  onRulerLineComplete?: (a: { x: number; y: number }, b: { x: number; y: number }) => void
  documentScale?: TakeoffDocumentScaleV1 | null
  findToolActive?: boolean
  findQuery?: string
  onFindSearchStateChange?: (state: { count: number; searching: boolean }) => void
  onDocumentAspectChange?: (aspect: number | null) => void
  onPdfPageCount?: (pageCount: number) => void
  draftPaths: TakeoffDraftPath[]
  itemPathsForOverlay: ItemPathOverlay[]
  selectedPathKeys: Set<string>
  onTogglePathKey: (key: string, additive: boolean) => void
  onClearPathSelection: () => void
  onSelectSinglePathKey: (key: string) => void
  onAppendDraft: (draft: TakeoffDraftPath) => void
  onCommitPathMove?: (key: string, nextPoints: { x: number; y: number }[]) => void
}

export function TakeoffDocumentWorkspace({
  documentUrl,
  fileName,
  fileType,
  pageNumber = 1,
  panEnabled,
  pathToolActive,
  rectangleToolActive,
  countToolActive = false,
  countMarkToolActive = false,
  countMarks = [],
  itemCountMarks = [],
  onAppendCountMark,
  onCountSearchRect,
  countHighlightRects = [],
  rulerMode = false,
  onRulerLineComplete,
  documentScale = null,
  findToolActive = false,
  findQuery = '',
  onFindSearchStateChange,
  onDocumentAspectChange,
  onPdfPageCount,
  draftPaths,
  itemPathsForOverlay,
  selectedPathKeys,
  onTogglePathKey,
  onClearPathSelection,
  onSelectSinglePathKey,
  onAppendDraft,
  onCommitPathMove
}: TakeoffDocumentWorkspaceProps): React.JSX.Element {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const dragging = useRef(false)
  const lastPointer = useRef({ x: 0, y: 0 })
  const rootRef = useRef<HTMLDivElement | null>(null)
  const artboardContentRef = useRef<HTMLDivElement | null>(null)
  const rasterImgRef = useRef<HTMLImageElement | null>(null)
  const [documentContentInset, setDocumentContentInset] = useState<TakeoffDocumentContentInset>(FULL_CONTENT_INSET)
  const kind = documentUrl ? classifyWorkspaceKind(fileType, fileName) : 'unsupported'

  useEffect(() => {
    setScale(1)
    setTx(0)
    setTy(0)
    setDocumentContentInset(FULL_CONTENT_INSET)
  }, [documentUrl, pageNumber])

  const measureRasterContentInset = useCallback(() => {
    const board = artboardContentRef.current
    const img = rasterImgRef.current
    if (!board) return
    const cw = board.clientWidth
    const ch = board.clientHeight
    if (cw <= 0 || ch <= 0) return
    if (!img?.naturalWidth || !img.naturalHeight) {
      setDocumentContentInset(FULL_CONTENT_INSET)
      return
    }
    setDocumentContentInset(rasterObjectFitInset(cw, ch, img.naturalWidth, img.naturalHeight))
  }, [])

  const onPdfDocumentContentInset = useCallback((inset: TakeoffDocumentContentInset) => {
    setDocumentContentInset(clampContentInset(inset))
  }, [])

  const showContent = Boolean(documentUrl && kind !== 'unsupported')
  const findFileMode = takeoffDocumentSupportsFind(fileType, fileName)
  const findSearchActive = Boolean(findToolActive && findFileMode && showContent && documentUrl)
  const { rects: findHighlightRects, searching: findSearching } = useTakeoffFindHighlights({
    url: findSearchActive ? documentUrl : null,
    query: findQuery,
    active: findSearchActive,
    mode: findSearchActive && findFileMode ? findFileMode : null,
    pageNumber
  })

  useEffect(() => {
    onFindSearchStateChange?.({
      count: findSearchActive ? findHighlightRects.length : 0,
      searching: Boolean(findSearchActive && findSearching)
    })
  }, [findSearchActive, findHighlightRects.length, findSearching, onFindSearchStateChange])

  useEffect(() => {
    const board = artboardContentRef.current
    if (!board || !showContent) {
      onDocumentAspectChange?.(null)
      return
    }
    const cw = board.clientWidth
    const ch = board.clientHeight
    if (cw <= 0 || ch <= 0 || documentContentInset.h <= 0) {
      onDocumentAspectChange?.(null)
      return
    }
    onDocumentAspectChange?.((documentContentInset.w * cw) / (documentContentInset.h * ch))
  }, [showContent, documentContentInset, onDocumentAspectChange])

  useLayoutEffect(() => {
    if (!showContent || kind === 'pdf') return
    measureRasterContentInset()
  }, [showContent, kind, measureRasterContentInset, documentUrl])

  useLayoutEffect(() => {
    const el = artboardContentRef.current
    if (!el || !showContent) return
    const ro = new ResizeObserver(() => {
      if (kind !== 'pdf') measureRasterContentInset()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [showContent, kind, measureRasterContentInset])

  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    setScale((prev) => {
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
      const ratio = clamped / prev
      setTx((x) => cx - (cx - x) * ratio)
      setTy((y) => cy - (cy - y) * ratio)
      return clamped
    })
  }, [])

  const resetView = useCallback(() => {
    setScale(1)
    setTx(0)
    setTy(0)
  }, [])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-muted">
      <div
        ref={rootRef}
        className={`relative min-h-0 flex-1 overflow-hidden ${pathToolActive || rectangleToolActive || countToolActive || countMarkToolActive || rulerMode ? 'cursor-crosshair' : ''}`}
        style={{ cursor: panEnabled ? 'grab' : undefined }}
        onWheel={(e) => {
          if (!showContent) return
          e.preventDefault()
          const root = rootRef.current
          if (!root) return
          const r = root.getBoundingClientRect()
          const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
          zoomAt(scale * factor, e.clientX - r.left, e.clientY - r.top)
        }}
        onPointerDown={(e) => {
          if (!panEnabled || e.button !== 0) return
          dragging.current = true
          lastPointer.current = { x: e.clientX, y: e.clientY }
          ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          const dx = e.clientX - lastPointer.current.x
          const dy = e.clientY - lastPointer.current.y
          lastPointer.current = { x: e.clientX, y: e.clientY }
          setTx((v) => v + dx)
          setTy((v) => v + dy)
        }}
        onPointerUp={() => {
          dragging.current = false
        }}
      >
        {findToolActive && showContent && !findFileMode ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-4">
            <p className="border bg-background/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              Search by text works on PDF and SVG files.
            </p>
          </div>
        ) : null}
        {!documentUrl ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            Add a PDF or image in Files, then come back to draw takeoff.
          </div>
        ) : kind === 'unsupported' ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            This file type cannot be drawn over.
          </div>
        ) : (
          <div
            className="absolute inset-0 origin-top-left"
            style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
          >
            <div ref={artboardContentRef} className="relative h-full w-full">
              {kind === 'pdf' && documentUrl ? (
                <TakeoffPdfFirstPage
                  url={documentUrl}
                  fileName={fileName}
                  pageNumber={pageNumber}
                  viewportZoom={scale}
                  onDocumentContentInset={onPdfDocumentContentInset}
                  onPageCount={onPdfPageCount}
                />
              ) : (
                <img
                  ref={rasterImgRef}
                  src={documentUrl ?? undefined}
                  alt={fileName}
                  className="h-full w-full object-contain"
                  onLoad={measureRasterContentInset}
                  draggable={false}
                />
              )}
              <TakeoffPathOverlay
                pathToolActive={pathToolActive}
                rectangleToolActive={rectangleToolActive}
                countToolActive={countToolActive}
                countMarkToolActive={countMarkToolActive}
                countMarks={countMarks}
                itemCountMarks={itemCountMarks}
                onAppendCountMark={onAppendCountMark}
                onCountSearchRect={onCountSearchRect}
                rulerMode={rulerMode}
                onRulerLineComplete={onRulerLineComplete}
                documentScale={documentScale}
                draftPaths={draftPaths}
                itemPaths={itemPathsForOverlay}
                selectedPathKeys={selectedPathKeys}
                onTogglePathKey={onTogglePathKey}
                onClearPathSelection={onClearPathSelection}
                onSelectSinglePathKey={onSelectSinglePathKey}
                onAppendDraft={onAppendDraft}
                onCommitPathMove={onCommitPathMove}
                contentInset={documentContentInset}
              />
              <TakeoffFindHighlightLayer
                rects={findToolActive && findFileMode ? findHighlightRects : []}
                contentInset={documentContentInset}
                variant="find"
              />
              <TakeoffFindHighlightLayer
                rects={countHighlightRects}
                contentInset={documentContentInset}
                variant="snip"
              />
            </div>
          </div>
        )}
      </div>
      <div className="absolute right-3 bottom-3 z-10 flex gap-1 border bg-background/90 p-1 shadow-sm">
        <IconButton tooltip="Zoom out" size="icon-sm" tooltipSide="top" onClick={() => zoomAt(scale / ZOOM_FACTOR, 0, 0)}>
          <Minus />
        </IconButton>
        <IconButton tooltip="Zoom in" size="icon-sm" tooltipSide="top" onClick={() => zoomAt(scale * ZOOM_FACTOR, 0, 0)}>
          <Plus />
        </IconButton>
        <IconButton tooltip="Reset view" size="icon-sm" tooltipSide="top" onClick={resetView}>
          <Maximize2 />
        </IconButton>
      </div>
    </div>
  )
}
