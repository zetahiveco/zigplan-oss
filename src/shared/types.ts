export type ProjectRecord = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export type DocumentRecord = {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  filePath: string
  createdAt: string
  url: string
  scale?: unknown
  pageCount?: number
  pageScales?: Record<string, unknown>
}

export type StoredDocument = Omit<DocumentRecord, 'url'>

export type TakeoffItemRecord = {
  id: string
  groupId: string
  projectId: string
  name: string
  length: number | null
  breadth: number | null
  height: number | null
  area: number | null
  color: string | null
  path: unknown
  countPaths?: unknown
  documentId: string | null
  quantity: number
  createdAt: string
  updatedAt: string
}

export type TakeoffGroupRecord = {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
  items: TakeoffItemRecord[]
}

export type VendorRecord = {
  id: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
}

export type CostGroupRecord = {
  id: string
  projectId: string
  name: string
  parentId: string | null
}

export type CostItemRecord = {
  id: string
  projectId: string
  name: string
  code: string
  quantity: number
  unit: string
  price: number
  groupId: string | null
  vendorId: string | null
  vendorName: string | null
}

/** Cost catalog rows linked to a takeoff item, with qty factor. */
export type EstimateLineRecord = {
  id: string
  takeoffItemId: string
  costItemId: string
  /** Cost item quantity required per 1 unit of takeoff quantity */
  quantityPerTakeoff: number
}

export type EstimateRecord = {
  id: string
  lines: EstimateLineRecord[]
  createdAt: string
  updatedAt: string
}

/** One nested PouchDB document per project. */
export type ProjectDocument = {
  _id: string
  _rev?: string
  name: string
  createdAt: string
  updatedAt: string
  takeoffGroups: TakeoffGroupRecord[]
  costGroups: CostGroupRecord[]
  costItems: CostItemRecord[]
  documents: StoredDocument[]
  estimate: EstimateRecord | null
}

/** Separate PouchDB collection. */
export type VendorDocument = {
  _id: string
  _rev?: string
  name: string
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type UpdateCheckSource = 'startup' | 'manual'

export type UpdateAvailableInfo = {
  tag: string
  version: string
  name: string
  htmlUrl: string
  downloadUrl: string
  downloadName: string
}

export type UpdateStatus =
  | { phase: 'checking'; source: UpdateCheckSource }
  | { phase: 'latest'; source: UpdateCheckSource; version: string }
  | { phase: 'available'; source: UpdateCheckSource; update: UpdateAvailableInfo }
  | { phase: 'error'; source: UpdateCheckSource; message: string }
  | { phase: 'skipped'; source: UpdateCheckSource; tag: string }

export type McpHttpStatus = {
  running: boolean
  port: number | null
  url: string | null
  dataDir: string
}

export type McpSetupPayload = McpHttpStatus & {
  showDialog: boolean
}

export type ZigplanApi = {
  projects: {
    list: () => Promise<ProjectRecord[]>
    create: (name: string) => Promise<ProjectRecord>
    update: (id: string, name: string) => Promise<ProjectRecord>
    remove: (id: string) => Promise<void>
  }
  documents: {
    list: (projectId: string) => Promise<DocumentRecord[]>
    add: (payload: {
      projectId: string
      fileName: string
      fileType: string
      data: ArrayBuffer
    }) => Promise<DocumentRecord>
    remove: (id: string) => Promise<void>
    saveScale: (id: string, scale: unknown) => Promise<void>
    savePageCount: (id: string, pageCount: number) => Promise<void>
  }
  takeoff: {
    list: (projectId: string) => Promise<TakeoffGroupRecord[]>
    createGroup: (projectId: string, name: string) => Promise<TakeoffGroupRecord>
    updateGroup: (id: string, name: string) => Promise<void>
    removeGroup: (id: string) => Promise<void>
    createItem: (payload: {
      projectId: string
      groupId: string
      name: string
      quantity?: number
    }) => Promise<TakeoffItemRecord>
    updateItem: (
      id: string,
      data: Partial<
        Pick<
          TakeoffItemRecord,
          | 'name'
          | 'quantity'
          | 'length'
          | 'breadth'
          | 'height'
          | 'area'
          | 'color'
          | 'path'
          | 'countPaths'
          | 'documentId'
        >
      >
    ) => Promise<void>
    removeItem: (id: string) => Promise<void>
    listPaths: (
      projectId: string,
      sheetId: string
    ) => Promise<
      Array<{
        key: string
        kind: 'path' | 'tally'
        itemId: string
        itemName: string
        groupName: string
        index: number
      }>
    >
    deletePaths: (
      projectId: string,
      sheetId: string,
      pathKeys: string[]
    ) => Promise<{ removed: number }>
  }
  vendors: {
    list: () => Promise<VendorRecord[]>
    create: (name: string) => Promise<VendorRecord>
    update: (
      id: string,
      data: Partial<Pick<VendorRecord, 'name' | 'address' | 'phone' | 'email' | 'website' | 'notes'>>
    ) => Promise<VendorRecord>
    remove: (id: string) => Promise<void>
  }
  cost: {
    list: (projectId: string) => Promise<{
      groups: CostGroupRecord[]
      items: CostItemRecord[]
    }>
    createGroup: (payload: {
      projectId: string
      name: string
      parentId?: string | null
    }) => Promise<CostGroupRecord>
    updateGroup: (id: string, name: string) => Promise<void>
    removeGroup: (id: string) => Promise<void>
    createItem: (payload: {
      projectId: string
      name: string
      code: string
      quantity: number
      unit: string
      price: number
      groupId?: string | null
      vendorId?: string | null
    }) => Promise<CostItemRecord>
    updateItem: (
      id: string,
      data: Partial<
        Pick<CostItemRecord, 'name' | 'code' | 'quantity' | 'unit' | 'price' | 'groupId' | 'vendorId'>
      >
    ) => Promise<void>
    removeItem: (id: string) => Promise<void>
    copyFromProject: (fromProjectId: string, toProjectId: string) => Promise<void>
  }
  estimate: {
    get: (projectId: string) => Promise<{
      lines: EstimateLineRecord[]
      takeoffGroups: TakeoffGroupRecord[]
      costItems: CostItemRecord[]
    }>
    addLine: (payload: {
      projectId: string
      takeoffItemId: string
      costItemId: string
      quantityPerTakeoff: number
    }) => Promise<EstimateLineRecord>
    updateLine: (
      projectId: string,
      lineId: string,
      data: Partial<Pick<EstimateLineRecord, 'quantityPerTakeoff' | 'costItemId'>>
    ) => Promise<EstimateLineRecord>
    removeLine: (projectId: string, lineId: string) => Promise<void>
    exportCsv: (projectId: string) => Promise<string>
  }
  updates: {
    check: (source?: UpdateCheckSource) => Promise<void>
    skip: (tag: string) => Promise<string | null>
    download: (url: string) => Promise<void>
    onStatus: (listener: (status: UpdateStatus) => void) => () => void
  }
  mcp: {
    status: () => Promise<McpHttpStatus>
    start: () => Promise<McpHttpStatus>
    stop: () => Promise<McpHttpStatus>
    onSetup: (listener: (payload: McpSetupPayload) => void) => () => void
    onError: (listener: (message: string) => void) => () => void
  }
}
