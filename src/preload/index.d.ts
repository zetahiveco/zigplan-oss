import { ElectronAPI } from '@electron-toolkit/preload'
import type { ZigplanApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: ZigplanApi
  }
}
