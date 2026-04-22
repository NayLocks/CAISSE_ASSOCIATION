import { BrowserWindow } from 'electron'
import type { RemoteCaisseMirror } from '../shared/remoteCaisseMirror.js'

export type { RemoteCaisseMirror }

const defaultMirror = (): RemoteCaisseMirror => ({
  quantities: {},
  refundMode: false,
  refundMaxByProduct: null,
  refundSourceMeta: null,
  priceOverrides: {},
  lineDiscountPct: {},
  lineDiscountReason: {},
  cartDiscountPct: 0,
  cartDiscountReason: ''
})

let mirror: RemoteCaisseMirror = defaultMirror()

function sanitizeQuantities(q: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(q)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const n = Math.floor(v)
    if (n > 0) out[k] = n
  }
  return out
}

function sanitizeMirror(m: Partial<RemoteCaisseMirror> & { quantities?: Record<string, number> }): RemoteCaisseMirror {
  const quantities = m.quantities !== undefined ? sanitizeQuantities(m.quantities) : { ...mirror.quantities }
  const refundMode = typeof m.refundMode === 'boolean' ? m.refundMode : mirror.refundMode
  let refundMaxByProduct = mirror.refundMaxByProduct
  if (m.refundMaxByProduct !== undefined) {
    refundMaxByProduct =
      m.refundMaxByProduct === null
        ? null
        : (() => {
            const o: Record<string, number> = {}
            for (const [k, v] of Object.entries(m.refundMaxByProduct)) {
              if (typeof v === 'number' && v >= 0) o[k] = Math.floor(v)
            }
            return o
          })()
  }
  let refundSourceMeta = mirror.refundSourceMeta
  if (m.refundSourceMeta !== undefined) {
    refundSourceMeta = m.refundSourceMeta
  }
  const priceOverrides = m.priceOverrides !== undefined ? { ...m.priceOverrides } : { ...mirror.priceOverrides }
  for (const k of Object.keys(priceOverrides)) {
    const v = priceOverrides[k]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) delete priceOverrides[k]
  }
  const lineDiscountPct =
    m.lineDiscountPct !== undefined ? { ...m.lineDiscountPct } : { ...(mirror.lineDiscountPct ?? {}) }
  for (const k of Object.keys(lineDiscountPct)) {
    const v = lineDiscountPct[k]
    if (typeof v !== 'number' || !Number.isFinite(v)) delete lineDiscountPct[k]
    else lineDiscountPct[k] = Math.min(100, Math.max(0, Math.round(v)))
  }
  const lineDiscountReason =
    m.lineDiscountReason !== undefined
      ? { ...m.lineDiscountReason }
      : { ...(mirror.lineDiscountReason ?? {}) }
  for (const k of Object.keys(lineDiscountReason)) {
    const v = lineDiscountReason[k]
    if (typeof v !== 'string') delete lineDiscountReason[k]
    else lineDiscountReason[k] = v.trim().slice(0, 200)
  }
  let cartDiscountPct = mirror.cartDiscountPct ?? 0
  if (m.cartDiscountPct !== undefined) {
    const v = m.cartDiscountPct
    cartDiscountPct =
      typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0
  }
  let cartDiscountReason = typeof mirror.cartDiscountReason === 'string' ? mirror.cartDiscountReason : ''
  if (m.cartDiscountReason !== undefined) {
    const s = m.cartDiscountReason
    cartDiscountReason = typeof s === 'string' ? s.trim().slice(0, 200) : ''
  }
  return {
    quantities,
    refundMode,
    refundMaxByProduct,
    refundSourceMeta,
    priceOverrides,
    lineDiscountPct,
    lineDiscountReason,
    cartDiscountPct,
    cartDiscountReason
  }
}

export function getRemoteMirror(): RemoteCaisseMirror {
  return JSON.parse(JSON.stringify(mirror)) as RemoteCaisseMirror
}

export function setMirrorFromRenderer(next: RemoteCaisseMirror): void {
  mirror = sanitizeMirror(next)
}

/** Fusion partielle (HTTP tablette). */
export function patchMirrorFromHttp(partial: Partial<RemoteCaisseMirror>): void {
  mirror = sanitizeMirror({ ...mirror, ...partial })
  broadcastStateToRenderer()
}

export function replaceMirrorFromHttp(next: RemoteCaisseMirror): void {
  mirror = sanitizeMirror(next)
  broadcastStateToRenderer()
}

function broadcastStateToRenderer(): void {
  const snap = getRemoteMirror()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('remote-caisse:state-sync', snap)
  }
}

export function clearMirrorAfterSale(): void {
  mirror = {
    quantities: {},
    refundMode: false,
    refundMaxByProduct: null,
    refundSourceMeta: null,
    priceOverrides: {},
    lineDiscountPct: {},
    lineDiscountReason: {},
    cartDiscountPct: 0,
    cartDiscountReason: ''
  }
}

/** Pour chargement initial / IPC get-cart compat : quantités seules. */
export function getRemoteCartSnapshot(): Record<string, number> {
  return { ...mirror.quantities }
}
