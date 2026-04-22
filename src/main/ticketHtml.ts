import type { TicketUnitPayload } from '../shared/ticket'
import {
  cartGlobalReasonIsBenevole,
  shouldShowDiscountMotifOnUnitTicket
} from '../shared/ticket.js'
import type { SaleRecord } from '../shared/sales'
import type { ReceiptLegalInfo } from '../shared/catalog'
import { tvaMentionLines } from '../shared/catalog.js'
import { TICKET_WIDTH_MM } from './printWindow.js'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function orderLineHtml(orderNumber: number): string {
  if (orderNumber === 0) {
    return `<div class="orderno">Essai d’impression</div>`
  }
  if (orderNumber < 0) {
    return `<div class="orderno">Commande (vente archivée)</div>`
  }
  return `<div class="orderno">Commande ${esc(formatOrderNo(orderNumber))}</div>`
}

function formatOrderNo(n: number): string {
  return `N° ${String(n).padStart(6, '0')}`
}

function paymentSummaryHtml(s: SaleRecord): string {
  const p = s.payment
  const lines: string[] = []
  if (s.kind === 'refund') {
    if (p.mode === 'card') lines.push('Remboursement : carte bancaire')
    else if (p.mode === 'cash') {
      lines.push(`Espèces remises : ${formatMoney(p.cashCents)}`)
      if (p.changeCents > 0) lines.push(`Reprise monnaie : ${formatMoney(p.changeCents)}`)
    } else {
      lines.push(`Espèces remises : ${formatMoney(p.cashCents)}`)
      lines.push(`Carte : ${formatMoney(p.cardCents)}`)
    }
  } else {
    if (p.mode === 'card') lines.push('Paiement : carte bancaire')
    else if (p.mode === 'cash') {
      lines.push(`Espèces : ${formatMoney(p.cashCents)}`)
      if (p.changeCents > 0) lines.push(`Rendu : ${formatMoney(p.changeCents)}`)
    } else {
      lines.push(`Espèces : ${formatMoney(p.cashCents)}`)
      lines.push(`Carte : ${formatMoney(p.cardCents)}`)
    }
  }
  return lines.map((l) => `<div class="payline">${esc(l)}</div>`).join('')
}

/** Pied de ticket (après total / paiement / remerciement), même disposition que ticket exporté. */
function receiptFooterLegalHtml(sale: SaleRecord, legal: ReceiptLegalInfo): string {
  const addrInner = legal.legalAddress
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => `<div class="legal-line">${esc(line)}</div>`)
    .join('')
  const siretLine = legal.siret.trim()
    ? `<div class="legal-id">N° SIRET : ${esc(legal.siret.trim())}</div>`
    : ''
  const numeroLine = legal.numero.trim()
    ? `<div class="legal-id">N° association : ${esc(legal.numero.trim())}</div>`
    : ''
  const noteLines = tvaMentionLines(legal.receiptLegalNote)
    .map((line) => `<div class="legal-note-line">${esc(line)}</div>`)
    .join('')

  return `<div class="legal-block legal-block-footer">
      <div class="asso legal-emitter">${esc(sale.associationName.trim() || 'Association')}</div>
      ${addrInner}
      ${siretLine}
      ${numeroLine}
      ${noteLines}
    </div>`
}

