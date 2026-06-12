import type { SaleRecord } from '../../shared/sales'
import type { ReceiptLegalInfo } from '../../shared/catalog'
import { splitDiscountMotifReason, tvaMentionLines } from '../../shared/catalog.js'
import { escHtml, formatMoneyEur, formatOrderNo } from './formatting.js'

export function unitTicketMotifHtml(reason: string): string {
  const { label, comment } = splitDiscountMotifReason(reason)
  if (!label && !comment) return ''
  if (comment) {
    return `<div class="unit-motif"><div class="unit-motif__label">${escHtml(label)}</div><div class="unit-motif__comment">${escHtml(comment)}</div></div>`
  }
  return `<div class="unit-motif">${escHtml(label)}</div>`
}

export function unitTicketFootDatelineHtml(dateLong: string, timeShort: string): string {
  return `<div class="foot-dateline" aria-label="Date et heure">
    <div class="foot-dateline__date">${escHtml(dateLong)}</div>
    <div class="foot-dateline__time">${escHtml(timeShort)}</div>
  </div>`
}

export function orderLineHtml(orderNumber: number): string {
  if (orderNumber === 0) {
    return `<div class="orderno">Essai d’impression</div>`
  }
  if (orderNumber < 0) {
    return `<div class="orderno">Commande (vente archivée)</div>`
  }
  return `<div class="orderno">${escHtml(formatOrderNo(orderNumber))}</div>`
}

function centsSafe(n: unknown): number {
  const x = Number(n)
  return Number.isFinite(x) ? Math.round(x) : 0
}

export function paymentSummaryHtml(s: SaleRecord): string {
  const p = s.payment
  if (!p || typeof p !== 'object') {
    return `<div class="payline">${escHtml('Paiement enregistré')}</div>`
  }
  const cash = centsSafe(p.cashCents)
  const card = centsSafe(p.cardCents)
  const change = centsSafe(p.changeCents)
  const mode = p.mode === 'cash' || p.mode === 'card' || p.mode === 'mixed' ? p.mode : 'cash'
  const lines: string[] = []
  if (s.kind === 'refund') {
    if (mode === 'card') lines.push('Remboursement : carte bancaire')
    else if (mode === 'cash') {
      lines.push(`Espèces remises : ${formatMoneyEur(cash)}`)
      if (change > 0) lines.push(`Reprise monnaie : ${formatMoneyEur(change)}`)
    } else {
      lines.push(`Espèces remises : ${formatMoneyEur(cash)}`)
      lines.push(`Carte : ${formatMoneyEur(card)}`)
    }
  } else {
    if (mode === 'card') lines.push('Paiement : carte bancaire')
    else if (mode === 'cash') {
      lines.push(`Espèces : ${formatMoneyEur(cash)}`)
      if (change > 0) lines.push(`Rendu : ${formatMoneyEur(change)}`)
    } else {
      lines.push(`Espèces : ${formatMoneyEur(cash)}`)
      lines.push(`Carte : ${formatMoneyEur(card)}`)
    }
  }
  return lines.map((l) => `<div class="payline">${escHtml(l)}</div>`).join('')
}

export function receiptFooterLegalHtml(sale: SaleRecord, legal: ReceiptLegalInfo): string {
  const addrInner = legal.legalAddress
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => `<div class="legal-line">${escHtml(line)}</div>`)
    .join('')
  const siretLine = legal.siret.trim()
    ? `<div class="legal-id">N° SIRET : ${escHtml(legal.siret.trim())}</div>`
    : ''
  const numeroLine = legal.numero.trim()
    ? `<div class="legal-id">N° association : ${escHtml(legal.numero.trim())}</div>`
    : ''
  const noteLines = tvaMentionLines(legal.receiptLegalNote)
    .map((line) => `<div class="legal-note-line">${escHtml(line)}</div>`)
    .join('')

  const assoc =
    typeof sale.associationName === 'string' ? sale.associationName.trim() : 'Association'
  return `<div class="legal-block legal-block-footer">
      <div class="asso legal-emitter">${escHtml(assoc || 'Association')}</div>
      ${addrInner}
      ${siretLine}
      ${numeroLine}
      ${noteLines}
    </div>`
}
