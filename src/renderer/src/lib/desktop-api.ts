import type {
  CostItemRecord,
  EstimateLineRecord,
  TakeoffGroupRecord,
  ZigplanApi
} from '../../../shared/types'

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

export type EstimateBundle = {
  lines: EstimateLineRecord[]
  takeoffGroups: TakeoffGroupRecord[]
  costItems: CostItemRecord[]
}

/** Loads estimate data; falls back if preload is stale (estimate API missing). */
export async function loadEstimate(projectId: string): Promise<EstimateBundle> {
  const api = desktopApi()
  if (typeof api.estimate?.get === 'function') {
    try {
      return await api.estimate.get(projectId)
    } catch (err) {
      console.error(err)
    }
  }
  const [takeoffGroups, cost] = await Promise.all([
    api.takeoff.list(projectId),
    api.cost.list(projectId)
  ])
  return {
    lines: [],
    takeoffGroups,
    costItems: cost.items
  }
}

export function requireEstimateApi(): ZigplanApi['estimate'] {
  const estimate = desktopApi().estimate
  if (
    typeof estimate?.get !== 'function' ||
    typeof estimate?.addLine !== 'function' ||
    typeof estimate?.updateLine !== 'function' ||
    typeof estimate?.removeLine !== 'function' ||
    typeof estimate?.exportCsv !== 'function'
  ) {
    throw new Error('Restart Zigplan to use Estimation (desktop API is out of date)')
  }
  return estimate
}
