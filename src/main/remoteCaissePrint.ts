import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import type { TicketUnitPayload } from '../shared/ticket.js'
import { findSaleByOrderForEvent } from './salesHistory.js'
import { receiptLegalInfoFromAssociation, clampReceiptLogoWidthPercent } from '../shared/catalog.js'
import { loadPersistedData, logoFullPath } from './stateStore.js'
import {
  printReceiptHtmlPages,
  buildSummaryReceiptPrintHtmlPages,
  printUnitTicketsToDevice
} from './printWindow.js'
import { printUnitTicketsEscpos } from './thermalEscpos/index.js'
import {
  buildHoldSlipDocument,
  unitTicketDocumentOptionsFromAssociation
} from './cashReceipt/receiptDocuments.js'
import { printReceiptDocument } from './cashReceipt/index.js'

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

/** Ticket d’attente demandé par la tablette (même rendu que le PC, imprimante de la caisse). */
export async function executeRemoteHoldSlipPrint(
  ticketLabel: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = loadPersistedData()
  const deviceName = data.printing.deviceName?.trim()
  if (!deviceName) {
    return { ok: false, error: 'Aucune imprimante configurée sur la caisse (menu Impression).' }
  }
  const eid = data.selectedEventId
  const ev = eid ? data.events.find((x) => x.id === eid) : undefined
  const logo = readLogoDataUrl(data.association.logoFile)
  const docOpts = unitTicketDocumentOptionsFromAssociation(data.association)
  const html = buildHoldSlipDocument(
    {
      ticketLabel: ticketLabel.trim(),
      associationName: data.association.name.trim(),
      eventName: ev?.name?.trim() ?? '—',
      atIso: new Date().toISOString()
    },
    logo,
    docOpts
  )
  const silent = data.printing.silentPrint !== false
  const r = await printReceiptDocument(html, deviceName, silent)
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Impression impossible.' }
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
    const pages = buildSummaryReceiptPrintHtmlPages(sale, logo, legal, {
      logoWidthPercent: clampReceiptLogoWidthPercent(data.association.receiptLogoWidthPercent)
    })
    const r = await printReceiptHtmlPages(pages, deviceName, silent)
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Impression récap impossible.' }
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
  const docOpts = unitTicketDocumentOptionsFromAssociation(data.association)
  if (data.printing.unitTicketEngine === 'escpos_raw') {
    const r = await printUnitTicketsEscpos(tickets, deviceName, {
      ...docOpts,
      logoDataUrl: logo,
      escposPaperWidth: data.printing.escposPaperWidth,
      escposCutMode: data.printing.escposCutMode,
      escposCutInverted: data.printing.escposCutInverted
    })
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Impression ESC/POS impossible.' }
  }
  const r = await printUnitTicketsToDevice(tickets, logo, deviceName, silent, docOpts)
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Impression impossible.' }
}
