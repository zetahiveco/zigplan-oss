import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Copy, FolderKanban, FolderOpen, Pencil, Plus, Store, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CostGroupRecord, CostItemRecord, ProjectRecord, VendorRecord } from '../../../shared/types'
import { desktopApi } from '@/lib/desktop-api'

export function CostDatabasePage(): React.JSX.Element {
  const { projectId } = useParams()
  const [groups, setGroups] = useState<CostGroupRecord[]>([])
  const [items, setItems] = useState<CostItemRecord[]>([])
  const [vendors, setVendors] = useState<VendorRecord[]>([])
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [itemOpen, setItemOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CostItemRecord | null>(null)
  const [iName, setIName] = useState('')
  const [iCode, setICode] = useState('')
  const [iQty, setIQty] = useState('1')
  const [iUnit, setIUnit] = useState('ea')
  const [iPrice, setIPrice] = useState('0')
  const [iGroup, setIGroup] = useState('')
  const [iVendor, setIVendor] = useState('')

  const [groupOpen, setGroupOpen] = useState(false)
  const [gName, setGName] = useState('')
  const [groupParentId, setGroupParentId] = useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)

  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFromId, setCopyFromId] = useState('')

  const load = async (id: string): Promise<void> => {
    const [cost, vendorRows, projectRows] = await Promise.all([
      desktopApi().cost.list(id),
      desktopApi().vendors.list(),
      desktopApi().projects.list()
    ])
    setGroups(cost.groups)
    setItems(cost.items)
    setVendors(vendorRows)
    setProjects(projectRows.filter((row) => row.id !== id))
    setExpanded(new Set(cost.groups.map((g) => g.id)))
  }

  useEffect(() => {
    if (!projectId) return
    void load(projectId)
      .catch((err) => {
        console.error(err)
        toast.error('Could not load cost database')
      })
      .finally(() => setLoading(false))
  }, [projectId])

  const itemsByGroup = useMemo(() => {
    const map = new Map<string | null, CostItemRecord[]>()
    for (const item of items) {
      const key = item.groupId ?? null
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return map
  }, [items])

  const groupsByParent = useMemo(() => {
    const map = new Map<string | null, CostGroupRecord[]>()
    for (const group of groups) {
      const key = group.parentId ?? null
      const list = map.get(key) ?? []
      list.push(group)
      map.set(key, list)
    }
    return map
  }, [groups])

  const openNewItem = (groupId?: string | null): void => {
    setEditingItem(null)
    setIName('')
    setICode('')
    setIQty('1')
    setIUnit('ea')
    setIPrice('0')
    setIGroup(groupId ?? '')
    setIVendor('')
    setItemOpen(true)
  }

  const openEditItem = (row: CostItemRecord): void => {
    setEditingItem(row)
    setIName(row.name)
    setICode(row.code)
    setIQty(String(row.quantity))
    setIUnit(row.unit)
    setIPrice(String(row.price))
    setIGroup(row.groupId ?? '')
    setIVendor(row.vendorId ?? '')
    setItemOpen(true)
  }

  const saveItem = async (): Promise<void> => {
    if (!projectId) return
    const name = iName.trim()
    if (!name) {
      toast.error('Name is required')
      return
    }
    const qty = Number.parseInt(iQty, 10)
    const price = Number.parseFloat(iPrice)
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('Invalid quantity')
      return
    }
    if (!Number.isFinite(price)) {
      toast.error('Invalid price')
      return
    }
    const payload = {
      name,
      code: iCode.trim() || name.slice(0, 8).toUpperCase().replace(/\s+/g, '-'),
      quantity: qty,
      unit: iUnit.trim() || 'ea',
      price,
      groupId: iGroup || null,
      vendorId: iVendor || null
    }
    if (editingItem) {
      await desktopApi().cost.updateItem(editingItem.id, payload)
      toast.success('Item updated')
    } else {
      await desktopApi().cost.createItem({ projectId, ...payload })
      toast.success('Item created')
    }
    setItemOpen(false)
    await load(projectId)
  }

  const saveGroup = async (): Promise<void> => {
    if (!projectId) return
    const name = gName.trim()
    if (!name) {
      toast.error('Name is required')
      return
    }
    if (editingGroupId) {
      await desktopApi().cost.updateGroup(editingGroupId, name)
    } else {
      await desktopApi().cost.createGroup({ projectId, name, parentId: groupParentId })
    }
    setGroupOpen(false)
    setGName('')
    setEditingGroupId(null)
    await load(projectId)
  }

  const copyFromProject = async (): Promise<void> => {
    if (!projectId || !copyFromId) return
    await desktopApi().cost.copyFromProject(copyFromId, projectId)
    setCopyOpen(false)
    toast.success('Copied cost items from the selected project')
    await load(projectId)
  }

  const renderGroup = (group: CostGroupRecord, depth: number): React.JSX.Element => {
    const open = expanded.has(group.id)
    const childGroups = groupsByParent.get(group.id) ?? []
    const childItems = itemsByGroup.get(group.id) ?? []
    return (
      <Fragment key={group.id}>
        <TableRow>
          <TableCell style={{ paddingLeft: 16 + depth * 16 }}>
            <button
              type="button"
              className="mr-1 inline-flex align-middle"
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(group.id)) next.delete(group.id)
                  else next.add(group.id)
                  return next
                })
              }
            >
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
            <span className="font-medium">{group.name}</span>
          </TableCell>
          <TableCell />
          <TableCell />
          <TableCell />
          <TableCell />
          <TableCell className="text-right">
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => openNewItem(group.id)}>
              <Plus />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                setGroupParentId(group.id)
                setEditingGroupId(null)
                setGName('')
                setGroupOpen(true)
              }}
            >
              <Plus className="opacity-60" />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                setEditingGroupId(group.id)
                setGName(group.name)
                setGroupOpen(true)
              }}
            >
              <Pencil />
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                if (!projectId) return
                void desktopApi().cost.removeGroup(group.id).then(() => load(projectId))
              }}
            >
              <Trash2 />
            </Button>
          </TableCell>
        </TableRow>
        {open
          ? childItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell style={{ paddingLeft: 40 + depth * 16 }}>{item.name}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell>{item.price}</TableCell>
                <TableCell>{item.vendorName ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" size="icon-xs" variant="ghost" onClick={() => openEditItem(item)}>
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      if (!projectId) return
                      void desktopApi().cost.removeItem(item.id).then(() => load(projectId))
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          : null}
        {open ? childGroups.map((child) => renderGroup(child, depth + 1)) : null}
      </Fragment>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold">Cost Database</h2>
          <p className="text-sm text-muted-foreground">Enter items for this project, or copy from another local project.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setCopyOpen(true)}>
            <Copy />
            Copy from project
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEditingGroupId(null)
              setGroupParentId(null)
              setGName('')
              setGroupOpen(true)
            }}
          >
            <Plus />
            Add group
          </Button>
          <Button type="button" onClick={() => openNewItem()}>
            <Plus />
            Add item
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading cost database…</p>
        ) : groups.length === 0 && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups or items yet.</p>
        ) : (
          <div className="overflow-hidden border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupsByParent.get(null)?.map((group) => renderGroup(group, 0))}
                {(itemsByGroup.get(null) ?? []).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{item.price}</TableCell>
                    <TableCell>{item.vendorName ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <Button type="button" size="icon-xs" variant="ghost" onClick={() => openEditItem(item)}>
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit item' : 'New item'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ci-name">Name</Label>
              <Input id="ci-name" value={iName} onChange={(e) => setIName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-code">Code</Label>
              <Input id="ci-code" value={iCode} onChange={(e) => setICode(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="ci-qty">Qty</Label>
                <Input id="ci-qty" value={iQty} onChange={(e) => setIQty(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ci-unit">Unit</Label>
                <Input id="ci-unit" value={iUnit} onChange={(e) => setIUnit(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ci-price">Price</Label>
                <Input id="ci-price" value={iPrice} onChange={(e) => setIPrice(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Group</Label>
              <Select
                value={iGroup || '__none__'}
                onValueChange={(value) => setIGroup(!value || value === '__none__' ? '' : value)}
              >
                <SelectTrigger className="w-full">
                  <FolderKanban />
                  <SelectValue>{groups.find((group) => group.id === iGroup)?.name ?? 'Ungrouped'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <FolderOpen />
                    Ungrouped
                  </SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      <FolderKanban />
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Vendor</Label>
              <Select
                value={iVendor || '__none__'}
                onValueChange={(value) => setIVendor(!value || value === '__none__' ? '' : value)}
              >
                <SelectTrigger className="w-full">
                  <Store />
                  <SelectValue>{vendors.find((vendor) => vendor.id === iVendor)?.name ?? 'None'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <Store />
                    None
                  </SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      <Store />
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setItemOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveItem()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroupId ? 'Rename group' : 'New group'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cg-name">Name</Label>
            <Input id="cg-name" value={gName} onChange={(e) => setGName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGroupOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveGroup()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy from existing project</DialogTitle>
          </DialogHeader>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No other projects to copy from yet.</p>
          ) : (
            <Select
              value={copyFromId || null}
              onValueChange={(value) => {
                if (value) setCopyFromId(value)
              }}
            >
              <SelectTrigger className="w-full">
                <FolderKanban />
                <SelectValue>
                  {projects.find((project) => project.id === copyFromId)?.name ?? 'Select a project'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <FolderKanban />
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCopyOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!copyFromId} onClick={() => void copyFromProject()}>
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
