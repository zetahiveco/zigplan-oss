import { BrowserWindow, Menu, ipcMain, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import {
  getSkippedReleaseTag,
  lookupLatestUpdate,
  skipReleaseForSession
} from './updates'
import type { UpdateCheckSource, UpdateStatus } from '../shared/types'

function sendStatus(win: BrowserWindow | null, status: UpdateStatus): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send('updates:status', status)
}

function focusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export async function runUpdateCheck(
  win: BrowserWindow | null,
  source: UpdateCheckSource
): Promise<void> {
  const target = win ?? focusedWindow()
  sendStatus(target, { phase: 'checking', source })

  const result = await lookupLatestUpdate({
    respectSessionSkip: source === 'startup'
  })

  if (result.kind === 'latest') {
    sendStatus(target, { phase: 'latest', source, version: result.version })
    return
  }

  if (result.kind === 'skipped') {
    sendStatus(target, { phase: 'skipped', source, tag: result.tag })
    return
  }

  if (result.kind === 'error') {
    sendStatus(target, { phase: 'error', source, message: result.message })
    return
  }

  sendStatus(target, { phase: 'available', source, update: result.update })
}

export function buildApplicationMenu(): Menu {
  const isMac = process.platform === 'darwin'

  const fileSubmenu: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Check for Updates…',
      click: (): void => {
        void runUpdateCheck(focusedWindow(), 'manual')
      }
    },
    { type: 'separator' },
    isMac ? { role: 'close' } : { role: 'quit' }
  ]

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Zigplan',
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Check for Updates…',
                click: (): void => {
                  void runUpdateCheck(focusedWindow(), 'manual')
                }
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: fileSubmenu
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const }
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const }
            ])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(is.dev ? [{ role: 'toggleDevTools' as const }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Zigplan Website',
          click: (): void => {
            void shell.openExternal('https://www.zigplan.com')
          }
        },
        {
          label: 'Open Source App',
          click: (): void => {
            void shell.openExternal('https://www.zigplan.com/oss-app')
          }
        },
        {
          label: 'GitHub Repository',
          click: (): void => {
            void shell.openExternal('https://github.com/zetahiveco/zigplan-oss')
          }
        }
      ]
    }
  ]

  return Menu.buildFromTemplate(template)
}

export function registerUpdateIpc(): void {
  ipcMain.handle('updates:check', async (_event, source: UpdateCheckSource = 'manual') => {
    await runUpdateCheck(focusedWindow(), source)
  })

  ipcMain.handle('updates:skip', (_event, tag: string) => {
    skipReleaseForSession(tag)
    return getSkippedReleaseTag()
  })

  ipcMain.handle('updates:download', async (_event, url: string) => {
    await shell.openExternal(url)
  })
}
