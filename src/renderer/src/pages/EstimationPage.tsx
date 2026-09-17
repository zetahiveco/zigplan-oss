import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Trash2, Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IconButton } from '@/components/icon-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type {
  CostItemRecord,
  EstimateLineRecord,
  TakeoffGroupRecord,
  TakeoffItemRecord
} from '../../../shared/types'
import { loadEstimate, requireEstimateApi } from '@/lib/desktop-api'

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, '')
}

export function EstimationPage(): React.JSX.Element {
  const { projectId } = useParams()
  const [loading, setLoading] = useState(true)
  const [takeoffGroups, setTakeoffGroups] = useState<TakeoffGroupRecord[]>([])
  const [costItems, setCostItems] = useState<CostItemRecord[]>([])
  const [lines, setLines] = useState<EstimateLineRecord[]>([])

  const [addOpen, setAddOpen] = useState(false)
  const [addTakeoffItemId, setAddTakeoffItemId] = useState<string | null>(null)
  const [addCostItemId, setAddCostItemId] = useState('')
  const [addQtyPer, setAddQtyPer] = useState('1')

  const costById = useMemo(() => {
    const map = new Map<string, CostItemRecord>()
    for (const item of costItems) map.set(item.id, item)
    return map
  }, [costItems])

  const linesByTakeoff = useMemo(() => {
    const map = new Map<string, EstimateLineRecord[]>()
    for (const line of lines) {
      const list = map.get(line.takeoffItemId) ?? []
      list.push(line)
      map.set(line.takeoffItemId, list)
    }
    return map
  }, [lines])

  const takeoffItems = useMemo(
    () => takeoffGroups.flatMap((group) => group.items.map((item) => ({ group, item }))),
    [takeoffGroups]
  )

  const totals = useMemo(() => {
    let total = 0
    for (const { item } of takeoffItems) {
      const itemLines = linesByTakeoff.get(item.id) ?? []
      for (const line of itemLines) {
        const cost = costById.get(line.costItemId)
        if (!cost) continue
        total += item.quantity * line.quantityPerTakeoff * cost.price
      }
    }
    return total
  }, [takeoffItems, linesByTakeoff, costById])

  const load = async (id: string): Promise<void> => {
    const data = await loadEstimate(id)
    setTakeoffGroups(data.takeoffGroups)
    setCostItems(data.costItems)
    setLines(data.lines)
  }

  useEffect(() => {
    if (!projectId) return
    void load(projectId)
      .catch((err) => {
        console.error(err)
        toast.error(err instanceof Error ? err.message : 'Could not load estimate')
      })
      .finally(() => setLoading(false))
  }, [projectId])

  const openAddLine = (takeoffItemId: string): void => {
    setAddTakeoffItemId(takeoffItemId)
    setAddCostItemId('')
    setAddQtyPer('1')
    setAddOpen(true)
  }

  const linkedCostIds = (takeoffItemId: string): Set<string> =>
    new Set((linesByTakeoff.get(takeoffItemId) ?? []).map((line) => line.costItemId))

  const saveAddLine = async (): Promise<void> => {
    if (!projectId || !addTakeoffItemId) return
    if (!addCostItemId) {
      toast.error('Select a cost item')
      return
    }
    const quantityPerTakeoff = Number.parseFloat(addQtyPer)
    if (!Number.isFinite(quantityPerTakeoff) || quantityPerTakeoff < 0) {
      toast.error('Invalid cost qty per takeoff qty')
      return
    }
    try {
      await requireEstimateApi().addLine({
        projectId,
        takeoffItemId: addTakeoffItemId,
        costItemId: addCostItemId,
        quantityPerTakeoff
      })
      setAddOpen(false)
      toast.success('Cost item linked')
      await load(projectId)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Could not add cost item')
    }
  }

  const updateQtyPer = async (line: EstimateLineRecord, raw: string): Promise<void> => {
    if (!projectId) return
    const quantityPerTakeoff = Number.parseFloat(raw)
    if (!Number.isFinite(quantityPerTakeoff) || quantityPerTakeoff < 0) {
      toast.error('Invalid quantity')
      return
    }
    try {
      await requireEstimateApi().updateLine(projectId, line.id, { quantityPerTakeoff })
      await load(projectId)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Could not update quantity')
    }
  }

  const removeLine = async (lineId: string): Promise<void> => {
    if (!projectId) return
    try {
      await requireEstimateApi().removeLine(projectId, lineId)
      await load(projectId)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Could not remove line')
    }
  }

  const downloadEstimate = async (): Promise<void> => {
    if (!projectId) return
    try {
      const csv = await requireEstimateApi().exportCsv(projectId)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `zigplan-estimate-${projectId.slice(0, 8)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Estimate downloaded')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Could not download estimate')
    }
  }

  const lineTotal = (takeoffQty: number, line: EstimateLineRecord): number => {
    const cost = costById.get(line.costItemId)
    if (!cost) return 0
    return takeoffQty * line.quantityPerTakeoff * cost.price
  }

  const renderTakeoffItem = (group: TakeoffGroupRecord, item: TakeoffItemRecord): React.JSX.Element => {
    const itemLines = linesByTakeoff.get(item.id) ?? []
    const subtotal = itemLines.reduce((sum, line) => sum + lineTotal(item.quantity, line), 0)
    return (
      <div key={item.id} className="border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {group.name} · Takeoff qty {formatQty(item.quantity)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium tabular-nums">{formatMoney(subtotal)}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => openAddLine(item.id)}>
              <Plus />
              Cost item
            </Button>
          </div>
        </div>
        {itemLines.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">
            No cost items yet. Add the materials or labor needed for each unit of this takeoff item.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cost item</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="w-40 text-right">Cost qty / takeoff qty</TableHead>
                <TableHead className="text-right">Extended qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemLines.map((line) => {
                const cost = costById.get(line.costItemId)
                const extendedQty = item.quantity * line.quantityPerTakeoff
                return (
                  <TableRow key={line.id}>
                    <TableCell className="font-medium">
                      {cost ? (
                        <>
                          {cost.name}
                          <span className="ml-2 text-xs text-muted-foreground">{cost.code}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Missing cost item</span>
                      )}
                    </TableCell>
                    <TableCell>{cost?.unit ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cost ? formatMoney(cost.price) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        className="ml-auto h-8 w-24 text-right"
                        defaultValue={String(line.quantityPerTakeoff)}
                        key={`${line.id}:${line.quantityPerTakeoff}`}
                        onBlur={(e) => {
                          if (e.target.value === String(line.quantityPerTakeoff)) return
                          void updateQtyPer(line, e.target.value)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatQty(extendedQty)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(lineTotal(item.quantity, line))}
                    </TableCell>
                    <TableCell className="text-right">
                      <IconButton tooltip="Remove" onClick={() => void removeLine(line.id)}>
                        <Trash2 />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    )
  }

  const availableCostItems =
    addTakeoffItemId == null
      ? costItems
      : costItems.filter((item) => !linkedCostIds(addTakeoffItemId).has(item.id))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Estimation</h2>
          <p className="text-sm text-muted-foreground">
            For each takeoff item, choose cost items and how much cost qty is needed per takeoff qty.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button type="button" variant="outline" onClick={() => void downloadEstimate()}>
            <Download />
            Download CSV
          </Button>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Estimate total</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(totals)}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading estimate…</p>
        ) : takeoffItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No takeoff items yet. Add groups and items in Takeoff first.
          </p>
        ) : costItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cost items yet. Add materials and labor in Cost Catalog, then link them here.
          </p>
        ) : (
          <div className="space-y-4">
            {takeoffGroups.map((group) =>
              group.items.length === 0 ? null : (
                <div key={group.id} className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">{group.name}</h3>
                  {group.items.map((item) => renderTakeoffItem(group, item))}
                </div>
              )
            )}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add cost item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label>Cost item</Label>
              {availableCostItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">All cost items are already linked.</p>
              ) : (
                <Select
                  value={addCostItemId || null}
                  onValueChange={(value) => {
                    if (value) setAddCostItemId(value)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {availableCostItems.find((item) => item.id === addCostItemId)?.name ??
                        'Select a cost item'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableCostItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        <span className="text-muted-foreground">
                          {item.unit} · {formatMoney(item.price)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qty-per">Cost qty per takeoff qty</Label>
              <Input
                id="qty-per"
                value={addQtyPer}
                placeholder="1"
                onChange={(e) => setAddQtyPer(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Example: 2 means each 1 takeoff unit needs 2 of this cost item.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={availableCostItems.length === 0}
              onClick={() => void saveAddLine()}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
