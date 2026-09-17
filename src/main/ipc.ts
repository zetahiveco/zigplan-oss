import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  addDocument,
  saveDocumentScale,
  saveDocumentPageCount,
  copyCostFromProject,
  createCostGroup,
  createCostItem,
  createProject,
  createTakeoffGroup,
  createTakeoffItem,
  createVendor,
  listCost,
  listDocuments,
  listProjects,
  listTakeoff,
  listVendors,
  removeCostGroup,
  removeCostItem,
  removeDocument,
  removeProject,
  removeTakeoffGroup,
  removeTakeoffItem,
  renameProject,
  updateCostGroup,
  updateCostItem,
  updateTakeoffGroup,
  updateTakeoffItem
} from './pouch'
import type { CostItemRecord, TakeoffItemRecord } from '../shared/types'

function handleIpc(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: never[]) => Promise<unknown> | unknown
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await (listener as (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>)(
        event,
        ...args
      )
    } catch (error) {
      console.error(`[zigplan] ${channel} failed`, error)
      throw error instanceof Error ? error : new Error(String(error))
    }
  })
}

export function registerIpcHandlers(): void {
  handleIpc('projects:list', () => listProjects())
  handleIpc('projects:create', (_event, name: string) => createProject(name))
  handleIpc('projects:update', (_event, id: string, name: string) => renameProject(id, name))
  handleIpc('projects:remove', (_event, id: string) => removeProject(id))

  handleIpc('documents:list', (_event, projectId: string) => listDocuments(projectId))
  handleIpc(
    'documents:add',
    (
      _event,
      payload: { projectId: string; fileName: string; fileType: string; data: ArrayBuffer }
    ) => addDocument(payload)
  )
  handleIpc('documents:remove', (_event, id: string) => removeDocument(id))
  handleIpc(
    'documents:saveScale',
    (_event, id: string, scale: unknown) => saveDocumentScale(id, scale)
  )
  handleIpc('documents:savePageCount', (_event, id: string, pageCount: number) =>
    saveDocumentPageCount(id, pageCount)
  )

  handleIpc('takeoff:list', (_event, projectId: string) => listTakeoff(projectId))
  handleIpc('takeoff:createGroup', (_event, projectId: string, name: string) =>
    createTakeoffGroup(projectId, name)
  )
  handleIpc('takeoff:updateGroup', (_event, id: string, name: string) => updateTakeoffGroup(id, name))
  handleIpc('takeoff:removeGroup', (_event, id: string) => removeTakeoffGroup(id))
  handleIpc(
    'takeoff:createItem',
    (_event, payload: { projectId: string; groupId: string; name: string; quantity?: number }) =>
      createTakeoffItem(payload)
  )
  handleIpc(
    'takeoff:updateItem',
    (_event, id: string, data: Partial<TakeoffItemRecord>) => updateTakeoffItem(id, data)
  )
  handleIpc('takeoff:removeItem', (_event, id: string) => removeTakeoffItem(id))

  handleIpc('vendors:list', () => listVendors())
  handleIpc('vendors:create', (_event, name: string) => createVendor(name))

  handleIpc('cost:list', (_event, projectId: string) => listCost(projectId))
  handleIpc(
    'cost:createGroup',
    (_event, payload: { projectId: string; name: string; parentId?: string | null }) =>
      createCostGroup(payload)
  )
  handleIpc('cost:updateGroup', (_event, id: string, name: string) => updateCostGroup(id, name))
  handleIpc('cost:removeGroup', (_event, id: string) => removeCostGroup(id))
  handleIpc(
    'cost:createItem',
    (
      _event,
      payload: {
        projectId: string
        name: string
        code: string
        quantity: number
        unit: string
        price: number
        groupId?: string | null
        vendorId?: string | null
      }
    ) => createCostItem(payload)
  )
  handleIpc('cost:updateItem', (_event, id: string, data: Partial<CostItemRecord>) =>
    updateCostItem(id, data)
  )
  handleIpc('cost:removeItem', (_event, id: string) => removeCostItem(id))
  handleIpc('cost:copyFromProject', (_event, fromProjectId: string, toProjectId: string) =>
    copyCostFromProject(fromProjectId, toProjectId)
  )
}
