import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import type { TicketUnitPayload } from '../shared/ticket.js'
import { findSaleByOrderForEvent } from './salesHistory.js'
import { receiptLegalInfoFromAssociation } from '../shared/catalog.js'
import { loadPersistedData, logoFullPath } from './stateStore.js'
import { printHtmlDocument } from './printWindow.js'
import { buildSummaryReceiptDocument, buildTicketsDocument } from './ticketHtml.js'

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

export async function executeRemoteReceiptPrint(opts: {
  orderNumber: number
  kind: 'summary' | 'units'
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = loadPersistedData()
  const eid = data.selectedEventId
  if (!eid) return { ok: false, error: 'Aucun événement sélectionné.' }
  const deviceName = data.printing.deviceName?.trim()
  if (!deviceName) {
    return { ok: false, error: 'Aucune imprimante configurée sur la caisse (menu Impression).' }
  }
  const sale = findSaleByOrderForEvent(opts.orderNumber, eid)
  if (!sale) {
    return { ok: false, error: 'Commande introuvable pour cet événement.' }
  }
  const logo = readLogoDataUrl(data.association.logoFile)
  const silent = data.printing.silentPrint !== false
  const legal = receiptLegalInfoFromAssociation(data.association)

  if (opts.kind === 'summary') {
    const html = buildSummaryReceiptDocument(sale, logo, legal)
    await printHtmlDocument(html, deviceName, silent)
    return { ok: true }
  }

  const orderNum = sale.orderNumber != null && sale.orderNumber > 0 ? sale.orderNumber : -1
  const tickets: TicketUnitPayload[] = []
  const atIso = sale.at
  for (const line of sale.lines) {
    for (let i = 0; i < line.qty; i++) {
      const dr = typeof line.discountReason === 'string' ? line.discountReason.trim() : ''
      tickets.push({
        orderNumber: orderNum,
        emoji: line.emoji,
        productName: line.name,
        unitPriceCents: line.unitCents,
        eventName: sale.eventName,
        associationName: sale.associationName.trim(),
        atIso,
        ...(dr ? { discountReason: dr } : {}),
        ...(sale.cartDiscountPercent != null && sale.cartDiscountPercent > 0
          ? { cartDiscountPercent: sale.cartDiscountPercent }
          : {}),
        ...(typeof sale.cartDiscountReason === 'string' && sale.cartDiscountReason.trim()
          ? { cartDiscountReason: sale.cartDiscountReason.trim() }
          : {})
      })
    }
  }
  if (tickets.length === 0) {
    return { ok: false, error: 'Aucune ligne pour cette vente.' }
  }
  const html = buildTicketsDocument(tickets, logo)
  await printHtmlDocument(html, deviceName, silent)
  return { ok: true }
}
