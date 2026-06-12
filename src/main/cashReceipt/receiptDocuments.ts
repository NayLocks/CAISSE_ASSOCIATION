import type { TicketUnitPayload } from '../../shared/ticket'
import { shouldShowDiscountMotifOnUnitTicket } from '../../shared/ticket.js'
import type { SaleLineSnapshot, SaleRecord } from '../../shared/sales'
import type { AssociationConfig, ReceiptLegalInfo } from '../../shared/catalog'
import { clampReceiptLogoWidthPercent } from '../../shared/catalog.js'
import {
  RECEIPT_DOCUMENT_ROOT_ID,
  SUMMARY_RECEIPT_LINES_PER_PRINT_CHUNK
} from './constants.js'
import { escHtml, escHtmlMultiline, formatMoneyEur, formatOrderNo } from './formatting.js'
import {
  orderLineHtml,
  paymentSummaryHtml,
  receiptFooterLegalHtml,
  unitTicketFootDatelineHtml,
  unitTicketMotifHtml
} from './receiptFragments.js'
import { receiptDocumentStyles, type ReceiptDocumentCssOptions } from './receiptDocumentCss.js'

export type UnitTicketsDocumentOptions = {
  logoWidthPercent?: number
  validityNotice?: string
  /** Si false, pas de logo (même si `logoDataUrl` est fourni). Défaut : afficher. */
  unitTicketShowLogo?: boolean
  /** Si false, pas de date/heure en pied. Défaut : afficher. */
  unitTicketShowDateTime?: boolean
  /** Si false, pas du nom d’association en pied. Défaut : afficher. */
  unitTicketShowAssociationName?: boolean
}

export function unitTicketDocumentOptionsFromAssociation(a: AssociationConfig): UnitTicketsDocumentOptions {
  const vnRaw = typeof a.unitTicketValidityNotice === 'string' ? a.unitTicketValidityNotice : ''
  const vn = vnRaw.trim()
  return {
    logoWidthPercent: clampReceiptLogoWidthPercent(a.receiptLogoWidthPercent),
    validityNotice: vn.length > 0 ? vn : undefined,
    unitTicketShowLogo: a.unitTicketShowLogo !== false,
    unitTicketShowDateTime: a.unitTicketShowDateTime !== false,
    unitTicketShowAssociationName: a.unitTicketShowAssociationName !== false
  }
}

export function buildTicketsDocument(
  tickets: TicketUnitPayload[],
  logoDataUrl: string | null,
  options?: UnitTicketsDocumentOptions
): string {
  const cssOpts: ReceiptDocumentCssOptions = {
    logoWidthPercent: options?.logoWidthPercent
  }
  const rawValidity =
    typeof options?.validityNotice === 'string' ? options.validityNotice.trim() : ''
  const showLogo = options?.unitTicketShowLogo !== false
  const showDateTime = options?.unitTicketShowDateTime !== false
  const showAssoName = options?.unitTicketShowAssociationName !== false
  const blocks = tickets
    .map((t) => {
      const dt = new Date(t.atIso)
      const logoBlock =
        showLogo && logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : ''
      const asso = t.associationName.trim()
      const footAsso =
        showAssoName && asso ? `<div class="foot-asso">${escHtml(asso)}</div>` : ''
      const dateLong = dt.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
      const timeShort = dt.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      const footDateline = showDateTime ? unitTicketFootDatelineHtml(dateLong, timeShort) : ''
      const footBlock =
        footAsso || footDateline
          ? `<div class="foot foot-unit">
          ${footAsso}
          ${footDateline}
        </div>`
          : ''
      const dr = typeof t.discountReason === 'string' ? t.discountReason.trim() : ''
      const lineMotifBlock =
        dr && shouldShowDiscountMotifOnUnitTicket(dr) ? unitTicketMotifHtml(dr) : ''
      const cartCr = typeof t.cartDiscountReason === 'string' ? t.cartDiscountReason.trim() : ''
      /** Pas de montant / % sur le ticket unitaire : uniquement le texte du motif (si présent). */
      const cartMotifBlock = cartCr.length > 0 ? unitTicketMotifHtml(cartCr) : ''
      const validityBlock =
        rawValidity.length > 0
          ? `<div class="validity-notice-wrap"><div class="validity-notice">${escHtmlMultiline(
              rawValidity
            )}</div></div>`
          : ''
      return `
      <section class="ticket ticket-unit">
        ${logoBlock}
        ${orderLineHtml(t.orderNumber)}
        <div class="event">${escHtml(t.eventName)}</div>
        <div class="product-row">
          <div class="qtyline">1 × ${escHtml(t.productName)}</div>
        </div>
        ${lineMotifBlock}
        ${cartMotifBlock}
        ${validityBlock}
        ${footBlock ? `<div class="rule"></div>${footBlock}` : ''}
      </section>`
    })
    .join('\n')

  return receiptHtmlShell(blocks, cssOpts)
}

