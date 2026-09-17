/**
 * Pixel snip search — worker-safe (no React, no pdf.js). Uses OffscreenCanvas for rotation/downscale.
 */

export type NormBBox = { x1: number; y1: number; x2: number; y2: number }

const NORM = 1000
const MAX_SEARCH_LONG = 540
const TEMPLATE_MAX_LONG = 128
const MIN_TEMPLATE = 14
const MIN_TEMPLATE_VAR = 6
const ZNCC_RELATIVE_TO_PEAK = 0.088
const ZNCC_ABSOLUTE_FLOOR = 0.726
const ZNCC_MIN_GLOBAL_PEAK = 0.652
const VERIFY_MIN_UNMASKED_ZNCC = 0.62
const VERIFY_ANGLE_STEPS = 8
const NMS_IOU = 0.34
const ROTATION_STEPS = 24
const MIN_ROTATED_VALID_FRAC = 0.32
const PEAK_SAFETY = 0.022

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export function dedupeNormRects(rects: NormBBox[]): NormBBox[] {
  const seen = new Set<string>()
  const out: NormBBox[] = []
  for (const r of rects) {
    const k = `${Math.round(r.x1)}-${Math.round(r.y1)}-${Math.round(r.x2)}-${Math.round(r.y2)}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

function grayFromRgba(data: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const n = w * h
  const g = new Uint8Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    g[i] = Math.round(0.299 * data[p]! + 0.587 * data[p + 1]! + 0.114 * data[p + 2]!)
  }
  return g
}

function downscaleGrayOffscreen(gray: Uint8Array, iw: number, ih: number, w2: number, h2: number): Uint8Array {
  const c1 = new OffscreenCanvas(iw, ih)
  const ctx1 = c1.getContext("2d")
  if (!ctx1) return gray
  const imgData = ctx1.createImageData(iw, ih)
  const d = imgData.data
  for (let i = 0, j = 0; i < iw * ih; i++, j += 4) {
    const v = gray[i]!
    d[j] = d[j + 1] = d[j + 2] = v
    d[j + 3] = 255
  }
  ctx1.putImageData(imgData, 0, 0)
  const c2 = new OffscreenCanvas(w2, h2)
  const ctx2 = c2.getContext("2d")
  if (!ctx2) return gray
  ctx2.drawImage(c1, 0, 0, iw, ih, 0, 0, w2, h2)
  return grayFromRgba(ctx2.getImageData(0, 0, w2, h2).data, w2, h2)
}

function cropGray(gray: Uint8Array, W: number, x: number, y: number, tw: number, th: number): Uint8Array {
  const out = new Uint8Array(tw * th)
  for (let j = 0; j < th; j++) {
    for (let i = 0; i < tw; i++) {
      out[j * tw + i] = gray[(y + j) * W + (x + i)]!
    }
  }
  return out
}

function rotateTemplateOffscreen(
  tpl: Uint8Array,
  tw: number,
  th: number,
  angleRad: number,
): { data: Uint8Array; valid: Uint8Array; ow: number; oh: number } {
  const c1 = new OffscreenCanvas(tw, th)
  const ctx1 = c1.getContext("2d")
  if (!ctx1) {
    return { data: new Uint8Array(1), valid: new Uint8Array(1), ow: 1, oh: 1 }
  }
  const imgData = ctx1.createImageData(tw, th)
  const d = imgData.data
  for (let i = 0, j = 0; i < tw * th; i++, j += 4) {
    const v = tpl[i]!
    d[j] = d[j + 1] = d[j + 2] = v
    d[j + 3] = 255
  }
  ctx1.putImageData(imgData, 0, 0)

  const absCos = Math.abs(Math.cos(angleRad))
  const absSin = Math.abs(Math.sin(angleRad))
  const ow = Math.max(1, Math.ceil(tw * absCos + th * absSin))
  const oh = Math.max(1, Math.ceil(tw * absSin + th * absCos))
  const c2 = new OffscreenCanvas(ow, oh)
  const ctx2 = c2.getContext("2d")
  if (!ctx2) {
    return { data: new Uint8Array(1), valid: new Uint8Array(1), ow: 1, oh: 1 }
  }
  ctx2.imageSmoothingEnabled = true
  ctx2.imageSmoothingQuality = "high"
  ctx2.clearRect(0, 0, ow, oh)
  ctx2.translate(ow / 2, oh / 2)
  ctx2.rotate(angleRad)
  ctx2.drawImage(c1, -tw / 2, -th / 2)

  const rgba = ctx2.getImageData(0, 0, ow, oh).data
  const data = new Uint8Array(ow * oh)
  const valid = new Uint8Array(ow * oh)
  for (let i = 0, p = 0; i < ow * oh; i++, p += 4) {
    const a = rgba[p + 3]!
    if (a < 12) {
      data[i] = 0
      valid[i] = 0
    } else {
      data[i] = Math.round(0.299 * rgba[p]! + 0.587 * rgba[p + 1]! + 0.114 * rgba[p + 2]!)
      valid[i] = 1
    }
  }
  return { data, valid, ow, oh }
}

function templateStatsMasked(
  tpl: Uint8Array,
  valid: Uint8Array,
): { meanT: number; varT: number; n: number } | null {
  let n = 0
  let sum = 0
  let sum2 = 0
  for (let i = 0; i < tpl.length; i++) {
    if (!valid[i]) continue
    const v = tpl[i]!
    n++
    sum += v
    sum2 += v * v
  }
  const total = tpl.length
  if (n < Math.max(16, MIN_ROTATED_VALID_FRAC * total)) return null
  const meanT = sum / n
  const varT = sum2 / n - meanT * meanT
  return { meanT, varT, n }
}

function templateMeanAndVar(tpl: Uint8Array): { meanT: number; varT: number } {
  const n = tpl.length
  let sum = 0
  let sum2 = 0
  for (let i = 0; i < n; i++) {
    const v = tpl[i]!
    sum += v
    sum2 += v * v
  }
  const meanT = sum / n
  const varT = sum2 / n - meanT * meanT
  return { meanT, varT }
}

/** Pearson correlation on two same-length patches (no mask). */
function znccUnmaskedFull(a: Uint8Array, b: Uint8Array): number {
  const n = a.length
  if (n < 4 || b.length !== n) return 0
  let sumA = 0
  let sumB = 0
  let sumA2 = 0
  let sumB2 = 0
  let sumAB = 0
  for (let i = 0; i < n; i++) {
    const pa = a[i]!
    const pb = b[i]!
    sumA += pa
    sumB += pb
    sumA2 += pa * pa
    sumB2 += pb * pb
    sumAB += pa * pb
  }
  const meanA = sumA / n
  const meanB = sumB / n
  const varA = sumA2 / n - meanA * meanA
  const varB = sumB2 / n - meanB * meanB
  if (varA < 1e-6 || varB < 1e-6) return 0
  const cov = sumAB / n - meanA * meanB
  return cov / Math.sqrt(varA * varB)
}

/** Re-check appearance vs original snip (few rotations) to drop ZNCC peaks on unrelated texture. */
function verifyMatchAgainstTpl(
  gray: Uint8Array,
  W: number,
  H: number,
  m: Match,
  tplOrig: Uint8Array,
  tw: number,
  th: number,
): number {
  const cx = m.x + m.tw / 2
  const cy = m.y + m.th / 2
  let best = 0
  for (let s = 0; s < VERIFY_ANGLE_STEPS; s++) {
    const angle = (s * 2 * Math.PI) / VERIFY_ANGLE_STEPS
    const { data: tr, ow, oh } = rotateTemplateOffscreen(tplOrig, tw, th, angle)
    if (ow > W || oh > H) continue
    const ox = Math.round(cx - ow / 2)
    const oy = Math.round(cy - oh / 2)
    if (ox < 0 || oy < 0 || ox + ow > W || oy + oh > H) continue
    const patch = cropGray(gray, W, ox, oy, ow, oh)
    best = Math.max(best, znccUnmaskedFull(patch, tr))
  }
  return best
}

type RotatedTpl = {
  data: Uint8Array
  valid: Uint8Array
  ow: number
  oh: number
  meanT: number
  varT: number
  nValid: number
}

function buildRotatedVariants(tpl: Uint8Array, tw: number, th: number): RotatedTpl[] {
  const out: RotatedTpl[] = []
  for (let s = 0; s < ROTATION_STEPS; s++) {
    const angle = (s * 2 * Math.PI) / ROTATION_STEPS
    const { data, valid, ow, oh } = rotateTemplateOffscreen(tpl, tw, th, angle)
    const stat = templateStatsMasked(data, valid)
    if (!stat || stat.varT < MIN_TEMPLATE_VAR) continue
    out.push({
      data,
      valid,
      ow,
      oh,
      meanT: stat.meanT,
      varT: stat.varT,
      nValid: stat.n,
    })
  }
  return out
}

function znccMaskedAt(gray: Uint8Array, W: number, ox: number, oy: number, v: RotatedTpl): number {
  const { data: tpl, valid, ow, oh, meanT, varT } = v
  let n = 0
  let sumP = 0
  let sumP2 = 0
  let sumPT = 0
  for (let j = 0; j < oh; j++) {
    const rowG = (oy + j) * W + ox
    for (let i = 0; i < ow; i++) {
      const k = j * ow + i
      if (!valid[k]) continue
      const p = gray[rowG + i]!
      const t = tpl[k]!
      n++
      sumP += p
      sumP2 += p * p
      sumPT += p * t
    }
  }
  if (n < Math.max(12, 0.32 * ow * oh)) return 0
  const meanP = sumP / n
  const varP = sumP2 / n - meanP * meanP
  const cov = sumPT / n - meanP * meanT
  const denom = Math.sqrt(Math.max(varP, 1e-6) * Math.max(varT, 1e-6))
  return cov / denom
}

type Match = { x: number; y: number; tw: number; th: number; score: number }

function iouMatch(a: Match, b: Match): number {
  const ax2 = a.x + a.tw
  const ay2 = a.y + a.th
  const bx2 = b.x + b.tw
  const by2 = b.y + b.th
  const ix1 = Math.max(a.x, b.x)
  const iy1 = Math.max(a.y, b.y)
  const ix2 = Math.min(ax2, bx2)
  const iy2 = Math.min(ay2, by2)
  const iw = Math.max(0, ix2 - ix1)
  const ih = Math.max(0, iy2 - iy1)
  const inter = iw * ih
  const u = a.tw * a.th + b.tw * b.th - inter
  return u <= 0 ? 0 : inter / u
}

function nms(matches: Match[], iouTh: number): Match[] {
  const sorted = [...matches].sort((a, b) => b.score - a.score)
  const kept: Match[] = []
  for (const m of sorted) {
    if (kept.some((k) => iouMatch(m, k) > iouTh)) continue
    kept.push(m)
  }
  return kept
}

function znccGlobalMaxOverScan(
  gray: Uint8Array,
  W: number,
  H: number,
  variants: RotatedTpl[],
  strideFor: (ow: number, oh: number) => number,
): number {
  let maxS = 0
  for (const v of variants) {
    const { ow, oh } = v
    if (ow > W || oh > H) continue
    const stride = strideFor(ow, oh)
    for (let y = 0; y <= H - oh; y += stride) {
      for (let x = 0; x <= W - ow; x += stride) {
        const s = znccMaskedAt(gray, W, x, y, v)
        if (s > maxS) maxS = s
      }
    }
  }
  return maxS
}

function collectMatchesAboveCutoff(
  gray: Uint8Array,
  W: number,
  H: number,
  variants: RotatedTpl[],
  cutoff: number,
  strideFor: (ow: number, oh: number) => number,
): Match[] {
  const raw: Match[] = []
  for (const v of variants) {
    const { ow, oh } = v
    if (ow > W || oh > H) continue
    const stride = strideFor(ow, oh)
    for (let y = 0; y <= H - oh; y += stride) {
      for (let x = 0; x <= W - ow; x += stride) {
        const s = znccMaskedAt(gray, W, x, y, v)
        if (s >= cutoff) raw.push({ x, y, tw: ow, th: oh, score: s })
      }
    }
  }
  return raw
}

function stridePeak(ow: number, oh: number): number {
  const sm = Math.min(ow, oh)
  return Math.max(2, Math.min(8, sm >> 3))
}

function strideFine(ow: number, oh: number): number {
  const sm = Math.min(ow, oh)
  if (sm >= 52) return Math.max(1, sm >> 5)
  return Math.max(1, sm >> 4)
}

function matchTemplateRotatingZncc(gray: Uint8Array, W: number, H: number, variants: RotatedTpl[]): Match[] {
  if (variants.length === 0) return []

  const globalMax = znccGlobalMaxOverScan(gray, W, H, variants, stridePeak)
  if (globalMax < ZNCC_MIN_GLOBAL_PEAK) return []

  const cutoff = Math.max(ZNCC_ABSOLUTE_FLOOR, globalMax - ZNCC_RELATIVE_TO_PEAK - PEAK_SAFETY)
  const raw = collectMatchesAboveCutoff(gray, W, H, variants, cutoff, strideFine)

  const coarse = nms(raw, 0.2)
  const refined: Match[] = []
  for (const m of coarse) {
    let best = m
    const smin = Math.max(2, Math.min(m.tw, m.th) >> 3)
    const r = Math.min(12, smin * 2 + 4)
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = m.x + dx
        const y = m.y + dy
        if (x < 0 || y < 0) continue
        for (const v of variants) {
          if (x > W - v.ow || y > H - v.oh) continue
          const s = znccMaskedAt(gray, W, x, y, v)
          if (s > best.score) best = { x, y, tw: v.ow, th: v.oh, score: s }
        }
      }
    }
    refined.push(best)
  }

  return nms(refined, NMS_IOU)
}

function searchSpaceScale(iw: number, ih: number, tw: number, th: number): number {
  const sImg = Math.min(1, MAX_SEARCH_LONG / Math.max(iw, ih))
  const sTpl = Math.min(1, TEMPLATE_MAX_LONG / Math.max(tw, th))
  return Math.min(sImg, sTpl)
}

function matchToNormRect(m: Match, iw: number, ih: number, sSearch: number): NormBBox {
  const ox = m.x / sSearch
  const oy = m.y / sSearch
  const ow = m.tw / sSearch
  const oh = m.th / sSearch
  return {
    x1: clamp((ox / iw) * NORM, 0, NORM),
    y1: clamp((oy / ih) * NORM, 0, NORM),
    x2: clamp(((ox + ow) / iw) * NORM, 0, NORM),
    y2: clamp(((oy + oh) / ih) * NORM, 0, NORM),
  }
}

function snipToPixelRect(snip: NormBBox, iw: number, ih: number): { x: number; y: number; w: number; h: number } {
  const x1 = clamp(Math.floor((snip.x1 / NORM) * iw), 0, Math.max(0, iw - 1))
  const y1 = clamp(Math.floor((snip.y1 / NORM) * ih), 0, Math.max(0, ih - 1))
  const x2 = clamp(Math.ceil((snip.x2 / NORM) * iw), x1 + 1, iw)
  const y2 = clamp(Math.ceil((snip.y2 / NORM) * ih), y1 + 1, ih)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export function runSnipSearchOnFullGray(gray: Uint8Array, iw: number, ih: number, snip: NormBBox): NormBBox[] {
  const { x: tx, y: ty, w: tw0, h: th0 } = snipToPixelRect(snip, iw, ih)
  let tw = tw0
  let th = th0
  if (tw < MIN_TEMPLATE || th < MIN_TEMPLATE) return []

  const tplVar0 = templateMeanAndVar(cropGray(gray, iw, tx, ty, tw, th)).varT
  if (tplVar0 < MIN_TEMPLATE_VAR) return []

  const sSearch = searchSpaceScale(iw, ih, tw, th)
  const Ws = Math.max(1, Math.round(iw * sSearch))
  const Hs = Math.max(1, Math.round(ih * sSearch))
  const txs = Math.round(tx * sSearch)
  const tys = Math.round(ty * sSearch)
  tw = Math.max(MIN_TEMPLATE, Math.round(tw * sSearch))
  th = Math.max(MIN_TEMPLATE, Math.round(th * sSearch))

  if (txs + tw > Ws || tys + th > Hs) return []

  const small = downscaleGrayOffscreen(gray, iw, ih, Ws, Hs)
  const tpl = cropGray(small, Ws, txs, tys, tw, th)
  const variants = buildRotatedVariants(tpl, tw, th)
  if (variants.length === 0) return []
  const matches = matchTemplateRotatingZncc(small, Ws, Hs, variants)
  const verified = matches.filter(
    (m) => verifyMatchAgainstTpl(small, Ws, Hs, m, tpl, tw, th) >= VERIFY_MIN_UNMASKED_ZNCC,
  )
  const rects = verified.map((m) => matchToNormRect(m, iw, ih, sSearch))
  return dedupeNormRects(rects)
}
