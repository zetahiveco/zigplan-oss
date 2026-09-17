/// <reference lib="webworker" />

import { runSnipSearchOnFullGray, type NormBBox } from './snip-search-core'

type InMsg = {
  id: number
  grayBuffer: ArrayBuffer
  iw: number
  ih: number
  snip: NormBBox
}

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (ev: MessageEvent<InMsg>) => {
  const { id, grayBuffer, iw, ih, snip } = ev.data
  try {
    const gray = new Uint8Array(grayBuffer)
    const rects = runSnipSearchOnFullGray(gray, iw, ih, snip)
    self.postMessage({ id, rects })
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) })
  }
}
