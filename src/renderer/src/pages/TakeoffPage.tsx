import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Hand, PenTool, Plus, Ruler, Scissors, Search, Square, Tally5, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IconButton } from '@/components/icon-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { TakeoffDocumentWorkspace } from '@/takeoff/workspace'
import {
  axisAlignedRectSizeNorm,
  buildTakeoffDocumentScaleJson,
  parseTakeoffDocumentScale,
  polygonsRealArea,
  realPerNormAxesFromRuler,
  rectangleRealDimensions,
  TAKEOFF_DOCUMENT_SCALE_V
} from '@/takeoff/document-scale'
import {
  buildTakeoffCountPathsBundle,
  buildTakeoffPathsBundle,
  DEFAULT_TAKEOFF_PATH_COLOR,
  itemCountMarkOverlayKey,
  itemPathOverlayKey,
  parseItemCountMarkOverlayKey,
  parseItemPathOverlayKey,
  parseTakeoffCountPathsBundle,
  parseTakeoffCountPathsForDocument,
  parseTakeoffItemPathsForDocument,
  polygonAreaNorm,
  type TakeoffDraftPath
} from '@/takeoff/path-types'
import {
  countMarkOverlayKey,
  parseCountMarkOverlayKey,
  rectFromPoints,
  type TakeoffCountMark,
  type TakeoffNormRect
} from '@/takeoff/path-overlay'
import { classifyTakeoffSnipKind, runTakeoffCountSearch, type NormBBox } from '@/takeoff/snip-search'
import type { DocumentRecord, TakeoffGroupRecord, TakeoffItemRecord } from '../../../shared/types'
import {
  documentScale,
  isPdfDocument,
  pdfPageSelectorName,
  pdfPageSheetId
} from '../../../shared/pdf-sheets'
import { desktopApi, saveDocumentPageCount, saveDocumentScale } from '@/lib/desktop-api'
import { getPdfPageCount } from '@/takeoff/pdf-page-count'

type Tool = 'pan' | 'path' | 'rectangle' | 'count' | 'find' | 'snip'

type ItemDraft = {
  name: string
  quantity: string
  length: string
  breadth: string
  height: string
  area: string
  color: string
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}

function TakeoffToolButton({
  label,
  active,
  onClick,
  children
}: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <IconButton
      tooltip={label}
      tooltipSide="bottom"
      size="icon-sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
    >
      {children}
    </IconButton>
  )
}