/** Ticket physique « panier en attente » (numéro Ticket NNN + libellé d’attente). */
export function buildHoldSlipDocument(
  payload: {
    ticketLabel: string
    associationName: string
    eventName: string
    atIso: string
  },
  logoDataUrl: string | null,
  options?: UnitTicketsDocumentOptions
): string {
  const cssOpts: ReceiptDocumentCssOptions = {
    logoWidthPercent: options?.logoWidthPercent
  }
  const dt = new Date(payload.atIso)
  const showLogo = options?.unitTicketShowLogo !== false
  const showDateTime = options?.unitTicketShowDateTime !== false
  const showAssoName = options?.unitTicketShowAssociationName !== false
  const logoBlock =
    showLogo && logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : ''
  const asso = payload.associationName.trim()
  const footAsso =
    showAssoName && asso ? `<div class="foot-asso">${escHtml(asso)}</div>` : ''
  const dateLong = dt.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeShort = dt.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const footDateline = showDateTime ? unitTicketFootDatelineHtml(dateLong, timeShort) : ''
  const footBlock =
    footAsso || footDateline
      ? `<div class="foot foot-unit">
          ${footAsso}
          ${footDateline}
        </div>`
      : ''
  const slipLine = `${payload.ticketLabel} d’attente`
  const block = `
      <section class="ticket ticket-unit">
        ${logoBlock}
        <div class="orderno">${escHtml(payload.ticketLabel)}</div>
        <div class="hold-slip-kind">${escHtml(slipLine)}</div>
        <div class="event">${escHtml(payload.eventName.trim() || '—')}</div>
        ${footBlock ? `<div class="rule"></div>${footBlock}` : ''}
      </section>`

  return receiptHtmlShell(block, cssOpts)
}

