import { BrowserWindow } from 'electron'

import type { RemoteCaisseMirror } from '../shared/remoteCaisseMirror.js'



export type { RemoteCaisseMirror }



export type CartEditor = 'pc' | 'tablet' | null



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

let cartEditor: CartEditor = null



/**

 * Révision d’état pour la tablette : incrémentée à chaque changement (panier miroir

 * ou données persistées). La tablette la sonde et se rafraîchit quand elle change.

 */

let stateRev = 1



export function bumpRemoteStateRev(): void {

  stateRev += 1

}



export function getRemoteStateRev(): number {

  return stateRev

}



export function getCartEditor(): CartEditor {

  return cartEditor

}



export function getRemoteCartGate(): { cartEditor: CartEditor } {

  return { cartEditor }

}



function mirrorHasActiveCart(m: RemoteCaisseMirror): boolean {

  if (m.refundMode) return true

  return Object.values(m.quantities).some((q) => typeof q === 'number' && q > 0)

}



function updateCartEditorAfterMirror(source: 'pc' | 'tablet', m: RemoteCaisseMirror): void {

  if (mirrorHasActiveCart(m)) {

    cartEditor = source

  } else if (cartEditor === source) {

    cartEditor = null

  }

}



function broadcastCartEditor(): void {

  for (const w of BrowserWindow.getAllWindows()) {

    w.webContents.send('remote-caisse:cart-editor', cartEditor)

  }

}



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

  updateCartEditorAfterMirror('pc', mirror)

  bumpRemoteStateRev()

}



export function trySetMirrorFromRenderer(

  next: RemoteCaisseMirror

): { ok: true } | { ok: false; error: string } {

  if (cartEditor === 'tablet' && mirrorHasActiveCart(mirror)) {

    return {

      ok: false,

      error:

        'La tablette édite le panier partagé. Terminez ou videz le panier sur la tablette avant de modifier la caisse PC.'

    }

  }

  mirror = sanitizeMirror(next)

  updateCartEditorAfterMirror('pc', mirror)

  bumpRemoteStateRev()

  broadcastCartEditor()

  return { ok: true }

}



/** Fusion partielle (HTTP tablette). */

export function patchMirrorFromHttp(partial: Partial<RemoteCaisseMirror>): void {

  mirror = sanitizeMirror({ ...mirror, ...partial })

  updateCartEditorAfterMirror('tablet', mirror)

  bumpRemoteStateRev()

  broadcastStateToRenderer()

  broadcastCartEditor()

}



export function replaceMirrorFromHttp(next: RemoteCaisseMirror): void {

  mirror = sanitizeMirror(next)

  updateCartEditorAfterMirror('tablet', mirror)

  bumpRemoteStateRev()

  broadcastStateToRenderer()

  broadcastCartEditor()

}



export function tryReplaceMirrorFromHttp(

  next: RemoteCaisseMirror

): { ok: true } | { ok: false; error: string } {

  if (cartEditor === 'pc' && mirrorHasActiveCart(mirror)) {

    return {

      ok: false,

      error:

        'La caisse PC édite le panier partagé. Terminez ou videz le panier sur le PC avant de modifier la tablette.'

    }

  }

  mirror = sanitizeMirror(next)

  updateCartEditorAfterMirror('tablet', mirror)

  bumpRemoteStateRev()

  broadcastStateToRenderer()

  broadcastCartEditor()

  return { ok: true }

}



function broadcastStateToRenderer(): void {

  const snap = getRemoteMirror()

  for (const w of BrowserWindow.getAllWindows()) {

    w.webContents.send('remote-caisse:state-sync', snap)

  }

}



/** Reprise forcée du panier partagé (inverse lecture seule / édition). */
export function forceClaimCartEditor(
  source: 'pc' | 'tablet'
): { ok: true; cartEditor: CartEditor; previousEditor: CartEditor } {
  const previousEditor = cartEditor
  cartEditor = source
  bumpRemoteStateRev()
  broadcastCartEditor()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('remote-caisse:cart-control-forced', {
      cartEditor,
      previousEditor,
      claimedBy: source
    })
  }
  return { ok: true, cartEditor, previousEditor }
}

export function clearMirrorAfterSale(): void {

  bumpRemoteStateRev()

  mirror = defaultMirror()

  cartEditor = null

  broadcastCartEditor()

}



/** Pour chargement initial / IPC get-cart compat : quantités seules. */

export function getRemoteCartSnapshot(): Record<string, number> {

  return { ...mirror.quantities }

}