function parseNonNeg(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

/** Empty string is allowed (unset). Invalid numbers return false. */
function parseOptionalNonNeg(value: string): number | null | false {
  if (value.trim() === '') return null
  const n = parseNonNeg(value)
  return n === null ? false : n
}

type TakeoffSheet = {
  sheetId: string
  document: DocumentRecord
  pageNumber: number
  label: string
}

function expandTakeoffSheets(docs: DocumentRecord[]): TakeoffSheet[] {
  const out: TakeoffSheet[] = []
  for (const doc of docs) {
    const pdf = isPdfDocument(doc.fileType, doc.fileName)
    const pageCount = pdf ? Math.max(1, doc.pageCount ?? 1) : 1
    if (!pdf || pageCount <= 1) {
      out.push({ sheetId: doc.id, document: doc, pageNumber: 1, label: doc.fileName })
      continue
    }
    for (let page = 1; page <= pageCount; page++) {
      out.push({
        sheetId: pdfPageSheetId(doc.id, page, pageCount),
        document: doc,
        pageNumber: page,
        label: pdfPageSelectorName(doc.fileName, page)
      })
    }
  }
  return out
}

export function TakeoffPage(): React.JSX.Element {
  const { projectId } = useParams()
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [groups, setGroups] = useState<TakeoffGroupRecord[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [activeTool, setActiveTool] = useState<Tool>('pan')
  const [draftPaths, setDraftPaths] = useState<TakeoffDraftPath[]>([])
  const [selectedPathKeys, setSelectedPathKeys] = useState<Set<string>>(() => new Set())
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [addItemGroupId, setAddItemGroupId] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [newItemQuantity, setNewItemQuantity] = useState('1')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemDraft, setEditingItemDraft] = useState<ItemDraft>({
    name: '',
    quantity: '1',
    length: '',
    breadth: '',
    height: '',
    area: '',
    color: ''
  })
  const [countMarks, setCountMarks] = useState<TakeoffCountMark[]>([])
  const [countRects, setCountRects] = useState<NormBBox[]>([])
  const [countUi, setCountUi] = useState({ count: 0, searching: false, searched: false })
  const countSessionRef = useRef(0)
  const countAbortRef = useRef<AbortController | null>(null)
  const [findQuery, setFindQuery] = useState('')
  const [findUi, setFindUi] = useState({ count: 0, searching: false })
  const [rulerMode, setRulerMode] = useState(false)
  const [rulerSegment, setRulerSegment] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(
    null
  )
  const [scaleDialogOpen, setScaleDialogOpen] = useState(false)
  const [scaleFormLength, setScaleFormLength] = useState('')
  const [scaleFormUnit, setScaleFormUnit] = useState('ft')
  const [documentAspect, setDocumentAspect] = useState<number | null>(null)
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false)

  const load = useCallback(async (id: string) => {
    const [docs, takeoff] = await Promise.all([desktopApi().documents.list(id), desktopApi().takeoff.list(id)])
    const withCounts = await Promise.all(
      docs.map(async (doc) => {
        if (!isPdfDocument(doc.fileType, doc.fileName)) return doc
        try {
          const pageCount = await getPdfPageCount(doc.url)
          if (pageCount !== doc.pageCount) {
            void saveDocumentPageCount(doc.id, pageCount)
          }
          return { ...doc, pageCount }
        } catch (err) {
          console.error(err)
          return doc
        }
      })
    )
    setDocuments(withCounts)
    setGroups(takeoff)
  }, [])

  useEffect(() => {
    if (!projectId) return
    void load(projectId).catch((err) => {
      console.error(err)
      toast.error('Could not load takeoff')
    })
  }, [projectId, load])

  useEffect(() => {
    setDraftPaths([])
    setCountMarks([])
    setSelectedPathKeys(new Set())
    countSessionRef.current += 1
    countAbortRef.current?.abort()
    setCountRects([])
    setCountUi({ count: 0, searching: false, searched: false })
    setFindQuery('')
    setRulerMode(false)
    setRulerSegment(null)
    setDocumentAspect(null)
  }, [selectedDocumentId])

  useEffect(() => {
    if (activeTool === 'snip') return
    countSessionRef.current += 1
    countAbortRef.current?.abort()
    setCountRects([])
    setCountUi({ count: 0, searching: false, searched: false })
  }, [activeTool])

  useEffect(() => {
    if (activeTool !== 'path') setRulerMode(false)
  }, [activeTool])

  const sheets = useMemo(() => expandTakeoffSheets(documents), [documents])
  const sheetGroups = useMemo(() => {
    const map = new Map<string, { fileName: string; sheets: TakeoffSheet[] }>()
    for (const sheet of sheets) {
      const current = map.get(sheet.document.id) ?? { fileName: sheet.document.fileName, sheets: [] }
      current.sheets.push(sheet)
      map.set(sheet.document.id, current)
    }
    return [...map.values()]
  }, [sheets])

  useEffect(() => {
    if (sheets.length === 0) {
      setSelectedDocumentId('')
      return
    }
    setSelectedDocumentId((prev) => (prev && sheets.some((sheet) => sheet.sheetId === prev) ? prev : sheets[0]!.sheetId))
  }, [sheets])

  const selectedSheet = sheets.find((sheet) => sheet.sheetId === selectedDocumentId) ?? null
  const selectedDocument = selectedSheet?.document ?? null
  const selectedDocumentScale = parseTakeoffDocumentScale(
    selectedSheet
      ? documentScale(selectedSheet.document.scale, selectedSheet.document.pageScales)
      : undefined
  )

  const itemPathsForOverlay = useMemo(() => {
    if (!selectedDocumentId) return []
    const out: {
      itemId: string
      segmentIndex: number
      path: ReturnType<typeof parseTakeoffItemPathsForDocument>[number]
      color: string | null
    }[] = []
    for (const group of groups) {
      for (const item of group.items) {
        parseTakeoffItemPathsForDocument(item, selectedDocumentId).forEach((path, segmentIndex) => {
          out.push({ itemId: item.id, segmentIndex, path, color: item.color })
        })
      }
    }
    return out
  }, [groups, selectedDocumentId])

  const itemCountMarksForOverlay = useMemo(() => {
    if (!selectedDocumentId) return []
    const out: { itemId: string; index: number; x: number; y: number; w: number; h: number }[] = []
    for (const group of groups) {
      for (const item of group.items) {
        parseTakeoffCountPathsForDocument(item.countPaths, selectedDocumentId).forEach((rect, index) => {
          out.push({ itemId: item.id, index, ...rect })
        })
      }
    }
    return out
  }, [groups, selectedDocumentId])

  const overlayPathKeys = useMemo(() => {
    const keys: string[] = []
    for (const draft of draftPaths) keys.push(`draft:${draft.id}`)
    for (const path of itemPathsForOverlay) keys.push(itemPathOverlayKey(path.itemId, path.segmentIndex))
    for (const mark of itemCountMarksForOverlay) keys.push(itemCountMarkOverlayKey(mark.itemId, mark.index))
    for (const mark of countMarks) keys.push(countMarkOverlayKey(mark.id))
    return keys
  }, [draftPaths, itemPathsForOverlay, itemCountMarksForOverlay, countMarks])

  const hasAnyPathsOnDocument = overlayPathKeys.length > 0
  const allPathsSelected = hasAnyPathsOnDocument && overlayPathKeys.every((key) => selectedPathKeys.has(key))

  const selectAllPaths = useCallback(() => {
    setSelectedPathKeys(new Set(overlayPathKeys))
  }, [overlayPathKeys])

  const unselectAllPaths = useCallback(() => {
    setSelectedPathKeys(new Set())
  }, [])

  const deleteSelectedPaths = useCallback(async () => {
    if (!projectId || !selectedDocumentId) return
    const keys = [...selectedPathKeys]
    if (keys.length === 0) return

    const draftIds = new Set(keys.filter((key) => key.startsWith('draft:')).map((key) => key.slice('draft:'.length)))
    const countIds = new Set(
      keys.map((key) => parseCountMarkOverlayKey(key)).filter((id): id is string => Boolean(id))
    )
    type Removal = { all: true } | { all: false; indices: Set<number> }
    const itemRemovals = new Map<string, Removal>()
    const itemCountRemovals = new Map<string, Set<number>>()
    for (const key of keys) {
      const countParsed = parseItemCountMarkOverlayKey(key)
      if (countParsed) {
        const indices = itemCountRemovals.get(countParsed.itemId) ?? new Set<number>()
        indices.add(countParsed.index)
        itemCountRemovals.set(countParsed.itemId, indices)
        continue
      }
      if (!key.startsWith('item:')) continue
      const parsed = parseItemPathOverlayKey(key)
      if (!parsed) continue
      if (parsed.segmentIndex === null) {
        itemRemovals.set(parsed.itemId, { all: true })
        continue
      }
      const current = itemRemovals.get(parsed.itemId)
      if (current?.all) continue
      const indices = current && !current.all ? current.indices : new Set<number>()
      indices.add(parsed.segmentIndex)
      itemRemovals.set(parsed.itemId, { all: false, indices })
    }

    setSelectedPathKeys(new Set())
    if (draftIds.size > 0) {
      setDraftPaths((prev) => prev.filter((draft) => !draftIds.has(draft.id)))
    }
    if (countIds.size > 0) {
      setCountMarks((prev) => prev.filter((mark) => !countIds.has(mark.id)))
    }

    const itemIds = new Set([...itemRemovals.keys(), ...itemCountRemovals.keys()])
    if (itemIds.size > 0) {
      try {
        for (const itemId of itemIds) {
          const item = groups.flatMap((group) => group.items).find((entry) => entry.id === itemId)
          if (!item) continue
          const patch: Partial<
            Pick<TakeoffItemRecord, 'path' | 'documentId' | 'area' | 'color' | 'countPaths' | 'quantity'>
          > = {}
          const pathRemoval = itemRemovals.get(itemId)
          if (pathRemoval) {
            if (pathRemoval.all) {
              patch.path = null
              patch.documentId = null
              patch.area = null
            } else {
              const existing = parseTakeoffItemPathsForDocument(item, selectedDocumentId)
              const nextPolys = existing.filter((_, index) => !pathRemoval.indices.has(index)).map((path) => path.points)
              if (nextPolys.length === 0) {
                patch.path = null
                patch.documentId = null
                patch.area = null
              } else {
                patch.path = buildTakeoffPathsBundle(selectedDocumentId, nextPolys)
                patch.documentId = selectedDocumentId
                patch.area = nextPolys.reduce((sum, points) => sum + polygonAreaNorm(points), 0)
                patch.color = item.color || DEFAULT_TAKEOFF_PATH_COLOR
              }
            }
          }
          const countIndices = itemCountRemovals.get(itemId)
          if (countIndices) {
            const existing = parseTakeoffCountPathsForDocument(item.countPaths, selectedDocumentId)
            const nextRects = existing.filter((_, index) => !countIndices.has(index))
            patch.countPaths = nextRects.length > 0 ? buildTakeoffCountPathsBundle(selectedDocumentId, nextRects) : null
            patch.quantity = nextRects.length
          }
          await desktopApi().takeoff.updateItem(itemId, patch)
        }
        await load(projectId)
        toast.success(keys.length === 1 ? 'Removed' : `${keys.length} drawings removed`)
      } catch (err) {
        console.error(err)
        toast.error('Could not remove one or more drawings')
      }
    } else if (draftIds.size > 0 || countIds.size > 0) {
      const removed = draftIds.size + countIds.size
      toast.success(removed === 1 ? 'Removed' : `${removed} marks removed`)
    }
  }, [projectId, selectedDocumentId, selectedPathKeys, groups, load])

  const requestDeleteSelected = useCallback(() => {
    if (selectedPathKeys.size === 0) return
    setDeleteSelectedOpen(true)
  }, [selectedPathKeys.size])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      if (deleteSelectedOpen || scaleDialogOpen || addGroupOpen || addItemGroupId != null) return
      if (isTypingTarget(e.target)) return
      if (selectedPathKeys.size === 0) return
      e.preventDefault()
      setDeleteSelectedOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelectedOpen, scaleDialogOpen, addGroupOpen, addItemGroupId, selectedPathKeys.size])

  const toggleSelectedPathKey = useCallback((key: string, additive: boolean) => {
    setSelectedPathKeys((prev) => {
      if (additive) {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }
      if (prev.size === 1 && prev.has(key)) return new Set()
      return new Set([key])
    })
  }, [])

  const handleCommitPathMove = useCallback(
    async (key: string, nextPoints: { x: number; y: number }[]) => {
      if (key.startsWith('draft:')) {
        const id = key.slice('draft:'.length)
        setDraftPaths((prev) => prev.map((d) => (d.id === id ? { ...d, points: nextPoints } : d)))
        return
      }
      const countId = parseCountMarkOverlayKey(key)
      if (countId) {
        const box = rectFromPoints(nextPoints)
        setCountMarks((prev) => prev.map((mark) => (mark.id === countId ? { ...mark, ...box } : mark)))
        return
      }
      const tally = parseItemCountMarkOverlayKey(key)
      if (tally && selectedDocumentId) {
        const item = groups.flatMap((g) => g.items).find((it) => it.id === tally.itemId)
        if (!item) return
        const rects = parseTakeoffCountPathsForDocument(item.countPaths, selectedDocumentId)
        if (!rects[tally.index]) return
        rects[tally.index] = rectFromPoints(nextPoints)
        await desktopApi().takeoff.updateItem(item.id, {
          countPaths: buildTakeoffCountPathsBundle(selectedDocumentId, rects)
        })
        if (projectId) await load(projectId)
        return
      }
      const parsed = parseItemPathOverlayKey(key)
      if (!parsed || parsed.segmentIndex === null || !selectedDocumentId) return
      const item = groups.flatMap((g) => g.items).find((it) => it.id === parsed.itemId)
      if (!item) return
      const paths = parseTakeoffItemPathsForDocument(item, selectedDocumentId)
      paths[parsed.segmentIndex] = { ...paths[parsed.segmentIndex]!, points: nextPoints }
      await desktopApi().takeoff.updateItem(item.id, {
        path: buildTakeoffPathsBundle(
          selectedDocumentId,
          paths.map((p) => p.points)
        ),
        area: polygonAreaNorm(nextPoints),
        documentId: selectedDocumentId
      })
      if (projectId) await load(projectId)
    },
    [groups, selectedDocumentId, projectId, load]
  )

  const selectedDrafts = useMemo(
    () => draftPaths.filter((d) => selectedPathKeys.has(`draft:${d.id}`)),
    [draftPaths, selectedPathKeys]
  )

  const handleCountSearchRect = useCallback(
    async (rect: TakeoffNormRect) => {
      if (!selectedDocument) return
      const kind = classifyTakeoffSnipKind(selectedDocument.fileType, selectedDocument.fileName)
      if (!kind) {
        toast.error('Snip search works on PDF, PNG, JPEG, or SVG')
        return
      }
      countSessionRef.current += 1
      const session = countSessionRef.current
      countAbortRef.current?.abort()
      const ac = new AbortController()
      countAbortRef.current = ac
      setCountRects([])
      setCountUi({ count: 0, searching: true, searched: false })
      try {
        const rects = await runTakeoffCountSearch({
          kind,
          url: selectedDocument.url,
          snipNorm: rect,
          pageNumber: selectedSheet?.pageNumber ?? 1,
          signal: ac.signal
        })
        if (session !== countSessionRef.current) return
        setCountRects(rects)
        setCountUi({ count: rects.length, searching: false, searched: true })
        if (rects.length === 0) {
          toast.message('No matches. Try a tighter box around one symbol.')
        } else {
          toast.success(`${rects.length} match${rects.length === 1 ? '' : 'es'}`)
        }
      } catch (error) {
        if (session !== countSessionRef.current) return
        console.error(error)
        setCountUi({ count: 0, searching: false, searched: true })
        toast.error('Snip search failed')
      }
    },
    [selectedDocument, selectedSheet]
  )

  const applyCountToItem = async (item: TakeoffItemRecord): Promise<void> => {
    if (!projectId || !selectedDocumentId) return
    if (countMarks.length > 0) {
      await assignCountMarksToItem(item, countMarks)
      return
    }
    if (!countUi.searched || countUi.searching) return
    await desktopApi().takeoff.updateItem(item.id, { quantity: countUi.count })
    await load(projectId)
    toast.success(`Quantity set to ${countUi.count}`)
  }

  const assignCountMarksToItem = async (
    item: TakeoffItemRecord,
    marks: TakeoffCountMark[]
  ): Promise<void> => {
    if (!projectId || !selectedDocumentId || marks.length === 0) return
    const existingBundle = parseTakeoffCountPathsBundle(item.countPaths)
    const existingRects =
      existingBundle?.documentId === selectedDocumentId ? existingBundle.rects : []
    const nextRects = [
      ...existingRects,
      ...marks.map((mark) => ({ x: mark.x, y: mark.y, w: mark.w, h: mark.h }))
    ]
    await desktopApi().takeoff.updateItem(item.id, {
      countPaths: buildTakeoffCountPathsBundle(selectedDocumentId, nextRects),
      quantity: nextRects.length
    })
    setCountMarks((prev) => prev.filter((mark) => !marks.some((sel) => sel.id === mark.id)))
    setSelectedPathKeys(new Set())
    await load(projectId)
    toast.success(`Assigned ${marks.length} count square${marks.length === 1 ? '' : 's'} to ${item.name}`)
  }

  const assignToItem = async (item: TakeoffItemRecord): Promise<void> => {
    if (!projectId || !selectedDocumentId) return
    const hasSelection = selectedPathKeys.size > 0
    const drafts = hasSelection ? selectedDrafts : draftPaths
    const marks = hasSelection
      ? countMarks.filter((mark) => selectedPathKeys.has(countMarkOverlayKey(mark.id)))
      : countMarks
    if (drafts.length === 0 && marks.length === 0) {
      toast.error('Draw a path, rectangle, or count square first, then assign it to an item')
      return
    }
    if (marks.length > 0 && drafts.length === 0) {
      await assignCountMarksToItem(item, marks)
      return
    }
    const polygons = drafts.map((d) => d.points)
    const scale = selectedDocumentScale
    const rectDims =
      polygons.length === 1 && scale ? rectangleRealDimensions(polygons[0]!, scale) : null
    const realArea = polygonsRealArea(polygons, scale)
    const patch: Partial<
      Pick<TakeoffItemRecord, 'path' | 'documentId' | 'area' | 'color' | 'length' | 'breadth' | 'countPaths' | 'quantity'>
    > = {
      path: buildTakeoffPathsBundle(selectedDocumentId, polygons),
      documentId: selectedDocumentId,
      area: realArea ?? polygons.reduce((sum, pts) => sum + polygonAreaNorm(pts), 0),
      color: item.color || DEFAULT_TAKEOFF_PATH_COLOR
    }
    if (rectDims) {
      patch.length = rectDims.length
      patch.breadth = rectDims.breadth
      patch.area = rectDims.area
    }
    if (marks.length > 0) {
      const existingBundle = parseTakeoffCountPathsBundle(item.countPaths)
      const existingRects =
        existingBundle?.documentId === selectedDocumentId ? existingBundle.rects : []
      const nextRects = [
        ...existingRects,
        ...marks.map((mark) => ({ x: mark.x, y: mark.y, w: mark.w, h: mark.h }))
      ]
      patch.countPaths = buildTakeoffCountPathsBundle(selectedDocumentId, nextRects)
      patch.quantity = nextRects.length
    }
    await desktopApi().takeoff.updateItem(item.id, patch)
    setDraftPaths((prev) => prev.filter((d) => !drafts.some((sel) => sel.id === d.id)))
    if (marks.length > 0) {
      setCountMarks((prev) => prev.filter((mark) => !marks.some((sel) => sel.id === mark.id)))
    }
    setSelectedPathKeys(new Set())
    await load(projectId)
    if (polygons.length === 1 && !rectDims && axisAlignedRectSizeNorm(polygons[0]!)) {
      toast.success(`Assigned to ${item.name}. Set a document scale to fill length and breadth.`)
    } else {
      toast.success(`Assigned to ${item.name}`)
    }
  }

  const beginEditItem = (item: TakeoffItemRecord): void => {
    setEditingItemId(item.id)
    setEditingItemDraft({
      name: item.name,
      quantity: String(item.quantity),
      length: item.length != null ? String(item.length) : '',
      breadth: item.breadth != null ? String(item.breadth) : '',
      height: item.height != null ? String(item.height) : '',
      area: item.area != null ? String(item.area) : '',
      color: item.color ?? ''
    })
  }

  const handleSaveItem = async (): Promise<void> => {
    if (!projectId || !editingItemId) return
    const name = editingItemDraft.name.trim()
    if (!name) {
      toast.error('Item name is required')
      return
    }
    const quantity = parseNonNeg(editingItemDraft.quantity.trim() === '' ? '1' : editingItemDraft.quantity)
    const length = parseOptionalNonNeg(editingItemDraft.length)
    const breadth = parseOptionalNonNeg(editingItemDraft.breadth)
    const height = parseOptionalNonNeg(editingItemDraft.height)
    const area = parseOptionalNonNeg(editingItemDraft.area)
    if (quantity === null || length === false || breadth === false || height === false || area === false) {
      toast.error('Quantity and dimensions must be zero or greater')
      return
    }
    await desktopApi().takeoff.updateItem(editingItemId, {
      name,
      quantity: Math.floor(quantity),
      length,
      breadth,
      height,
      area,
      color: editingItemDraft.color.trim() || null
    })
    setEditingItemId(null)
    await load(projectId)
    toast.success('Item updated')
  }

  const createGroup = async (): Promise<void> => {
    if (!projectId) return
    const name = newGroupName.trim()
    if (!name) {
      toast.error('Group name is required')
      return
    }
    await desktopApi().takeoff.createGroup(projectId, name)
    setNewGroupName('')
    setAddGroupOpen(false)
    await load(projectId)
  }

  const createItem = async (groupId: string): Promise<void> => {
    if (!projectId) return
    const name = newItemName.trim()
    if (!name) {
      toast.error('Item name is required')
      return
    }
    const quantity = parseNonNeg(newItemQuantity.trim() === '' ? '1' : newItemQuantity)
    if (quantity === null) {
      toast.error('Quantity must be zero or greater')
      return
    }
    await desktopApi().takeoff.createItem({ projectId, groupId, name, quantity: Math.floor(quantity) })
    setNewItemName('')
    setNewItemQuantity('1')
    setAddItemGroupId(null)
    await load(projectId)
  }

  const handleFindSearchStateChange = useCallback((state: { count: number; searching: boolean }) => {
    setFindUi((prev) => (prev.count === state.count && prev.searching === state.searching ? prev : state))
  }, [])

  const handleDocumentAspectChange = useCallback((aspect: number | null) => {
    setDocumentAspect((prev) => (prev === aspect ? prev : aspect))
  }, [])

  const selectedFileId = selectedSheet?.document.id
  const handlePdfPageCount = useCallback(
    (pageCount: number) => {
      if (!selectedFileId || pageCount < 1) return
      setDocuments((prev) => {
        const current = prev.find((doc) => doc.id === selectedFileId)
        if (!current || current.pageCount === pageCount) return prev
        return prev.map((doc) => (doc.id === selectedFileId ? { ...doc, pageCount } : doc))
      })
      void saveDocumentPageCount(selectedFileId, pageCount)
    },
    [selectedFileId]
  )

  const startRulerCalibration = (): void => {
    setActiveTool('path')
    setRulerMode(true)
    toast.message('Click two points on a known length. Hold Shift for 45°.')
  }

  const handleRulerLineComplete = useCallback((a: { x: number; y: number }, b: { x: number; y: number }) => {
    setRulerSegment({ a, b })
    setScaleFormLength('')
    setScaleFormUnit(parseTakeoffDocumentScale(selectedDocument?.scale)?.unit ?? 'ft')
    setScaleDialogOpen(true)
    setRulerMode(false)
  }, [selectedDocument?.scale])

  const handleSaveDocumentScale = async (): Promise<void> => {
    if (!selectedSheet || !rulerSegment) return
    const len = Number(scaleFormLength)
    const unit = scaleFormUnit.trim()
    if (!unit) {
      toast.error('Enter a unit (for example ft, m, or in).')
      return
    }
    if (!Number.isFinite(len) || len <= 0) {
      toast.error('Enter a positive real-world length for the ruler line.')
      return
    }
    const dx = rulerSegment.b.x - rulerSegment.a.x
    const dy = rulerSegment.b.y - rulerSegment.a.y
    const aspect = documentAspect ?? 1
    if (documentAspect == null) {
      toast.message('Page aspect not detected yet; calibration assumes a square page until the document finishes loading.')
    }
    const axes = realPerNormAxesFromRuler(dx, dy, aspect, len)
    if (!axes) {
      toast.error('Could not compute scale from that line.')
      return
    }
    const body = buildTakeoffDocumentScaleJson({
      v: TAKEOFF_DOCUMENT_SCALE_V,
      unit,
      realPerNormX: axes.realPerNormX,
      realPerNormY: axes.realPerNormY
    })
    const fileId = selectedSheet.document.id
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === fileId ? { ...doc, scale: body, pageScales: undefined } : doc))
    )
    try {
      await saveDocumentScale(fileId, body)
      setScaleDialogOpen(false)
      setRulerSegment(null)
      toast.success('Scale saved for this document')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Could not save scale')
    }
  }

  const toolHint =
    rulerMode
      ? 'Ruler: click two points on a known length. Hold Shift for 45°.'
      : activeTool === 'path'
        ? 'Click to draw. Hold Shift for 45° angles. Enter or double-click to finish.'
        : activeTool === 'rectangle'
          ? 'Drag a rectangle to measure length and breadth, then assign it to an item'
          : activeTool === 'count'
            ? countMarks.length > 0
              ? `${countMarks.length} counted — assign from the sidebar`
              : 'Draw a square on each item to count, then assign it to an item'
            : activeTool === 'snip'
              ? countUi.searching
                ? 'Searching matching symbols…'
                : countUi.searched
                  ? `${countUi.count} match${countUi.count === 1 ? '' : 'es'} — set an item quantity from the sidebar`
                  : 'Drag a box around one repeating symbol to find matches'
              : activeTool === 'find'
                ? findUi.searching
                  ? 'Searching text…'
                  : findQuery.trim()
                    ? `${findUi.count} match${findUi.count === 1 ? '' : 'es'}`
                    : 'Type to search text on this PDF or SVG'
                : draftPaths.length > 0
                  ? `${draftPaths.length} draft path(s) — assign from the sidebar`
                  : countMarks.length > 0
                    ? `${countMarks.length} counted — assign from the sidebar`
                    : 'Pan, draw, count, find text, snip-search symbols, or measure with the ruler'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 border-b">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-3 py-2">
          <TakeoffToolButton
            label="Pan"
            active={activeTool === 'pan' && !rulerMode}
            onClick={() => {
              setRulerMode(false)
              setActiveTool('pan')
            }}
          >
            <Hand />
          </TakeoffToolButton>
          <TakeoffToolButton
            label="Path"
            active={activeTool === 'path' && !rulerMode}
            onClick={() => {
              setRulerMode(false)
              setActiveTool('path')
            }}
          >
            <PenTool />
          </TakeoffToolButton>
          <TakeoffToolButton
            label="Rectangle"
            active={activeTool === 'rectangle'}
            onClick={() => {
              setRulerMode(false)
              setActiveTool('rectangle')
            }}
          >
            <Square />
          </TakeoffToolButton>
          <TakeoffToolButton
            label="Count"
            active={activeTool === 'count'}
            onClick={() => {
              setRulerMode(false)
              setActiveTool('count')
            }}
          >
            <Tally5 />
          </TakeoffToolButton>
          <TakeoffToolButton
            label="Search by text"
            active={activeTool === 'find'}
            onClick={() => {
              setRulerMode(false)
              setActiveTool('find')
            }}
          >
            <Search />
          </TakeoffToolButton>
          <TakeoffToolButton
            label="Search by snip"
            active={activeTool === 'snip'}
            onClick={() => {
              setRulerMode(false)
              setActiveTool('snip')
            }}
          >
            <Scissors />
          </TakeoffToolButton>
          <TakeoffToolButton
            label="Ruler — measure and set scale"
            active={rulerMode}
            onClick={() => startRulerCalibration()}
          >
            <Ruler />
          </TakeoffToolButton>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Select
            value={selectedDocumentId || null}
            onValueChange={(value) => {
              if (value) setSelectedDocumentId(value)
            }}
          >
            <SelectTrigger className="min-w-64 max-w-md">
              <FileText />
              <SelectValue>
                {sheets.find((sheet) => sheet.sheetId === selectedDocumentId)?.label ?? 'No files yet'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-72" alignItemWithTrigger={false}>
              {sheetGroups.map((group) =>
                group.sheets.length > 1 ? (
                  <SelectGroup key={group.sheets[0]!.document.id}>
                    <SelectLabel>{group.fileName}</SelectLabel>
                    {group.sheets.map((sheet) => (
                      <SelectItem key={sheet.sheetId} value={sheet.sheetId}>
                        <FileText />
                        {sheet.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : (
                  <SelectItem key={group.sheets[0]!.sheetId} value={group.sheets[0]!.sheetId}>
                    <FileText />
                    {group.sheets[0]!.label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          {hasAnyPathsOnDocument ? (
            <>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <Button type="button" size="sm" variant="outline" disabled={allPathsSelected} onClick={selectAllPaths}>
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedPathKeys.size === 0}
                onClick={unselectAllPaths}
              >
                Unselect all
              </Button>
              {selectedPathKeys.size > 0 ? (
                <Button type="button" size="sm" variant="destructive" onClick={requestDeleteSelected}>
                  <Trash2 />
                  Delete selected
                </Button>
              ) : null}
            </>
          ) : null}
          {activeTool === 'find' ? (
            <Input
              className="max-w-56"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              placeholder="Search text…"
            />
          ) : null}
          <span className="text-xs text-muted-foreground">{toolHint}</span>
        </div>
        <div className="flex w-80 shrink-0 items-center justify-between border-l px-3 py-2">
          <div>
            <p className="text-sm font-semibold">Groups / Items</p>
            <p className="text-xs text-muted-foreground">
              {groups.length} groups · {groups.reduce((n, g) => n + g.items.length, 0)} items
              {countMarks.length > 0
                ? ` · Count: ${countMarks.length}`
                : activeTool === 'snip' && (countUi.searching || countUi.searched)
                  ? countUi.searching
                    ? ' · Count: …'
                    : ` · Count: ${countUi.count}`
                  : ''}
            </p>
          </div>
          <Button type="button" size="sm" onClick={() => setAddGroupOpen(true)}>
            <Plus />
            Group
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <TakeoffDocumentWorkspace
            documentUrl={selectedDocument?.url ?? null}
            fileName={selectedSheet?.label ?? selectedDocument?.fileName ?? ''}
            fileType={selectedDocument?.fileType ?? ''}
            pageNumber={selectedSheet?.pageNumber ?? 1}
            panEnabled={activeTool === 'pan' && !rulerMode}
            pathToolActive={activeTool === 'path'}
            rectangleToolActive={activeTool === 'rectangle'}
            countMarkToolActive={activeTool === 'count'}
            countMarks={countMarks}
            itemCountMarks={itemCountMarksForOverlay}
            onAppendCountMark={(mark) => setCountMarks((prev) => [...prev, mark])}
            countToolActive={activeTool === 'snip'}
            onCountSearchRect={(rect) => void handleCountSearchRect(rect)}
            countHighlightRects={countRects}
            rulerMode={rulerMode}
            onRulerLineComplete={handleRulerLineComplete}
            documentScale={selectedDocumentScale}
            findToolActive={activeTool === 'find'}
            findQuery={findQuery}
            onFindSearchStateChange={handleFindSearchStateChange}
            onDocumentAspectChange={handleDocumentAspectChange}
            onPdfPageCount={handlePdfPageCount}
            draftPaths={draftPaths}
            itemPathsForOverlay={itemPathsForOverlay}
            selectedPathKeys={selectedPathKeys}
            onTogglePathKey={toggleSelectedPathKey}
            onClearPathSelection={() => setSelectedPathKeys(new Set())}
            onSelectSinglePathKey={(key) => setSelectedPathKeys(new Set([key]))}
            onAppendDraft={(draft) => setDraftPaths((prev) => [...prev, draft])}
            onCommitPathMove={(key, pts) => void handleCommitPathMove(key, pts)}
          />
        </div>
        <aside className="flex w-80 shrink-0 flex-col border-l">
          <ScrollArea className="flex-1">
          <div className="space-y-3 p-3">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add a group, then items. Draw on the sheet and assign the path.</p>
            ) : null}
            {groups.map((group) => (
              <div key={group.id} className="border">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  <div className="flex items-center gap-1">
                    <IconButton tooltip="Add item" onClick={() => setAddItemGroupId(group.id)}>
                      <Plus />
                    </IconButton>
                    <IconButton
                      tooltip="Delete group"
                      onClick={() => {
                        if (!projectId) return
                        void desktopApi().takeoff.removeGroup(group.id).then(() => load(projectId))
                      }}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
                {group.items.map((item) => {
                  const pathOnDoc = selectedDocumentId
                    ? parseTakeoffItemPathsForDocument(item, selectedDocumentId).length > 0
                    : false
                  const countOnDoc = selectedDocumentId
                    ? parseTakeoffCountPathsForDocument(item.countPaths, selectedDocumentId).length
                    : 0
                  return (
                    <div key={item.id} className="border-t px-3 py-2">
                      {editingItemId === item.id ? (
                        <div className="grid gap-2">
                          <div className="grid gap-1.5">
                            <Label className="text-xs text-muted-foreground">Item name</Label>
                            <Input
                              value={editingItemDraft.name}
                              placeholder="e.g. Concrete slab"
                              onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, name: e.target.value }))}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1.5">
                              <Label className="text-xs text-muted-foreground">Quantity</Label>
                              <Input
                                value={editingItemDraft.quantity}
                                placeholder="0"
                                onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, quantity: e.target.value }))}
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs text-muted-foreground">Area</Label>
                              <Input
                                value={editingItemDraft.area}
                                onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, area: e.target.value }))}
                                placeholder="Optional"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs text-muted-foreground">Length</Label>
                              <Input
                                value={editingItemDraft.length}
                                placeholder="Optional"
                                onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, length: e.target.value }))}
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs text-muted-foreground">Breadth</Label>
                              <Input
                                value={editingItemDraft.breadth}
                                placeholder="Optional"
                                onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, breadth: e.target.value }))}
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs text-muted-foreground">Height</Label>
                              <Input
                                value={editingItemDraft.height}
                                placeholder="Optional"
                                onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, height: e.target.value }))}
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs text-muted-foreground">Color</Label>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="color"
                                  value={editingItemDraft.color || '#2563eb'}
                                  onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, color: e.target.value }))}
                                  className="h-8 w-10 p-1"
                                />
                                <Input
                                  value={editingItemDraft.color}
                                  onChange={(e) => setEditingItemDraft((prev) => ({ ...prev, color: e.target.value }))}
                                  placeholder="#2563eb"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" onClick={() => void handleSaveItem()}>
                              Save
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingItemId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            L:{item.length ?? '—'} B:{item.breadth ?? '—'} H:{item.height ?? '—'} A:
                            {item.area != null ? item.area : '—'}
                            {pathOnDoc ? ' · Has drawing' : ''}
                            {countOnDoc > 0 ? ` · ${countOnDoc} counted` : ''}
                            {!pathOnDoc && countOnDoc === 0 ? ' · No drawing' : ''}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Button type="button" size="xs" variant="outline" onClick={() => beginEditItem(item)}>
                              Edit
                            </Button>
                            <Button type="button" size="xs" variant="outline" onClick={() => void assignToItem(item)}>
                              Assign
                            </Button>
                            {countMarks.length > 0 ? (
                              <Button type="button" size="xs" variant="outline" onClick={() => void applyCountToItem(item)}>
                                Set qty {countMarks.length}
                              </Button>
                            ) : countUi.searched && !countUi.searching ? (
                              <Button type="button" size="xs" variant="outline" onClick={() => void applyCountToItem(item)}>
                                Set qty {countUi.count}
                              </Button>
                            ) : null}
                            <IconButton
                              tooltip="Delete item"
                              onClick={() => {
                                if (!projectId) return
                                void desktopApi().takeoff.removeItem(item.id).then(() => load(projectId))
                              }}
                            >
                              <Trash2 />
                            </IconButton>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>
      </div>

      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={newGroupName}
              placeholder="e.g. Foundations"
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddGroupOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createGroup()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addItemGroupId !== null} onOpenChange={(open) => !open && setAddItemGroupId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={newItemName}
              placeholder="e.g. Concrete slab"
              onChange={(e) => setNewItemName(e.target.value)}
              autoFocus
            />
            <Label htmlFor="item-qty">Quantity</Label>
            <Input
              id="item-qty"
              value={newItemQuantity}
              placeholder="1"
              onChange={(e) => setNewItemQuantity(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddItemGroupId(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => addItemGroupId && void createItem(addItemGroupId)}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteSelectedOpen} onOpenChange={setDeleteSelectedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPathKeys.size === 1
                ? 'This drawing will be removed from the sheet.'
                : `${selectedPathKeys.size} selected drawings will be removed from the sheet.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDeleteSelectedOpen(false)
                void deleteSelectedPaths()
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={scaleDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setScaleDialogOpen(false)
            setRulerSegment(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save scale for document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Enter the real-world length of the ruler line. This scale is stored on the document and used for on-canvas measurements.
          </p>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="takeoff-scale-length">Length</Label>
              <Input
                id="takeoff-scale-length"
                value={scaleFormLength}
                onChange={(e) => setScaleFormLength(e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="takeoff-scale-unit">Unit</Label>
              <Input
                id="takeoff-scale-unit"
                value={scaleFormUnit}
                onChange={(e) => setScaleFormUnit(e.target.value)}
                placeholder="ft, m, in, …"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setScaleDialogOpen(false)
                setRulerSegment(null)
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSaveDocumentScale()}>
              Save scale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
