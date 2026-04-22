import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import { BrowserWindow } from 'electron'
import type {
  ClientDisplayCartDiscountSummary,
  ClientDisplayLine,
  ClientDisplayPhase,
  ClientDisplayState,
  ClientPaymentDetail
} from '../shared/clientDisplay.js'
import { buildClientLineDetailLines } from '../shared/clientDisplayLineDetail.js'

export function parseClientPaymentDetail(raw: unknown): ClientPaymentDetail | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = o.kind
  if (kind !== 'choose' && kind !== 'cash' && kind !== 'card') return null
  const refundMode = Boolean(o.refundMode)
  const tc = o.totalCents
  const totalCents = typeof tc === 'number' && Number.isFinite(tc) ? Math.max(0, Math.floor(tc)) : 0

  if (kind === 'choose') {
    return { kind: 'choose', totalCents, refundMode }
  }
  if (kind === 'cash') {
    const cg = o.cashGivenCents
    const chg = o.changeCents
    const sh = o.shortCents
    return {
      kind: 'cash',
      totalCents,
      refundMode,
      cashGivenCents: typeof cg === 'number' && Number.isFinite(cg) ? Math.max(0, Math.floor(cg)) : 0,
      changeCents: typeof chg === 'number' && Number.isFinite(chg) ? Math.max(0, Math.floor(chg)) : 0,
      shortCents: typeof sh === 'number' && Number.isFinite(sh) ? Math.max(0, Math.floor(sh)) : 0,
      canValidateCash: Boolean(o.canValidateCash),
      canMixed: Boolean(o.canMixed)
    }
  }
  const sp = o.sumupPhase
  const sumupPhase =
    sp === 'idle' || sp === 'creating' || sp === 'waiting' || sp === 'error' ? sp : 'idle'
  const cc = o.cardChargeCents
  /** Toujours renseigné : montant carte (complément mixte ou total si carte seule). */
  const cardChargeCents =
    typeof cc === 'number' && Number.isFinite(cc) ? Math.max(0, Math.floor(cc)) : totalCents
  return {
    kind: 'card',
    totalCents,
    cardChargeCents,
    refundMode,
    sumupPhase,
    sumupActive: Boolean(o.sumupActive),
    terminalAuto: Boolean(o.terminalAuto)
  }
}
import { finalUnitCents, lineBaseUnitCents, lineDiscountPct, lineDiscountReason } from '../shared/cartLinePricing.js'
import { loadPersistedData, logoFullPath } from './stateStore.js'
import { getRemoteMirror } from './remoteCaisseState.js'
import { setClientDisplayState } from './clientDisplayServer.js'

let tabletPaymentOpen = false
let tabletPaymentDetail: ClientPaymentDetail | null = null

export function getTabletPaymentOverlay(): { active: boolean; detail: ClientPaymentDetail | null } {
  return { active: tabletPaymentOpen, detail: tabletPaymentDetail }
}

function logoMime(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function readLogoDataUrl(fileName: string | null): string | null {
  if (!fileName) return null
  const full = logoFullPath(fileName)
  if (!existsSync(full)) return null
  const buf = readFileSync(full)
  const mime = logoMime(extname(fileName))
  if (mime === 'image/svg+xml') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString('utf-8'))}`
  }
  return `data:${mime};base64,${buf.toString('base64')}`
}

function buildLinesAndTotal(): {
  lines: ClientDisplayLine[]
  totalCents: number
  cartDiscountSummary: ClientDisplayCartDiscountSummary | undefined
} {
  const data = loadPersistedData()
  const m = getRemoteMirror()
  const lines: ClientDisplayLine[] = []
  for (const id of Object.keys(m.quantities)) {
    const q = m.quantities[id]
    if (q <= 0) continue
    const p = data.products.find((pr) => pr.id === id)
    if (!p) continue
    const base = lineBaseUnitCents(p.priceCents, m.priceOverrides, id)
    const pct = lineDiscountPct(m.lineDiscountPct, id)
    const unitCents = finalUnitCents(base, pct)
    const reason = lineDiscountReason(m.lineDiscountReason, id)
    const lineDetailLines = buildClientLineDetailLines({
      qty: q,
      unitCents,
      listUnitCents: base,
      discountPercent: pct,
      discountReason: reason
    })
    lines.push({
      emoji: p.emoji,
      name: p.name,
      qty: q,
      unitCents,
      lineTotalCents: unitCents * q,
      ...(lineDetailLines.length > 0 ? { lineDetailLines } : {})
    })
  }
  lines.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const subtotal = lines.reduce((s, l) => s + l.lineTotalCents, 0)
  const cartPct = Math.min(100, Math.max(0, Math.round(m.cartDiscountPct ?? 0)))
  const cartReasonTrim =
    typeof m.cartDiscountReason === 'string' ? m.cartDiscountReason.trim() : ''
  const totalCents = finalUnitCents(subtotal, cartPct)
  const hasCart = cartPct > 0 || cartReasonTrim.length > 0
  const cartDiscountSummary: ClientDisplayCartDiscountSummary | undefined =
    hasCart && lines.length > 0
      ? {
          linesSubtotalCents: subtotal,
          discountAmountCents: subtotal - totalCents,
          ...(cartPct > 0 ? { percent: cartPct } : {}),
          ...(cartReasonTrim ? { reason: cartReasonTrim.slice(0, 200) } : {})
        }
      : undefined
  return { lines, totalCents, cartDiscountSummary }
}

/**
 * Pousse l’état vers l’écran client (navigateur) quand la tablette ouvre / modifie le paiement.
 */
export function applyTabletClientDisplayPush(): void {
  const data = loadPersistedData()
  const m = getRemoteMirror()
  const eid = data.selectedEventId
  const ev = eid ? data.events.find((x) => x.id === eid) : undefined

  const { lines, totalCents, cartDiscountSummary } = buildLinesAndTotal()

  let phase: ClientDisplayPhase
  let paymentDetail: ClientPaymentDetail | null | undefined

  if (tabletPaymentOpen && tabletPaymentDetail) {
    phase = 'payment'
    paymentDetail = tabletPaymentDetail
  } else if (lines.length > 0) {
    phase = 'cart'
    paymentDetail = undefined
  } else {
    phase = 'welcome'
    paymentDetail = undefined
  }

  const payload: ClientDisplayState = {
    associationName: data.association.name.trim() || 'Buvette',
    associationNumero: data.association.numero.trim() || undefined,
    eventName: ev?.name ?? null,
    refundMode: m.refundMode,
    phase,
    lines,
    totalCents,
    ...(cartDiscountSummary ? { cartDiscountSummary } : {}),
    paymentDetail: paymentDetail ?? undefined,
    logoDataUrl: readLogoDataUrl(data.association.logoFile),
    clientUiTheme: data.clientDisplayTheme ?? 'light'
  }

  setClientDisplayState(payload)

  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('remote-caisse:tablet-payment-overlay')
  }
}

export function setTabletPaymentSession(open: boolean, detail: ClientPaymentDetail | null): void {
  tabletPaymentOpen = open
  tabletPaymentDetail = detail
  applyTabletClientDisplayPush()
}

/** Après une vente tablette : évite que la caisse fusionne encore l’overlay paiement ; sans repousser l’écran client (merci déjà appliqué). */
export function clearTabletPaymentSessionFlags(): void {
  tabletPaymentOpen = false
  tabletPaymentDetail = null
}