function centsSafe(raw: unknown): number {
  const n = Number(raw)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function strSafe(raw: unknown): string {
  if (raw == null) return ''
  return typeof raw === 'string' ? raw : String(raw)
}

function saleLineToRowHtml(l: SaleLineSnapshot): string {
  const pct = centsSafe(l.discountPercent)
  const reason = typeof l.discountReason === 'string' ? l.discountReason.trim() : ''
  const qty = Math.max(0, centsSafe(l.qty))
  const unitNet = centsSafe(l.unitCents)
  const lineTot = centsSafe(l.lineTotalCents)
  const listU =
    l.listUnitCents != null && Number.isFinite(l.listUnitCents) ? centsSafe(l.listUnitCents) : unitNet
  const avantLigne = listU * qty
  const apresLigne = lineTot
  const remParts: string[] = []
  if (pct > 0 || avantLigne !== apresLigne) {
    remParts.push(
      `Sans remise ligne : ${formatMoneyEur(avantLigne)} — Avec remise : ${formatMoneyEur(apresLigne)}`
    )
  }
  if (pct > 0) remParts.push(`Remise ${pct} %`)
  if (reason) remParts.push(reason)
  const remiseRow =
    remParts.length > 0
      ? `<tr class="line-remise-row"><td colspan="4">${escHtml(remParts.join(' — '))}</td></tr>`
      : ''
  return `<tr>
      <td>${escHtml(strSafe(l.name))}</td>
      <td class="r">${qty}</td>
      <td class="r">${formatMoneyEur(unitNet)}</td>
      <td class="r">${formatMoneyEur(lineTot)}</td>
    </tr>${remiseRow}`
}

function saleLinesToRowsHtml(lines: SaleLineSnapshot[]): string {
  return lines.map((l) => saleLineToRowHtml(l)).join('')
}

function summaryRecapCartBlockIfAny(sale: SaleRecord): string {
  const linesArr = Array.isArray(sale.lines) ? sale.lines : []
  const hasPct = (sale.cartDiscountPercent ?? 0) > 0
  const crRaw = typeof sale.cartDiscountReason === 'string' ? sale.cartDiscountReason.trim() : ''
  if (!hasPct && !crRaw) return ''
  const cp = centsSafe(sale.cartDiscountPercent)
  const cr = crRaw
  const subLines = linesArr.reduce((s, l) => s + centsSafe(l.lineTotalCents), 0)
  const totalCentsSafe = centsSafe(sale.totalCents)
  const remiseGlobCents = subLines - totalCentsSafe
  const pctLabel = cp > 0 ? ` (${cp} %)` : ''
  return `<div class="recap-cart-block">
              <div class="recap-cart-line">Sous-total (lignes) : ${escHtml(formatMoneyEur(subLines))}</div>
              <div class="recap-cart-line">Montant remise globale${escHtml(pctLabel)} : ${escHtml(formatMoneyEur(remiseGlobCents))}</div>
              ${cr ? `<div class="recap-cart-line">Motif : ${escHtml(cr)}</div>` : ''}
            </div>`
}

export function buildSummaryReceiptDocument(
  sale: SaleRecord,
  logoDataUrl: string | null,
  legal: ReceiptLegalInfo,
  options?: ReceiptDocumentCssOptions
): string {
  const linesArr = Array.isArray(sale.lines) ? sale.lines : []
  const dt = new Date(sale.at)
  const dateStr = dt.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeStr = dt.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const logoBlock = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : ''
  const ord =
    sale.orderNumber != null && sale.orderNumber > 0
      ? `<div class="orderno big">${escHtml(formatOrderNo(sale.orderNumber))}</div>`
      : `<div class="orderno">Vente (archive)</div>`

  const lineRows = saleLinesToRowsHtml(linesArr)

  const refundBanner =
    sale.kind === 'refund' ? `<div class="refund-banner">REMBOURSEMENT</div>` : ''
  const refundOriginLine =
    sale.kind === 'refund' &&
    sale.refundSourceOrderNumber != null &&
    sale.refundSourceOrderNumber > 0
      ? `<div class="refund-origin-line">Vente d’origine : ${escHtml(formatOrderNo(sale.refundSourceOrderNumber))}</div>`
      : ''
  const totalLabel = sale.kind === 'refund' ? 'Total remboursé' : 'Total'
  const footMsg = sale.kind === 'refund' ? 'Remboursement enregistré' : 'Merci de votre visite'

  const body = `
  <section class="ticket receipt-full">
    ${logoBlock}
    ${refundBanner}
    ${ord}
    ${refundOriginLine}
    <div class="doc-type">Ticket de caisse — Reçu de paiement</div>
    <div class="event">${escHtml(strSafe(sale.eventName))}</div>
    <div class="dt">${escHtml(dateStr)} - ${escHtml(timeStr)}</div>
    <div class="rule"></div>
    <table class="lines">
      <thead><tr><th>Article</th><th class="r">Qté</th><th class="r">P.u.</th><th class="r">Total</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    ${summaryRecapCartBlockIfAny(sale)}
    <div class="rule"></div>
    <div class="total">${escHtml(totalLabel)} : ${formatMoneyEur(centsSafe(sale.totalCents))}</div>
    ${paymentSummaryHtml(sale)}
    <div class="rule"></div>
    <div class="foot">${escHtml(footMsg)}</div>
    ${receiptFooterLegalHtml(sale, legal)}
  </section>`

  return receiptHtmlShell(body, options)
}

/**
 * Même contenu que le récap PDF/e-mail, découpé en plusieurs HTML si beaucoup de lignes.
 * Chaque partie ≈ un job d’impression thermique (évite page gigantesque = spouleur Windows HS).
 */
export function buildSummaryReceiptPrintHtmlPages(
  sale: SaleRecord,
  logoDataUrl: string | null,
  legal: ReceiptLegalInfo,
  options?: ReceiptDocumentCssOptions
): string[] {
  const linesArr = Array.isArray(sale.lines) ? sale.lines : []
  if (linesArr.length <= SUMMARY_RECEIPT_LINES_PER_PRINT_CHUNK) {
    return [buildSummaryReceiptDocument(sale, logoDataUrl, legal, options)]
  }

  const dt = new Date(sale.at)
  const dateStr = dt.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeStr = dt.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const n = linesArr.length
  const chunkSize = SUMMARY_RECEIPT_LINES_PER_PRINT_CHUNK
  const numChunks = Math.ceil(n / chunkSize)
  const pages: string[] = []
  for (let c = 0; c < numChunks; c++) {
    const slice = linesArr.slice(c * chunkSize, (c + 1) * chunkSize)
    const body = buildSummaryReceiptPrintChunkSection({
      sale,
      legal,
      logoDataUrl,
      linesSlice: slice,
      dateStr,
      timeStr,
      partIndex: c + 1,
      totalParts: numChunks,
      isFirst: c === 0,
      isLast: c === numChunks - 1
    })
    pages.push(receiptHtmlShell(body, options))
  }
  return pages
}

function buildSummaryReceiptPrintChunkSection(opts: {
  sale: SaleRecord
  legal: ReceiptLegalInfo
  logoDataUrl: string | null
  linesSlice: SaleLineSnapshot[]
  dateStr: string
  timeStr: string
  partIndex: number
  totalParts: number
  isFirst: boolean
  isLast: boolean
}): string {
  const {
    sale,
    legal,
    logoDataUrl,
    linesSlice,
    dateStr,
    timeStr,
    partIndex,
    totalParts,
    isFirst,
    isLast
  } = opts

  const logoBlock = isFirst && logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : ''
  const ord =
    sale.orderNumber != null && sale.orderNumber > 0
      ? `<div class="orderno big">${escHtml(formatOrderNo(sale.orderNumber))}</div>`
      : `<div class="orderno">Vente (archive)</div>`
  const refundBanner =
    sale.kind === 'refund' ? `<div class="refund-banner">REMBOURSEMENT</div>` : ''
  const refundOriginLine =
    sale.kind === 'refund' &&
    sale.refundSourceOrderNumber != null &&
    sale.refundSourceOrderNumber > 0
      ? `<div class="refund-origin-line">Vente d’origine : ${escHtml(formatOrderNo(sale.refundSourceOrderNumber))}</div>`
      : ''
  const totalLabel = sale.kind === 'refund' ? 'Total remboursé' : 'Total'
  const footMsg = sale.kind === 'refund' ? 'Remboursement enregistré' : 'Merci de votre visite'
  const lineRows = saleLinesToRowsHtml(linesSlice)

  const orderRef =
    sale.orderNumber != null && sale.orderNumber > 0
      ? escHtml(formatOrderNo(sale.orderNumber))
      : 'Vente (archive)'

  const continuationHdr =
    !isFirst
      ? `<div class="recap-continuation-hdr">Suite — ${orderRef} · ${escHtml(dateStr)} · ${escHtml(
          timeStr
        )} · ${partIndex}/${totalParts}</div><div class="rule"></div>`
      : ''

  const headerBlock = isFirst
    ? `${logoBlock}
    ${refundBanner}
    ${ord}
    ${refundOriginLine}
    <div class="doc-type">Ticket de caisse — Reçu de paiement</div>
    <div class="event">${escHtml(strSafe(sale.eventName))}</div>
    <div class="dt">${escHtml(dateStr)} - ${escHtml(timeStr)}</div>
    <div class="rule"></div>`
    : continuationHdr

  const tableBlock = `<table class="lines">
      <thead><tr><th>Article</th><th class="r">Qté</th><th class="r">P.u.</th><th class="r">Total</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>`

  const middleNote = !isLast ? `<div class="recap-continue-note">Suite du ticket…</div>` : ''

  const lastBlock = isLast
    ? `${summaryRecapCartBlockIfAny(sale)}
    <div class="rule"></div>
    <div class="total">${escHtml(totalLabel)} : ${formatMoneyEur(centsSafe(sale.totalCents))}</div>
    ${paymentSummaryHtml(sale)}
    <div class="rule"></div>
    <div class="foot">${escHtml(footMsg)}</div>
    ${receiptFooterLegalHtml(sale, legal)}`
    : ''

  return `
  <section class="ticket receipt-full">
    ${headerBlock}
    ${tableBlock}
    ${middleNote}
    ${lastBlock}
  </section>`
}

function receiptHtmlShell(innerBody: string, cssOpts?: ReceiptDocumentCssOptions): string {
  const css = receiptDocumentStyles(undefined, cssOpts)
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title></title>
<style>${css}</style>
</head>
<body>
<div id="${RECEIPT_DOCUMENT_ROOT_ID}">
${innerBody}
</div>
</body>
</html>`
}
