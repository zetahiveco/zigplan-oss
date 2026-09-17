import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Copy, FolderKanban, FolderOpen, Pencil, Plus, Store, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IconButton } from '@/components/icon-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
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

  const [newVendorName, setNewVendorName] = useState('')
  const [addingVendor, setAddingVendor] = useState(false)
  const [vendorEditOpen, setVendorEditOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<VendorRecord | null>(null)
  const [vendorDraft, setVendorDraft] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    notes: ''
  })

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
        toast.error('Could not load cost catalog')
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
    setAddingVendor(false)
    setNewVendorName('')
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
    setAddingVendor(false)
    setNewVendorName('')
    setItemOpen(true)
  }

  const createVendorInline = async (): Promise<void> => {
    const name = newVendorName.trim()
    if (!name) {
      toast.error('Vendor name is required')
      return
    }
    const vendor = await desktopApi().vendors.create(name)
    setVendors((prev) => [...prev, vendor].sort((a, b) => a.name.localeCompare(b.name)))
    setIVendor(vendor.id)
    setNewVendorName('')
    setAddingVendor(false)
    toast.success('Vendor added')
  }

  const openEditVendor = (vendorId: string): void => {
    const vendor = vendors.find((row) => row.id === vendorId)
    if (!vendor) return
    setEditingVendor(vendor)
    setVendorDraft({
      name: vendor.name,
      address: vendor.address ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      website: vendor.website ?? '',
      notes: vendor.notes ?? ''
    })
    setVendorEditOpen(true)
  }

  const saveVendorEdit = async (): Promise<void> => {
    if (!editingVendor || !projectId) return
    const name = vendorDraft.name.trim()
    if (!name) {
      toast.error('Vendor name is required')
      return
    }
    await desktopApi().vendors.update(editingVendor.id, {
      name,
      address: vendorDraft.address,
      phone: vendorDraft.phone,
      email: vendorDraft.email,
      website: vendorDraft.website,
      notes: vendorDraft.notes
    })
    setVendorEditOpen(false)
    setEditingVendor(null)
    toast.success('Vendor updated')
    await load(projectId)
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
            <IconButton tooltip="Add item" onClick={() => openNewItem(group.id)}>
              <Plus />
            </IconButton>
            <IconButton
              tooltip="Add subgroup"
              onClick={() => {
                setGroupParentId(group.id)
                setEditingGroupId(null)
                setGName('')
                setGroupOpen(true)
              }}
            >
              <Plus className="opacity-60" />
            </IconButton>
            <IconButton
              tooltip="Rename group"
              onClick={() => {
                setEditingGroupId(group.id)
                setGName(group.name)
                setGroupOpen(true)
              }}
            >
              <Pencil />
            </IconButton>
            <IconButton
              tooltip="Delete group"
              onClick={() => {
                if (!projectId) return
                void desktopApi().cost.removeGroup(group.id).then(() => load(projectId))
              }}
            >
              <Trash2 />
            </IconButton>
          </TableCell>
        </TableRow>
        {open
          ? childItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell style={{ paddingLeft: 40 + depth * 16 }}>{item.name}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell>{item.price}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span>{item.vendorName ?? '—'}</span>
                    {item.vendorId ? (
                      <IconButton tooltip="Edit vendor" onClick={() => openEditVendor(item.vendorId!)}>
                        <Pencil />
                      </IconButton>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <IconButton tooltip="Edit item" onClick={() => openEditItem(item)}>
                    <Pencil />
                  </IconButton>
                  <IconButton
                    tooltip="Delete item"
                    onClick={() => {
                      if (!projectId) return
                      void desktopApi().cost.removeItem(item.id).then(() => load(projectId))
                    }}
                  >
                    <Trash2 />
                  </IconButton>
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
          <h2 className="text-lg font-semibold">Cost Catalog</h2>
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
          <p className="text-sm text-muted-foreground">Loading cost catalog…</p>
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
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span>{item.vendorName ?? '—'}</span>
                        {item.vendorId ? (
                          <IconButton tooltip="Edit vendor" onClick={() => openEditVendor(item.vendorId!)}>
                            <Pencil />
                          </IconButton>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <IconButton tooltip="Edit item" onClick={() => openEditItem(item)}>
                        <Pencil />
                      </IconButton>
                      <IconButton
                        tooltip="Delete item"
                        onClick={() => {
                          if (!projectId) return
                          void desktopApi().cost.removeItem(item.id).then(() => load(projectId))
                        }}
                      >
                        <Trash2 />
                      </IconButton>
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
              <Input
                id="ci-name"
                value={iName}
                placeholder="e.g. Ready-mix concrete"
                onChange={(e) => setIName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-code">Code</Label>
              <Input
                id="ci-code"
                value={iCode}
                placeholder="e.g. 03-30-00"
                onChange={(e) => setICode(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="ci-qty">Qty</Label>
                <Input id="ci-qty" value={iQty} placeholder="1" onChange={(e) => setIQty(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ci-unit">Unit</Label>
                <Input
                  id="ci-unit"
                  value={iUnit}
                  placeholder="ea, sf, cy…"
                  onChange={(e) => setIUnit(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ci-price">Price</Label>
                <Input id="ci-price" value={iPrice} placeholder="0.00" onChange={(e) => setIPrice(e.target.value)} />
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
                onValueChange={(value) => {
                  if (value === '__new__') {
                    setAddingVendor(true)
                    return
                  }
                  setAddingVendor(false)
                  setIVendor(!value || value === '__none__' ? '' : value)
                }}
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
                  <SelectItem value="__new__">
                    <Plus />
                    Add vendor…
                  </SelectItem>
                </SelectContent>
              </Select>
              {addingVendor ? (
                <div className="flex gap-2">
                  <Input
                    value={newVendorName}
                    placeholder="Vendor name"
                    autoFocus
                    onChange={(e) => setNewVendorName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void createVendorInline()
                    }}
                  />
                  <Button type="button" onClick={() => void createVendorInline()}>
                    Add
                  </Button>
                </div>
              ) : null}
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
            <Input
              id="cg-name"
              value={gName}
              placeholder="e.g. Concrete"
              onChange={(e) => setGName(e.target.value)}
            />
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

      <Dialog
        open={vendorEditOpen}
        onOpenChange={(open) => {
          setVendorEditOpen(open)
          if (!open) setEditingVendor(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit vendor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="vendor-name">Name</Label>
              <Input
                id="vendor-name"
                value={vendorDraft.name}
                placeholder="Vendor name"
                onChange={(e) => setVendorDraft((prev) => ({ ...prev, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-address">Address</Label>
              <Input
                id="vendor-address"
                value={vendorDraft.address}
                placeholder="Street, city, state…"
                onChange={(e) => setVendorDraft((prev) => ({ ...prev, address: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="vendor-phone">Phone</Label>
                <Input
                  id="vendor-phone"
                  value={vendorDraft.phone}
                  placeholder="Phone number"
                  onChange={(e) => setVendorDraft((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vendor-email">Email</Label>
                <Input
                  id="vendor-email"
                  type="email"
                  value={vendorDraft.email}
                  placeholder="email@example.com"
                  onChange={(e) => setVendorDraft((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-website">Website</Label>
              <Input
                id="vendor-website"
                value={vendorDraft.website}
                placeholder="https://"
                onChange={(e) => setVendorDraft((prev) => ({ ...prev, website: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-notes">Notes</Label>
              <Textarea
                id="vendor-notes"
                value={vendorDraft.notes}
                placeholder="Optional notes"
                rows={3}
                onChange={(e) => setVendorDraft((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVendorEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveVendorEdit()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
