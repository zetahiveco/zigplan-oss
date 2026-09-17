import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { ZigplanApi } from '../shared/types'

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
    removeItem: (id) => ipcRenderer.invoke('takeoff:removeItem', id)
  },
  vendors: {
    list: () => ipcRenderer.invoke('vendors:list'),
    create: (name) => ipcRenderer.invoke('vendors:create', name)
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
