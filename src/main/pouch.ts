import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import PouchDB from 'pouchdb'
import type {
  CostGroupRecord,
  CostItemRecord,
  DocumentRecord,
  EstimateLineRecord,
  EstimateRecord,
  ProjectDocument,
  ProjectRecord,
  StoredDocument,
  TakeoffGroupRecord,
  TakeoffItemRecord,
  VendorDocument,
  VendorRecord
} from '../shared/types'
import { resolveZigplanDataRoot } from '../shared/data-root'
import { parsePdfPageSheetId } from '../shared/pdf-sheets'
import {
  buildTakeoffCountPathsBundle,
  buildTakeoffPathsBundle,
  itemCountMarkOverlayKey,
  itemPathOverlayKey,
  parseItemCountMarkOverlayKey,
  parseItemPathOverlayKey,
  parseTakeoffCountPathsForDocument,
  parseTakeoffItemPathsForDocument,
  polygonAreaNorm
} from '../shared/takeoff-paths'

const FILES_DIR_NAME = 'files'
const POUCH_DIR_NAME = 'pouch'

let projectsDb: PouchDB.Database<ProjectDocument> | undefined
let vendorsDb: PouchDB.Database<VendorDocument> | undefined

export function getDataDirectory(): string {
  return resolveZigplanDataRoot()
}

export function getFilesDirectory(): string {
  return join(getDataDirectory(), FILES_DIR_NAME)
}

function getPouchDirectory(): string {
  return join(getDataDirectory(), POUCH_DIR_NAME)
}

function nowIso(): string {
  return new Date().toISOString()
}

function documentUrl(id: string): string {
  return `zigplan://file/${id}`
}

function documentPrefix(projectId: string): string {
  return `projects/${projectId}/`
}

function ensureEstimate(doc: ProjectDocument): EstimateRecord {
  const existing = doc.estimate
  if (existing && Array.isArray(existing.lines)) {
    return existing
  }
  const createdAt = nowIso()
  const estimate: EstimateRecord = {
    id: randomUUID(),
    lines: [],
    createdAt,
    updatedAt: createdAt
  }
  doc.estimate = estimate
  return estimate
}

function pruneEstimateLines(
  doc: ProjectDocument,
  predicate: (line: EstimateLineRecord) => boolean
): void {
  if (!doc.estimate || !Array.isArray(doc.estimate.lines)) return
  const next = doc.estimate.lines.filter((line) => !predicate(line))
  if (next.length === doc.estimate.lines.length) return
  doc.estimate.lines = next
  doc.estimate.updatedAt = nowIso()
}

function withUrl(document: StoredDocument): DocumentRecord {
  return { ...document, url: documentUrl(document.id) }
}

function isConflict(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'status' in error && error.status === 409)
}

function toProjectRecord(doc: ProjectDocument): ProjectRecord {
  return {
    id: doc._id,
    name: doc.name,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

function toVendorRecord(doc: VendorDocument): VendorRecord {
  return {
    id: doc._id,
    name: doc.name,
    address: doc.address,
    phone: doc.phone,
    email: doc.email,
    website: doc.website,
    notes: doc.notes
  }
}

function collectedDocs<T extends { _id: string }>(rows: Array<{ doc?: T }>): T[] {
  const docs: T[] = []
  for (const row of rows) {
    const doc = row.doc
    if (doc && !doc._id.startsWith('_design')) docs.push(doc)
  }
  return docs
}

async function allProjects(): Promise<ProjectDocument[]> {
  if (!projectsDb) throw new Error('PouchDB has not been initialized')
  const result = await projectsDb.allDocs({ include_docs: true })
  return collectedDocs(result.rows)
}

async function allVendors(): Promise<VendorDocument[]> {
  if (!vendorsDb) throw new Error('PouchDB has not been initialized')
  const result = await vendorsDb.allDocs({ include_docs: true })
  return collectedDocs(result.rows)
}

async function getProject(id: string): Promise<ProjectDocument> {
  if (!projectsDb) throw new Error('PouchDB has not been initialized')
  return projectsDb.get(id)
}

async function putProject(doc: ProjectDocument): Promise<ProjectDocument> {
  if (!projectsDb) throw new Error('PouchDB has not been initialized')
  doc.updatedAt = nowIso()
  const result = await projectsDb.put(doc)
  doc._rev = result.rev
  return doc
}

async function updateProject(
  id: string,
  mutator: (doc: ProjectDocument) => void
): Promise<ProjectDocument> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await getProject(id)
    mutator(doc)
    try {
      return await putProject(doc)
    } catch (error) {
      if (!isConflict(error) || attempt === 3) throw error
    }
  }
  throw new Error('Could not update project')
}

