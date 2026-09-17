import { homedir } from 'os'
import { join } from 'path'

/**
 * Root folder that contains `pouch/` and `files/`.
 * Override with ZIGPLAN_DATA_DIR for MCP / tooling.
 */
export function resolveZigplanDataRoot(): string {
  const fromEnv = process.env.ZIGPLAN_DATA_DIR?.trim()
  if (fromEnv) return fromEnv

  if (process.versions.electron) {
    try {
      // Lazy require so MCP (plain Node) never loads Electron.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as typeof import('electron')
      if (electron.app) {
        return join(electron.app.getPath('userData'), 'data')
      }
    } catch {
      // fall through to platform defaults
    }
  }

  const home = homedir()
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Zigplan', 'data')
  }
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Zigplan', 'data')
  }
  return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'Zigplan', 'data')
}
