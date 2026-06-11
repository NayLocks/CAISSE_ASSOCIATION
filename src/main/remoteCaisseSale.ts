import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import type { ProductConfig } from '../shared/catalog'
import { formatOrderLabel } from '../shared/orderDigits.js'
import { getStockMap } from '../shared/inventory'
import { cartIsCardCashExchangeSale } from '../shared/cardCashExchange.js'
import type { SaleLineSnapshot, SalePayment, SaleRecord } from '../shared/sales'
import type { TicketUnitPayload } from '../shared/ticket'
import { associationAutoSyncUploadAfterSale } from './associationAutoSync.js'
import { appendSale } from './salesHistory.js'
import { loadPersistedData, savePersistedData, logoFullPath } from './stateStore.js'
import type { RemoteCaisseMirror } from '../shared/remoteCaisseMirror.js'
import {
  finalUnitCents,
  lineBaseUnitCents,
  lineDiscountPct,
  lineDiscountReason
} from '../shared/cartLinePricing.js'
import { clearMirrorAfterSale, getRemoteMirror } from './remoteCaisseState.js'
import { clearTabletPaymentSessionFlags } from './tabletClientDisplaySync.js'
import { setClientDisplayState } from './clientDisplayServer.js'
import { printUnitTicketsToDevice } from './printWindow.js'
import { printUnitTicketsEscpos } from './thermalEscpos/index.js'
import { unitTicketDocumentOptionsFromAssociation } from './cashReceipt/receiptDocuments.js'

