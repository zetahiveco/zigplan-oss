import type { ZigplanApi } from '../../../shared/types'

export function desktopApi(): ZigplanApi {
  const api = window.api
  if (!api?.projects) {
    throw new Error('Zigplan desktop API is not available. Use the Electron app window.')
  }
  return api
}

/** Preload does not hot-reload; skip if this Electron session is older than the API. */
export async function saveDocumentPageCount(id: string, pageCount: number): Promise<void> {
  const save = desktopApi().documents.savePageCount
  if (typeof save !== 'function') return
  await save(id, pageCount)
}

export async function saveDocumentScale(id: string, scale: unknown): Promise<void> {
  const save = desktopApi().documents.saveScale
  if (typeof save !== 'function') {
    throw new Error('Restart Zigplan to save scale (desktop API is out of date)')
  }
  await save(id, scale)
}
