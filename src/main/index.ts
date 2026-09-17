import { app, shell, BrowserWindow, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { closeDatabase, initializeDatabase } from './pouch'
import { registerIpcHandlers } from './ipc'
import { registerFileProtocol, registerFileProtocolScheme } from './protocol'
import { buildApplicationMenu, registerMcpIpc, registerUpdateIpc, runUpdateCheck } from './menu'
import { stopMcpHttpServer } from './mcp-http'

app.setName('Zigplan')
registerFileProtocolScheme()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: false,
    title: 'Zigplan',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (!is.dev) {
      void runUpdateCheck(mainWindow, 'startup')
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  app.setName('Zigplan')
  electronApp.setAppUserModelId('com.zigplan.app')
  if (process.platform === 'darwin') {
    const dockIcon = nativeImage.createFromPath(icon)
    if (!dockIcon.isEmpty()) {
      app.dock?.setIcon(dockIcon)
    }
  }

  Menu.setApplicationMenu(buildApplicationMenu())
  registerIpcHandlers()
  registerUpdateIpc()
  registerMcpIpc()

  try {
    await initializeDatabase()
    registerFileProtocol()
  } catch (error) {
    console.error('[zigplan] Failed to initialize database', error)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void stopMcpHttpServer()
  void closeDatabase()
})