export function buildTicketsDocument(
  tickets: TicketUnitPayload[],
  logoDataUrl: string | null
): string {
  const blocks = tickets
    .map((t) => {
      const dt = new Date(t.atIso)
      const logoBlock = logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="" />` : ''
      const asso = t.associationName.trim()
      const footAsso = asso ? `<div class="foot-asso">${esc(asso)}</div>` : ''
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
      const dr = typeof t.discountReason === 'string' ? t.discountReason.trim() : ''
      const motifBlock =
        dr && shouldShowDiscountMotifOnUnitTicket(dr)
          ? `<div class="unit-motif">${esc(dr)}</div>`
          : ''
      const cartCr = typeof t.cartDiscountReason === 'string' ? t.cartDiscountReason.trim() : ''
      const cartPct = typeof t.cartDiscountPercent === 'number' && Number.isFinite(t.cartDiscountPercent) ? t.cartDiscountPercent : 0
      const cartBenevoleBlock =
        cartCr && cartGlobalReasonIsBenevole(cartCr)
          ? `<div class="unit-motif unit-motif--global">Remise globale${
              cartPct > 0 ? ` ${cartPct} %` : ''
            } — ${esc(cartCr)}</div>`
          : ''
      return `
      <section class="ticket ticket-unit">
        ${logoBlock}
        ${orderLineHtml(t.orderNumber)}
        <div class="event">${esc(t.eventName)}</div>
        <div class="product-row">
          <div class="qtyline">1 × ${esc(t.productName)}</div>
        </div>
        ${motifBlock}
        ${cartBenevoleBlock}
        <div class="validity-notice">Ce ticket n'est valable que le jour où il a été acheté.</div>
        <div class="rule"></div>
        <div class="foot foot-unit">
          ${footAsso}
          <div class="foot-dt">${esc(dateLong)}</div>
          <div class="foot-time">${esc(timeShort)}</div>
        </div>
      </section>`
    })
    .join('\n')

  return documentShell(blocks)
}

/** Ticket de caisse récapitulatif (une page) */
export function buildSummaryReceiptDocument(
  sale: SaleRecord,
  logoDataUrl: string | null,
  legal: ReceiptLegalInfo
): string {
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
      ? `<div class="orderno big">${esc(formatOrderNo(sale.orderNumber))}</div>`
      : `<div class="orderno">Vente (archive)</div>`

  const lineRows = sale.lines
    .map((l) => {
      const pct = l.discountPercent ?? 0
      const reason = typeof l.discountReason === 'string' ? l.discountReason.trim() : ''
      const listU =
        l.listUnitCents != null && Number.isFinite(l.listUnitCents) ? l.listUnitCents : l.unitCents
      const avantLigne = listU * l.qty
      const apresLigne = l.lineTotalCents
      const remParts: string[] = []
      if (pct > 0 || avantLigne !== apresLigne) {
        remParts.push(
          `Sans remise ligne : ${formatMoney(avantLigne)} — Avec remise : ${formatMoney(apresLigne)}`
        )
      }
      if (pct > 0) remParts.push(`Remise ${pct} %`)
      if (reason) remParts.push(reason)
      const remiseRow =
        remParts.length > 0
          ? `<tr class="line-remise-row"><td colspan="4">${esc(remParts.join(' — '))}</td></tr>`
          : ''
      return `<tr>
      <td>${esc(l.name)}</td>
      <td class="r">${l.qty}</td>
      <td class="r">${formatMoney(l.unitCents)}</td>
      <td class="r">${formatMoney(l.lineTotalCents)}</td>
    </tr>${remiseRow}`
    })
    .join('')

  const refundBanner =
    sale.kind === 'refund'
      ? `<div class="refund-banner">REMBOURSEMENT</div>`
      : ''
  const refundOriginLine =
    sale.kind === 'refund' &&
    sale.refundSourceOrderNumber != null &&
    sale.refundSourceOrderNumber > 0
      ? `<div class="refund-origin-line">Commande d’origine : ${esc(formatOrderNo(sale.refundSourceOrderNumber))}</div>`
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
    <div class="event">${esc(sale.eventName)}</div>
    <div class="dt">${esc(dateStr)} · ${esc(timeStr)}</div>
    <div class="rule"></div>
    <table class="lines">
      <thead><tr><th>Article</th><th class="r">Qté</th><th class="r">P.u.</th><th class="r">Total</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    ${
      (sale.cartDiscountPercent ?? 0) > 0 ||
      (typeof sale.cartDiscountReason === 'string' && sale.cartDiscountReason.trim().length > 0)
        ? (() => {
            const cp = sale.cartDiscountPercent ?? 0
            const cr = typeof sale.cartDiscountReason === 'string' ? sale.cartDiscountReason.trim() : ''
            const subLines = sale.lines.reduce((s, l) => s + l.lineTotalCents, 0)
            const remiseGlobCents = subLines - sale.totalCents
            const pctLabel = cp > 0 ? ` (${cp} %)` : ''
            return `<div class="recap-cart-block">
              <div class="recap-cart-line">Sous-total (lignes) : ${esc(formatMoney(subLines))}</div>
              <div class="recap-cart-line">Montant remise globale${esc(pctLabel)} : ${esc(formatMoney(remiseGlobCents))}</div>
              ${cr ? `<div class="recap-cart-line">Motif : ${esc(cr)}</div>` : ''}
            </div>`
          })()
        : ''
    }
    <div class="rule"></div>
    <div class="total">${esc(totalLabel)} : ${formatMoney(sale.totalCents)}</div>
    ${paymentSummaryHtml(sale)}
    <div class="rule"></div>
    <div class="foot">${esc(footMsg)}</div>
    ${receiptFooterLegalHtml(sale, legal)}
  </section>`

  return documentShell(body)
}

function documentShell(innerBody: string): string {
  const w = `${TICKET_WIDTH_MM}mm`
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page {
    size: ${w} auto;
    margin: 0;
  }
  html {
    width: ${w};
    max-width: ${w};
    margin: 0 auto;
    padding: 0;
    min-height: 100%;
  }
  body {
    margin: 0 auto;
    padding: 2mm 2.5mm;
    width: ${w};
    max-width: ${w};
    min-height: 400px;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 11pt;
    font-weight: 500;
    color: #111;
    line-height: 1.35;
    overflow-x: hidden;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .ticket {
    width: 100%;
    max-width: ${w};
    margin: 0 auto 6mm;
    padding: 4mm 2.5mm;
    border: none;
    page-break-after: always;
    page-break-inside: avoid;
    overflow-wrap: anywhere;
    word-wrap: break-word;
  }
  .receipt-full { page-break-after: auto; }
  .ticket:last-of-type { page-break-after: auto; }
  /* Ticket unitaire : logo en tête ; libellé ; pied = association + date */
  .ticket-unit .product-row {
    margin: 3mm 0 4mm;
  }
  .ticket-unit .qtyline {
    font-size: 12pt;
    font-weight: 600;
    text-align: center;
    margin: 0;
  }
  .ticket-unit .unit-motif {
    font-size: 8.5pt;
    font-weight: 600;
    text-align: center;
    color: #222;
    margin: 0 0 2mm;
    padding: 0 2mm;
    line-height: 1.35;
  }
  .ticket-unit .unit-motif--global {
    font-size: 8pt;
    font-weight: 600;
    color: #1a4d1a;
  }
  .ticket-unit .foot-unit {
    padding-top: 1mm;
  }
  .ticket-unit .foot-asso {
    font-size: 11pt;
    font-weight: 600;
    text-align: center;
    margin-bottom: 2mm;
    color: #111;
  }
  .ticket-unit .foot-dt {
    font-size: 9pt;
    font-weight: 500;
    color: #111;
    text-align: center;
  }
  .ticket-unit .foot-time {
    font-size: 8pt;
    font-weight: 500;
    color: #111;
    text-align: center;
    margin-top: 1mm;
  }
  .validity-notice {
    font-size: 10pt;
    font-weight: 700;
    text-align: center;
    color: #000;
    margin: 3mm 1mm;
    padding: 2mm 2mm;
    line-height: 1.35;
    border: 1px solid #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .orderno {
    font-weight: 600;
    font-size: 11pt;
    text-align: center;
    margin-bottom: 3mm;
    letter-spacing: 0.02em;
  }
  .orderno.big { font-size: 13pt; }
  .logo {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    max-height: 40mm;
    margin: 0 auto 4mm;
    object-fit: contain;
  }
  .doc-type {
    font-size: 9pt;
    font-weight: 700;
    text-align: center;
    margin-bottom: 2mm;
    letter-spacing: 0.04em;
  }
  .legal-block {
    font-size: 7.5pt;
    font-weight: 500;
    text-align: center;
    margin-bottom: 3mm;
    margin-top: 2mm;
    padding: 2mm 1mm;
    line-height: 1.35;
  }
  .legal-block-footer {
    margin-top: 0;
    margin-bottom: 0;
  }
  .legal-emitter {
    font-size: 10pt;
    font-weight: 700;
    margin-bottom: 1.5mm;
  }
  .legal-line, .legal-id {
    font-size: 7.5pt;
    margin: 0.5mm 0;
  }
  .legal-note-line {
    font-size: 7pt;
    font-weight: 500;
    text-align: center;
    margin: 0.8mm 0;
    padding: 0 1mm;
  }
  .asso {
    font-weight: 600;
    font-size: 10pt;
    text-align: center;
    margin-bottom: 2mm;
  }
  .event {
    font-size: 11pt;
    font-weight: 600;
    text-align: center;
    margin-bottom: 2mm;
  }
  .dt {
    font-size: 8pt;
    font-weight: 500;
    color: #111;
    text-align: center;
    margin-bottom: 4mm;
  }
  .emoji {
    font-size: 28pt;
    text-align: center;
    line-height: 1.2;
    margin: 0 0 0.35rem;
  }
  .qtyline {
    font-size: 13pt;
    font-weight: 600;
    text-align: center;
    margin: 0 auto 3mm;
  }
  .price {
    font-size: 11pt;
    font-weight: 600;
    text-align: center;
    margin-bottom: 3mm;
  }
  .rule {
    border-top: 1px solid #000;
    margin: 3mm 0 2mm;
  }
  .refund-banner {
    font-size: 11pt;
    font-weight: 700;
    text-align: center;
    color: #b91c1c;
    margin-bottom: 3mm;
    letter-spacing: 0.08em;
  }
  .refund-origin-line {
    font-size: 9pt;
    font-weight: 500;
    text-align: center;
    margin-bottom: 3mm;
    color: #111;
  }
  .foot {
    font-size: 8pt;
    font-weight: 500;
    color: #111;
    text-align: center;
  }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    font-weight: 500;
  }
  table.lines th,
  table.lines td {
    padding: 2px 1.2mm;
    text-align: left;
    vertical-align: top;
  }
  table.lines th + th,
  table.lines td + td {
    border-left: 0.3mm dotted #333;
  }
  table.lines .r {
    text-align: right;
  }
  table.lines thead {
    border-bottom: 1px solid #000;
  }
  table.lines tr.line-remise-row td {
    font-size: 7.5pt;
    font-weight: 500;
    color: #333;
    padding: 0 0 3px 0;
    line-height: 1.35;
    border-left: none;
  }
  .subtotal-note {
    font-size: 8pt;
    font-weight: 500;
    color: #333;
    text-align: center;
    margin: 2mm 0 0;
    line-height: 1.35;
  }
  .recap-cart-block {
    font-size: 8pt;
    font-weight: 500;
    color: #222;
    text-align: center;
    margin: 2mm 0 0;
    line-height: 1.45;
    padding: 1.5mm 1mm;
    border: 0.3mm solid #333;
  }
  .recap-cart-line + .recap-cart-line {
    margin-top: 1mm;
  }
  .total {
    font-size: 14pt;
    font-weight: 700;
    text-align: center;
    margin: 3mm 0;
  }
  .payline {
    font-size: 9pt;
    font-weight: 500;
    text-align: center;
    margin: 1mm 0;
  }
</style>
</head>
<body>
${innerBody}
</body>
</html>`
}