function stockAvailable(p: ProductConfig, stock: Record<string, number>): number {
  if (!p.trackStock) return Number.POSITIVE_INFINITY
  return stock[p.id] ?? 0
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

export type RemoteSaleResult =
  | { ok: true; orderNumber: number; totalCents: number }
  | { ok: false; error: string }

function buildLines(
  data: ReturnType<typeof loadPersistedData>,
  m: RemoteCaisseMirror
):
  | {
      ok: true
      lines: {
        product: ProductConfig
        qty: number
        unitCents: number
        listUnitCents: number
        discountPercent: number
        discountReason: string
      }[]
    }
  | { ok: false; error: string } {
  const eid = data.selectedEventId
  if (!eid) return { ok: false, error: 'Aucun événement sélectionné.' }
  const stock = getStockMap(data, eid)
  const lines: {
    product: ProductConfig
    qty: number
    unitCents: number
    listUnitCents: number
    discountPercent: number
    discountReason: string
  }[] = []
  for (const id of Object.keys(m.quantities)) {
    const q = m.quantities[id]
    if (q <= 0) continue
    const product = data.products.find((p) => p.id === id)
    if (!product) continue
    const cap = m.refundMaxByProduct?.[id]
    if (m.refundMode && cap != null && q > cap) {
      return { ok: false, error: `Quantité max pour « ${product.name} » : ${cap}.` }
    }
    const max = stockAvailable(product, stock)
    if (!m.refundMode && product.trackStock && q > max) {
      return {
        ok: false,
        error: `Stock insuffisant pour « ${product.name} » (disponible : ${max}).`
      }
    }
    const listUnitCents = lineBaseUnitCents(product.priceCents, m.priceOverrides, id)
    const discountPercent = lineDiscountPct(m.lineDiscountPct, id)
    const discountReason = lineDiscountReason(m.lineDiscountReason, id)
    const unitCents = finalUnitCents(listUnitCents, discountPercent)
    lines.push({ product, qty: q, unitCents, listUnitCents, discountPercent, discountReason })
  }
  lines.sort((a, b) => a.product.name.localeCompare(b.product.name, 'fr'))
  if (lines.length === 0) return { ok: false, error: 'Panier vide.' }
  return { ok: true, lines }
}

/**
 * Enregistre une vente ou un remboursement depuis l’état miroir (tablette ou caisse synchronisée).
 */
export async function executeRemoteSale(payment: SalePayment): Promise<RemoteSaleResult> {
  const data = loadPersistedData()
  const m = getRemoteMirror()
  const eid = data.selectedEventId
  if (!eid) {
    return { ok: false, error: 'Aucun événement sélectionné.' }
  }
  const ev = data.events.find((x) => x.id === eid)
  if (!ev) {
    return { ok: false, error: 'Événement introuvable.' }
  }
  if (ev.closed) {
    return { ok: false, error: 'Événement clôturé.' }
  }
  const sessionInfo = data.eventSessions[eid]
  if (!sessionInfo) {
    return {
      ok: false,
      error: 'Session de caisse non démarrée : indiquez le fond de caisse (sur le PC ou la tablette).'
    }
  }

  const built = buildLines(data, m)
  if (!built.ok) return built
  const { lines: snapLines } = built
  const isRefund = m.refundMode

  const subtotal = snapLines.reduce((s, l) => s + l.unitCents * l.qty, 0)
  const cartPct = Math.min(100, Math.max(0, Math.round(m.cartDiscountPct ?? 0)))
  const total = finalUnitCents(subtotal, cartPct)
  if (total < 0) return { ok: false, error: 'Total invalide.' }

  const isExchange = cartIsCardCashExchangeSale(snapLines)
  if (isExchange) {
    if (
      payment.mode !== 'card' ||
      payment.cashCents !== 0 ||
      payment.cardCents !== total ||
      payment.changeCents !== 0
    ) {
      return {
        ok: false,
        error: 'Échange carte / espèces : paiement intégral par carte uniquement.'
      }
    }
  }

  const orderNumber = data.orderCounter + 1
  const assocName = data.association.name.trim() || 'Association'

  const sale: SaleRecord = {
    id: randomUUID(),
    at: new Date().toISOString(),
    orderNumber,
    eventId: ev.id,
    eventName: ev.name,
    eventDate: ev.date,
    eventNotes: ev.notes,
    associationName: assocName,
    lines: snapLines.map((l): SaleLineSnapshot => {
      const lineTotalCents = l.unitCents * l.qty
      const snap: SaleLineSnapshot = {
        productId: l.product.id,
        name: l.product.name,
        emoji: l.product.emoji,
        qty: l.qty,
        unitCents: l.unitCents,
        lineTotalCents
      }
      if (l.listUnitCents !== l.unitCents || l.discountPercent > 0) {
        snap.listUnitCents = l.listUnitCents
      }
      if (l.discountPercent > 0) snap.discountPercent = l.discountPercent
      const dr = l.discountReason.trim()
      if (dr) snap.discountReason = dr
      return snap
    }),
    totalCents: total,
    ...(isExchange ? { cardCashExchange: true as const } : {}),
    ...(cartPct > 0 ? { cartDiscountPercent: cartPct } : {}),
    ...(typeof m.cartDiscountReason === 'string' && m.cartDiscountReason.trim()
      ? { cartDiscountReason: m.cartDiscountReason.trim().slice(0, 200) }
      : {}),
    payment,
    ...(isRefund
      ? {
          kind: 'refund' as const,
          ...(m.refundSourceMeta
            ? {
                refundSourceSaleId: m.refundSourceMeta.saleId,
                ...(m.refundSourceMeta.orderNumber != null && m.refundSourceMeta.orderNumber > 0
                  ? { refundSourceOrderNumber: m.refundSourceMeta.orderNumber }
                  : {})
              }
            : {})
        }
      : {})
  }

  const map = { ...(data.stockByEvent[eid] ?? {}) }
  for (const { product, qty } of snapLines) {
    if (!product.trackStock) continue
    const cur = map[product.id] ?? 0
    map[product.id] = isRefund ? cur + qty : Math.max(0, cur - qty)
  }

  const nextData = {
    ...data,
    stockByEvent: { ...data.stockByEvent, [eid]: map },
    orderCounter: orderNumber
  }
  savePersistedData(nextData)
  appendSale(sale)
  void associationAutoSyncUploadAfterSale()
  clearMirrorAfterSale()

  const logo = readLogoDataUrl(data.association.logoFile)

  if (!isRefund && data.printing.autoPrintTickets && data.printing.deviceName) {
    const tickets: TicketUnitPayload[] = []
    const atIso = sale.at
    for (const line of snapLines) {
      for (let i = 0; i < line.qty; i++) {
        const dr = line.discountReason.trim()
        const cartReasonTrim =
          typeof m.cartDiscountReason === 'string' ? m.cartDiscountReason.trim() : ''
        tickets.push({
          orderNumber,
          emoji: line.product.emoji,
          productName: line.product.name,
          unitPriceCents: line.unitCents,
          eventName: ev.name,
          associationName: data.association.name.trim(),
          atIso,
          ...(dr ? { discountReason: dr } : {}),
          ...(cartPct > 0 ? { cartDiscountPercent: cartPct } : {}),
          ...(cartReasonTrim ? { cartDiscountReason: cartReasonTrim.slice(0, 200) } : {})
        })
      }
    }
    const docOpts = unitTicketDocumentOptionsFromAssociation(data.association)
    if (data.printing.unitTicketEngine === 'escpos_raw') {
      await printUnitTicketsEscpos(tickets, data.printing.deviceName, {
        ...docOpts,
        logoDataUrl: logo,
        escposPaperWidth: data.printing.escposPaperWidth,
        escposCutMode: data.printing.escposCutMode,
        escposCutInverted: data.printing.escposCutInverted
      })
    } else {
      await printUnitTicketsToDevice(
        tickets,
        logo,
        data.printing.deviceName,
        data.printing.silentPrint !== false,
        docOpts
      )
    }
  }

  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(total / 100)
  clearTabletPaymentSessionFlags()
  setClientDisplayState({
    associationName: assocName,
    associationNumero: data.association.numero.trim() || undefined,
    eventName: ev.name,
    refundMode: false,
    phase: 'thanks',
    lines: [],
    totalCents: 0,
    thanksTitle: isRefund ? 'Remboursement enregistré' : 'Merci pour votre achat !',
    thanksDetail: fmt,
    orderNumberLabel: orderNumber > 0 ? formatOrderLabel(orderNumber) : null,
    logoDataUrl: logo,
    clientUiTheme: data.clientDisplayTheme ?? 'light'
  })

  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('remote-caisse:refresh-data')
    w.webContents.send('remote-caisse:sale-done', { orderNumber, totalCents: total })
  }

  return { ok: true, orderNumber, totalCents: total }
}