async function findProject(
  predicate: (doc: ProjectDocument) => boolean
): Promise<ProjectDocument | null> {
  return (await allProjects()).find(predicate) ?? null
}

async function vendorName(vendorId: string | null): Promise<string | null> {
  if (!vendorId || !vendorsDb) return null
  try {
    const vendor = await vendorsDb.get(vendorId)
    return vendor.name
  } catch {
    return null
  }
}

export async function initializeDatabase(): Promise<void> {
  await closeDatabase()
  mkdirSync(getFilesDirectory(), { recursive: true })
  mkdirSync(join(getPouchDirectory(), 'projects'), { recursive: true })
  mkdirSync(join(getPouchDirectory(), 'vendors'), { recursive: true })

  projectsDb = new PouchDB<ProjectDocument>(join(getPouchDirectory(), 'projects'))
  vendorsDb = new PouchDB<VendorDocument>(join(getPouchDirectory(), 'vendors'))

  console.log(`[zigplan] Opened PouchDB at ${getPouchDirectory()}`)
}

export async function closeDatabase(): Promise<void> {
  await projectsDb?.close()
  await vendorsDb?.close()
  projectsDb = undefined
  vendorsDb = undefined
}

export async function listProjects(): Promise<ProjectRecord[]> {
  return (await allProjects())
    .map(toProjectRecord)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function createProject(name: string): Promise<ProjectRecord> {
  const createdAt = nowIso()
  const doc: ProjectDocument = {
    _id: randomUUID(),
    name: name.trim() || 'Untitled project',
    createdAt,
    updatedAt: createdAt,
    takeoffGroups: [],
    costGroups: [],
    costItems: [],
    documents: [],
    estimate: null
  }
  await putProject(doc)
  return toProjectRecord(doc)
}

export async function renameProject(id: string, name: string): Promise<ProjectRecord> {
  const doc = await updateProject(id, (project) => {
    project.name = name.trim() || 'Untitled project'
  })
  return toProjectRecord(doc)
}

export async function removeProject(id: string): Promise<void> {
  const doc = await getProject(id)
  rmSync(join(getFilesDirectory(), id), { recursive: true, force: true })
  if (!projectsDb) throw new Error('PouchDB has not been initialized')
  if (!doc._rev) throw new Error('Project is missing a revision')
  await projectsDb.remove(doc._id, doc._rev)
}

export async function listDocuments(projectId: string): Promise<DocumentRecord[]> {
  const project = await getProject(projectId)
  return [...project.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(withUrl)
}

export async function addDocument(payload: {
  projectId: string
  fileName: string
  fileType: string
  data: ArrayBuffer
}): Promise<DocumentRecord> {
  const allowed = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml'])
  if (!allowed.has(payload.fileType)) {
    throw new Error('Only PDF, PNG, JPEG, or SVG files are allowed')
  }
  const id = randomUUID()
  const destDir = join(getFilesDirectory(), payload.projectId, id)
  mkdirSync(destDir, { recursive: true })
  writeFileSync(join(destDir, payload.fileName), new Uint8Array(payload.data))
  const stored: StoredDocument = {
    id,
    fileName: payload.fileName,
    fileType: payload.fileType,
    fileSize: payload.data.byteLength,
    filePath: `${documentPrefix(payload.projectId)}${id}/${payload.fileName}`,
    createdAt: nowIso()
  }
  await updateProject(payload.projectId, (project) => {
    project.documents.unshift(stored)
  })
  return withUrl(stored)
}

export async function saveDocumentScale(id: string, scale: unknown): Promise<void> {
  const documentId = parsePdfPageSheetId(id).documentId
  const project = await findProject((doc) => doc.documents.some((document) => document.id === documentId))
  if (!project) throw new Error('Document not found')
  await updateProject(project._id, (doc) => {
    const document = doc.documents.find((row) => row.id === documentId)
    if (!document) return
    document.scale = scale
    delete document.pageScales
  })
}

export async function saveDocumentPageCount(id: string, pageCount: number): Promise<void> {
  const project = await findProject((doc) => doc.documents.some((document) => document.id === id))
  if (!project) throw new Error('Document not found')
  const count = Math.max(1, Math.floor(pageCount))
  await updateProject(project._id, (doc) => {
    const document = doc.documents.find((row) => row.id === id)
    if (document) document.pageCount = count
  })
}

export async function removeDocument(id: string): Promise<void> {
  const project = await findProject((doc) => doc.documents.some((document) => document.id === id))
  if (!project) return
  rmSync(join(getFilesDirectory(), project._id, id), { recursive: true, force: true })
  await updateProject(project._id, (doc) => {
    doc.documents = doc.documents.filter((document) => document.id !== id)
    for (const group of doc.takeoffGroups) {
      for (const item of group.items) {
        if (item.documentId === id) item.documentId = null
      }
    }
  })
}

export async function findStoredDocument(id: string): Promise<StoredDocument | null> {
  const project = await findProject((doc) => doc.documents.some((document) => document.id === id))
  return project?.documents.find((document) => document.id === id) ?? null
}

export function resolveDocumentDiskPath(filePath: string): string {
  const match = filePath.match(/^projects\/([^/]+)\/([^/]+)\/(.+)$/)
  if (!match) {
    throw new Error('Invalid document path')
  }
  return join(getFilesDirectory(), match[1], match[2], match[3])
}

export async function listTakeoff(projectId: string): Promise<TakeoffGroupRecord[]> {
  const project = await getProject(projectId)
  return project.takeoffGroups
}

export async function createTakeoffGroup(projectId: string, name: string): Promise<TakeoffGroupRecord> {
  const createdAt = nowIso()
  const group: TakeoffGroupRecord = {
    id: randomUUID(),
    projectId,
    name: name.trim() || 'Group',
    createdAt,
    updatedAt: createdAt,
    items: []
  }
  await updateProject(projectId, (project) => {
    project.takeoffGroups.push(group)
  })
  return group
}

export async function updateTakeoffGroup(id: string, name: string): Promise<void> {
  const project = await findProject((doc) => doc.takeoffGroups.some((group) => group.id === id))
  if (!project) throw new Error('Group not found')
  await updateProject(project._id, (doc) => {
    const group = doc.takeoffGroups.find((entry) => entry.id === id)
    if (!group) return
    group.name = name.trim() || 'Group'
    group.updatedAt = nowIso()
  })
}

export async function removeTakeoffGroup(id: string): Promise<void> {
  const project = await findProject((doc) => doc.takeoffGroups.some((group) => group.id === id))
  if (!project) return
  await updateProject(project._id, (doc) => {
    const removed = doc.takeoffGroups.find((group) => group.id === id)
    const removedItemIds = new Set(removed?.items.map((item) => item.id) ?? [])
    doc.takeoffGroups = doc.takeoffGroups.filter((group) => group.id !== id)
    pruneEstimateLines(doc, (line) => removedItemIds.has(line.takeoffItemId))
  })
}

export async function createTakeoffItem(payload: {
  projectId: string
  groupId: string
  name: string
  quantity?: number
}): Promise<TakeoffItemRecord> {
  const createdAt = nowIso()
  const quantity = Number.isFinite(payload.quantity) ? Math.max(0, Math.floor(payload.quantity ?? 1)) : 1
  const item: TakeoffItemRecord = {
    id: randomUUID(),
    groupId: payload.groupId,
    projectId: payload.projectId,
    name: payload.name.trim() || 'Item',
    length: null,
    breadth: null,
    height: null,
    area: null,
    color: null,
    path: null,
    countPaths: null,
    documentId: null,
    quantity,
    createdAt,
    updatedAt: createdAt
  }
  await updateProject(payload.projectId, (project) => {
    const group = project.takeoffGroups.find((entry) => entry.id === payload.groupId)
    if (!group) throw new Error('Group not found')
    group.items.push(item)
    group.updatedAt = nowIso()
  })
  return item
}

export async function updateTakeoffItem(
  id: string,
  data: Partial<TakeoffItemRecord>
): Promise<void> {
  const project = await findProject((doc) =>
    doc.takeoffGroups.some((group) => group.items.some((item) => item.id === id))
  )
  if (!project) throw new Error('Item not found')
  await updateProject(project._id, (doc) => {
    for (const group of doc.takeoffGroups) {
      const item = group.items.find((entry) => entry.id === id)
      if (!item) continue
      Object.assign(item, data, { id: item.id, groupId: item.groupId, projectId: item.projectId })
      item.updatedAt = nowIso()
      group.updatedAt = nowIso()
      return
    }
  })
}

export async function removeTakeoffItem(id: string): Promise<void> {
  const project = await findProject((doc) =>
    doc.takeoffGroups.some((group) => group.items.some((item) => item.id === id))
  )
  if (!project) return
  await updateProject(project._id, (doc) => {
    for (const group of doc.takeoffGroups) {
      group.items = group.items.filter((item) => item.id !== id)
    }
    pruneEstimateLines(doc, (line) => line.takeoffItemId === id)
  })
}

export async function listVendors(): Promise<VendorRecord[]> {
  return (await allVendors())
    .map(toVendorRecord)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function createVendor(name: string): Promise<VendorRecord> {
  if (!vendorsDb) throw new Error('PouchDB has not been initialized')
  const createdAt = nowIso()
  const doc: VendorDocument = {
    _id: randomUUID(),
    name: name.trim() || 'Vendor',
    address: null,
    phone: null,
    email: null,
    website: null,
    notes: null,
    createdAt,
    updatedAt: createdAt
  }
  await vendorsDb.put(doc)
  return toVendorRecord(doc)
}

export async function updateVendor(
  id: string,
  data: Partial<Pick<VendorRecord, 'name' | 'address' | 'phone' | 'email' | 'website' | 'notes'>>
): Promise<VendorRecord> {
  if (!vendorsDb) throw new Error('PouchDB has not been initialized')
  const doc = await vendorsDb.get(id)
  if (data.name !== undefined) {
    const name = data.name.trim()
    if (name) doc.name = name
  }
  if (data.address !== undefined) doc.address = data.address?.trim() || null
  if (data.phone !== undefined) doc.phone = data.phone?.trim() || null
  if (data.email !== undefined) doc.email = data.email?.trim() || null
  if (data.website !== undefined) doc.website = data.website?.trim() || null
  if (data.notes !== undefined) doc.notes = data.notes?.trim() || null
  doc.updatedAt = nowIso()
  await vendorsDb.put(doc)
  return toVendorRecord(doc)
}

export async function listCost(projectId: string): Promise<{
  groups: CostGroupRecord[]
  items: CostItemRecord[]
}> {
  const project = await getProject(projectId)
  const items = await Promise.all(
    project.costItems.map(async (item) => ({
      ...item,
      vendorName: item.vendorId ? await vendorName(item.vendorId) : null
    }))
  )
  return { groups: project.costGroups, items }
}

export async function createCostGroup(payload: {
  projectId: string
  name: string
  parentId?: string | null
}): Promise<CostGroupRecord> {
  const group: CostGroupRecord = {
    id: randomUUID(),
    projectId: payload.projectId,
    name: payload.name.trim() || 'Group',
    parentId: payload.parentId || null
  }
  await updateProject(payload.projectId, (project) => {
    project.costGroups.push(group)
  })
  return group
}

export async function updateCostGroup(id: string, name: string): Promise<void> {
  const project = await findProject((doc) => doc.costGroups.some((group) => group.id === id))
  if (!project) throw new Error('Group not found')
  await updateProject(project._id, (doc) => {
    const group = doc.costGroups.find((entry) => entry.id === id)
    if (group) group.name = name.trim() || 'Group'
  })
}

export async function removeCostGroup(id: string): Promise<void> {
  const project = await findProject((doc) => doc.costGroups.some((group) => group.id === id))
  if (!project) return
  await updateProject(project._id, (doc) => {
    doc.costGroups = doc.costGroups.filter((group) => group.id !== id)
    for (const group of doc.costGroups) {
      if (group.parentId === id) group.parentId = null
    }
    for (const item of doc.costItems) {
      if (item.groupId === id) item.groupId = null
    }
  })
}

export async function createCostItem(payload: {
  projectId: string
  name: string
  code: string
  quantity: number
  unit: string
  price: number
  groupId?: string | null
  vendorId?: string | null
}): Promise<CostItemRecord> {
  const item: CostItemRecord = {
    id: randomUUID(),
    projectId: payload.projectId,
    name: payload.name.trim() || 'Item',
    code: payload.code.trim() || 'ITEM',
    quantity: payload.quantity,
    unit: payload.unit.trim() || 'ea',
    price: payload.price,
    groupId: payload.groupId || null,
    vendorId: payload.vendorId || null,
    vendorName: null
  }
  await updateProject(payload.projectId, (project) => {
    project.costItems.push(item)
  })
  item.vendorName = await vendorName(item.vendorId)
  return item
}

export async function updateCostItem(
  id: string,
  data: Partial<CostItemRecord>
): Promise<void> {
  const project = await findProject((doc) => doc.costItems.some((item) => item.id === id))
  if (!project) throw new Error('Item not found')
  await updateProject(project._id, (doc) => {
    const item = doc.costItems.find((entry) => entry.id === id)
    if (!item) return
    Object.assign(item, data, { id: item.id, projectId: item.projectId })
  })
}

export async function removeCostItem(id: string): Promise<void> {
  const project = await findProject((doc) => doc.costItems.some((item) => item.id === id))
  if (!project) return
  await updateProject(project._id, (doc) => {
    doc.costItems = doc.costItems.filter((item) => item.id !== id)
    pruneEstimateLines(doc, (line) => line.costItemId === id)
  })
}

export async function copyCostFromProject(fromProjectId: string, toProjectId: string): Promise<void> {
  const source = await getProject(fromProjectId)
  const idMap = new Map<string, string>()
  const groups = source.costGroups.map((group) => {
    const id = randomUUID()
    idMap.set(group.id, id)
    return { ...group, id, projectId: toProjectId, parentId: null as string | null }
  })
  for (const group of source.costGroups) {
    const cloned = groups.find((entry) => entry.id === idMap.get(group.id))
    if (cloned && group.parentId) cloned.parentId = idMap.get(group.parentId) ?? null
  }
  const items = source.costItems.map((item) => ({
    ...item,
    id: randomUUID(),
    projectId: toProjectId,
    groupId: item.groupId ? (idMap.get(item.groupId) ?? null) : null,
    vendorName: null
  }))
  await updateProject(toProjectId, (project) => {
    project.costGroups.push(...groups)
    project.costItems.push(...items)
  })
}

export async function getEstimate(projectId: string): Promise<{
  lines: EstimateLineRecord[]
  takeoffGroups: TakeoffGroupRecord[]
  costItems: CostItemRecord[]
}> {
  const project = await getProject(projectId)
  const cost = await listCost(projectId)
  const raw = project.estimate as EstimateRecord | { lines?: unknown } | null | undefined
  const lines = raw && Array.isArray(raw.lines) ? (raw.lines as EstimateLineRecord[]) : []
  return {
    lines,
    takeoffGroups: Array.isArray(project.takeoffGroups) ? project.takeoffGroups : [],
    costItems: cost.items
  }
}

export async function addEstimateLine(payload: {
  projectId: string
  takeoffItemId: string
  costItemId: string
  quantityPerTakeoff: number
}): Promise<EstimateLineRecord> {
  const quantityPerTakeoff = Number.isFinite(payload.quantityPerTakeoff)
    ? Math.max(0, payload.quantityPerTakeoff)
    : 1
  let created: EstimateLineRecord | null = null
  await updateProject(payload.projectId, (doc) => {
    const hasTakeoff = doc.takeoffGroups.some((group) =>
      group.items.some((item) => item.id === payload.takeoffItemId)
    )
    if (!hasTakeoff) throw new Error('Takeoff item not found')
    if (!doc.costItems.some((item) => item.id === payload.costItemId)) {
      throw new Error('Cost item not found')
    }
    const estimate = ensureEstimate(doc)
    const existing = estimate.lines.find(
      (line) =>
        line.takeoffItemId === payload.takeoffItemId && line.costItemId === payload.costItemId
    )
    if (existing) {
      existing.quantityPerTakeoff = quantityPerTakeoff
      estimate.updatedAt = nowIso()
      created = existing
      return
    }
    const line: EstimateLineRecord = {
      id: randomUUID(),
      takeoffItemId: payload.takeoffItemId,
      costItemId: payload.costItemId,
      quantityPerTakeoff
    }
    estimate.lines.push(line)
    estimate.updatedAt = nowIso()
    created = line
  })
  if (!created) throw new Error('Could not add estimate line')
  return created
}

export async function updateEstimateLine(
  projectId: string,
  lineId: string,
  data: Partial<Pick<EstimateLineRecord, 'quantityPerTakeoff' | 'costItemId'>>
): Promise<EstimateLineRecord> {
  let updated: EstimateLineRecord | null = null
  await updateProject(projectId, (doc) => {
    const estimate = ensureEstimate(doc)
    const line = estimate.lines.find((entry) => entry.id === lineId)
    if (!line) throw new Error('Estimate line not found')
    if (data.costItemId !== undefined) {
      if (!doc.costItems.some((item) => item.id === data.costItemId)) {
        throw new Error('Cost item not found')
      }
      const duplicate = estimate.lines.some(
        (entry) =>
          entry.id !== lineId &&
          entry.takeoffItemId === line.takeoffItemId &&
          entry.costItemId === data.costItemId
      )
      if (duplicate) throw new Error('Cost item already linked to this takeoff item')
      line.costItemId = data.costItemId
    }
    if (data.quantityPerTakeoff !== undefined) {
      line.quantityPerTakeoff = Number.isFinite(data.quantityPerTakeoff)
        ? Math.max(0, data.quantityPerTakeoff)
        : line.quantityPerTakeoff
    }
    estimate.updatedAt = nowIso()
    updated = { ...line }
  })
  if (!updated) throw new Error('Estimate line not found')
  return updated
}

export async function removeEstimateLine(projectId: string, lineId: string): Promise<void> {
  await updateProject(projectId, (doc) => {
    if (!doc.estimate || !Array.isArray(doc.estimate.lines)) return
    doc.estimate.lines = doc.estimate.lines.filter((line) => line.id !== lineId)
    doc.estimate.updatedAt = nowIso()
  })
}

export async function exportEstimateCsv(projectId: string): Promise<string> {
  const { buildEstimateCsv } = await import('../shared/estimate-export')
  const data = await getEstimate(projectId)
  return buildEstimateCsv(data.takeoffGroups, data.costItems, data.lines)
}

export type TakeoffPathEntry = {
  key: string
  kind: 'path' | 'tally'
  itemId: string
  itemName: string
  groupName: string
  index: number
}

export async function listTakeoffPaths(
  projectId: string,
  sheetId: string
): Promise<TakeoffPathEntry[]> {
  const groups = await listTakeoff(projectId)
  const entries: TakeoffPathEntry[] = []
  for (const group of groups) {
    for (const item of group.items) {
      const paths = parseTakeoffItemPathsForDocument(item, sheetId)
      paths.forEach((_, index) => {
        entries.push({
          key: itemPathOverlayKey(item.id, index),
          kind: 'path',
          itemId: item.id,
          itemName: item.name,
          groupName: group.name,
          index
        })
      })
      const tallies = parseTakeoffCountPathsForDocument(item.countPaths, sheetId)
      tallies.forEach((_, index) => {
        entries.push({
          key: itemCountMarkOverlayKey(item.id, index),
          kind: 'tally',
          itemId: item.id,
          itemName: item.name,
          groupName: group.name,
          index
        })
      })
    }
  }
  return entries
}

/** Delete persisted drawings by overlay keys (same semantics as Takeoff “Delete selected”). */
export async function deleteTakeoffPaths(
  projectId: string,
  sheetId: string,
  pathKeys: string[]
): Promise<{ removed: number }> {
  if (!sheetId || pathKeys.length === 0) return { removed: 0 }

  type Removal = { all: true } | { all: false; indices: Set<number> }
  const itemRemovals = new Map<string, Removal>()
  const itemCountRemovals = new Map<string, Set<number>>()

  for (const key of pathKeys) {
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

  const itemIds = new Set([...itemRemovals.keys(), ...itemCountRemovals.keys()])
  let removed = 0
  for (const itemId of itemIds) {
    const project = await findProject((doc) =>
      doc.takeoffGroups.some((group) => group.items.some((item) => item.id === itemId))
    )
    if (!project || project._id !== projectId) continue
    const item = project.takeoffGroups.flatMap((g) => g.items).find((entry) => entry.id === itemId)
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
        removed += 1
      } else {
        const existing = parseTakeoffItemPathsForDocument(item, sheetId)
        removed += pathRemoval.indices.size
        const nextPolys = existing
          .filter((_, index) => !pathRemoval.indices.has(index))
          .map((path) => path.points)
        if (nextPolys.length === 0) {
          patch.path = null
          patch.documentId = null
          patch.area = null
        } else {
          patch.path = buildTakeoffPathsBundle(sheetId, nextPolys)
          patch.documentId = sheetId
          patch.area = nextPolys.reduce((sum, points) => sum + polygonAreaNorm(points), 0)
        }
      }
    }
    const countIndices = itemCountRemovals.get(itemId)
    if (countIndices) {
      const existing = parseTakeoffCountPathsForDocument(item.countPaths, sheetId)
      removed += countIndices.size
      const nextRects = existing.filter((_, index) => !countIndices.has(index))
      patch.countPaths = nextRects.length > 0 ? buildTakeoffCountPathsBundle(sheetId, nextRects) : null
      patch.quantity = nextRects.length
    }
    await updateTakeoffItem(itemId, patch)
  }
  return { removed }
}

export async function removeVendor(id: string): Promise<void> {
  if (!vendorsDb) throw new Error('PouchDB has not been initialized')
  const doc = await vendorsDb.get(id)
  if (!doc._rev) throw new Error('Vendor is missing a revision')
  await vendorsDb.remove(doc._id, doc._rev)
  const projects = await allProjects()
  for (const project of projects) {
    let dirty = false
    for (const item of project.costItems) {
      if (item.vendorId === id) {
        item.vendorId = null
        item.vendorName = null
        dirty = true
      }
    }
    if (dirty) await putProject(project)
  }
}
