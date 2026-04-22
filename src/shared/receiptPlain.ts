import type { SaleRecord } from './sales'
import type { ReceiptLegalInfo } from './catalog'
import { tvaMentionLines } from './catalog'

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

function formatOrderNo(n: number): string {
  return `N° ${String(n).padStart(6, '0')}`
}

function paymentLinesPlain(s: SaleRecord): string[] {
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
  return lines
}

/** Corps de message texte (e-mail type mailto ou pièce jointe lisible sans HTML). */
export function buildSummaryReceiptPlainText(sale: SaleRecord, legal: ReceiptLegalInfo): string {
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

  const head: string[] = ['TICKET DE CAISSE — REÇU DE PAIEMENT', '']
  if (sale.orderNumber != null && sale.orderNumber > 0) {
    head.push(formatOrderNo(sale.orderNumber))
  } else {
    head.push('(Vente archivée / sans numéro de commande)')
  }
  head.push('')
  head.push(`Événement : ${sale.eventName}`)
  head.push(`Date et heure : ${dateStr} · ${timeStr}`)
  head.push('')
  head.push('Détail :')
  for (const l of sale.lines) {
    const list = l.listUnitCents
    const pct = l.discountPercent ?? 0
    const reason = typeof l.discountReason === 'string' ? l.discountReason.trim() : ''
    let extra = ''
    if (pct > 0 && list != null && list !== l.unitCents) {
      extra = ` (barème ${formatMoney(list)} / u., remise ${pct} %${reason ? ` — ${reason}` : ''})`
    } else if (pct > 0) {
      extra = ` (remise ${pct} %${reason ? ` — ${reason}` : ''})`
    } else if (reason) {
      extra = ` (${reason})`
    }
    head.push(
      `  ${l.qty} × ${l.name} — ${formatMoney(l.unitCents)} / u. — ${formatMoney(l.lineTotalCents)}${extra}`
    )
  }
  const cartPct = sale.cartDiscountPercent ?? 0
  if (cartPct > 0) {
    const sub = sale.lines.reduce((s, l) => s + l.lineTotalCents, 0)
    const cr = typeof sale.cartDiscountReason === 'string' ? sale.cartDiscountReason.trim() : ''
    head.push(
      `  Sous-total : ${formatMoney(sub)} — remise sur le total ${cartPct} %${cr ? ` — ${cr}` : ''}`
    )
  }
  head.push('')
  const totalLabel = sale.kind === 'refund' ? 'Total remboursé' : 'Total'
  head.push(`${totalLabel} : ${formatMoney(sale.totalCents)}`)
  for (const pl of paymentLinesPlain(sale)) head.push(pl)
  if (sale.kind === 'refund' && sale.refundSourceOrderNumber != null && sale.refundSourceOrderNumber > 0) {
    head.push(`Commande d’origine : ${formatOrderNo(sale.refundSourceOrderNumber)}`)
  }
  head.push('')
  head.push(sale.kind === 'refund' ? 'Remboursement enregistré.' : 'Merci de votre visite.')
  head.push('')
  head.push(sale.associationName.trim() || 'Association')
  if (legal.legalAddress) {
    for (const line of legal.legalAddress.split(/\r?\n/).map((l) => l.trim())) {
      if (line) head.push(line)
    }
  }
  if (legal.siret.trim()) head.push(`N° SIRET : ${legal.siret.trim()}`)
  if (legal.numero.trim()) head.push(`N° association : ${legal.numero.trim()}`)
  for (const line of tvaMentionLines(legal.receiptLegalNote)) head.push(line)
  return head.join('\n')
}
