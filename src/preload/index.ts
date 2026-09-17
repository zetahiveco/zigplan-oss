import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { McpSetupPayload, UpdateStatus, ZigplanApi } from '../shared/types'

const api: ZigplanApi = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name) => ipcRenderer.invoke('projects:create', name),
    update: (id, name) => ipcRenderer.invoke('projects:update', id, name),
    remove: (id) => ipcRenderer.invoke('projects:remove', id)
  },
  documents: {
    list: (projectId) => ipcRenderer.invoke('documents:list', projectId),
    add: (payload) => ipcRenderer.invoke('documents:add', payload),
    remove: (id) => ipcRenderer.invoke('documents:remove', id),
    saveScale: (id, scale) => ipcRenderer.invoke('documents:saveScale', id, scale),
    savePageCount: (id, pageCount) => ipcRenderer.invoke('documents:savePageCount', id, pageCount)
  },
  takeoff: {
    list: (projectId) => ipcRenderer.invoke('takeoff:list', projectId),
    createGroup: (projectId, name) => ipcRenderer.invoke('takeoff:createGroup', projectId, name),
    updateGroup: (id, name) => ipcRenderer.invoke('takeoff:updateGroup', id, name),
    removeGroup: (id) => ipcRenderer.invoke('takeoff:removeGroup', id),
    createItem: (payload) => ipcRenderer.invoke('takeoff:createItem', payload),
    updateItem: (id, data) => ipcRenderer.invoke('takeoff:updateItem', id, data),
    removeItem: (id) => ipcRenderer.invoke('takeoff:removeItem', id),
    listPaths: (projectId, sheetId) => ipcRenderer.invoke('takeoff:listPaths', projectId, sheetId),
    deletePaths: (projectId, sheetId, pathKeys) =>
      ipcRenderer.invoke('takeoff:deletePaths', projectId, sheetId, pathKeys)
  },
  vendors: {
    list: () => ipcRenderer.invoke('vendors:list'),
    create: (name) => ipcRenderer.invoke('vendors:create', name),
    update: (id, data) => ipcRenderer.invoke('vendors:update', id, data),
    remove: (id) => ipcRenderer.invoke('vendors:remove', id)
  },
  cost: {
    list: (projectId) => ipcRenderer.invoke('cost:list', projectId),
    createGroup: (payload) => ipcRenderer.invoke('cost:createGroup', payload),
    updateGroup: (id, name) => ipcRenderer.invoke('cost:updateGroup', id, name),
    removeGroup: (id) => ipcRenderer.invoke('cost:removeGroup', id),
    createItem: (payload) => ipcRenderer.invoke('cost:createItem', payload),
    updateItem: (id, data) => ipcRenderer.invoke('cost:updateItem', id, data),
    removeItem: (id) => ipcRenderer.invoke('cost:removeItem', id),
    copyFromProject: (fromProjectId, toProjectId) =>
      ipcRenderer.invoke('cost:copyFromProject', fromProjectId, toProjectId)
  },
  estimate: {
    get: (projectId) => ipcRenderer.invoke('estimate:get', projectId),
    addLine: (payload) => ipcRenderer.invoke('estimate:addLine', payload),
    updateLine: (projectId, lineId, data) =>
      ipcRenderer.invoke('estimate:updateLine', projectId, lineId, data),
    removeLine: (projectId, lineId) => ipcRenderer.invoke('estimate:removeLine', projectId, lineId),
    exportCsv: (projectId) => ipcRenderer.invoke('estimate:exportCsv', projectId)
  },
  updates: {
    check: (source = 'manual') => ipcRenderer.invoke('updates:check', source),
    skip: (tag) => ipcRenderer.invoke('updates:skip', tag),
    download: (url) => ipcRenderer.invoke('updates:download', url),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => {
        listener(status)
      }
      ipcRenderer.on('updates:status', handler)
      return () => {
        ipcRenderer.removeListener('updates:status', handler)
      }
    }
  },
  mcp: {
    status: () => ipcRenderer.invoke('mcp:status'),
    start: () => ipcRenderer.invoke('mcp:start'),
    stop: () => ipcRenderer.invoke('mcp:stop'),
    onSetup: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: McpSetupPayload): void => {
        listener(payload)
      }
      ipcRenderer.on('mcp:setup', handler)
      return () => {
        ipcRenderer.removeListener('mcp:setup', handler)
      }
    },
    onError: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string): void => {
        listener(message)
      }
      ipcRenderer.on('mcp:error', handler)
      return () => {
        ipcRenderer.removeListener('mcp:error', handler)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error isolated preload window
  window.electron = electronAPI
  // @ts-expect-error isolated preload window
  window.api = api
}
