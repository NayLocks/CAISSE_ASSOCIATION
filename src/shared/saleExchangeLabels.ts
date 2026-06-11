import type { SaleRecord } from './sales'

export function isSaleCardCashExchange(s: SaleRecord): boolean {
  return s.cardCashExchange === true
}

/** Libellé type d’opération (liste, export). */
export function saleOperationTypeLabel(s: SaleRecord): string {
  if (isSaleCardCashExchange(s)) {
    return s.kind === 'refund' ? 'Annulation échange carte / espèces' : 'Échange carte / espèces'
  }
  return s.kind === 'refund' ? 'Remboursement' : 'Vente'
}

function formatEurosSigned(cents: number): string {
  const sign = cents < 0 ? '−' : '+'
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`
}

/**
 * Mention comptable : crédit carte et débit espèces de même montant (compensation hors CA).
 */
export function saleCardCashExchangeComptaLabel(s: SaleRecord): string {
  const sign = s.kind === 'refund' ? -1 : 1
  const amt = s.payment.cardCents
  const creditCard = sign * amt
  const debitCash = -sign * amt
  return `Crédit carte ${formatEurosSigned(creditCard)} · Débit espèces ${formatEurosSigned(debitCash)} (hors CA, compensation stats)`
}

/** Paiement affiché / exporté : inclut la mention échange si applicable. */
export function salePaymentLabel(s: SaleRecord, basePaymentLabel: string): string {
  if (!isSaleCardCashExchange(s)) return basePaymentLabel
  return `${basePaymentLabel} — ${saleCardCashExchangeComptaLabel(s)}`
}
