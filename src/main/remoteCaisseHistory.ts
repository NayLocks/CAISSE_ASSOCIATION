import type { SaleRecord } from '../shared/sales.js'
import { listSales } from './salesHistory.js'

function fmtEur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/** Même logique que l’onglet Historique (renderer). */
export function paymentShortLabel(s: SaleRecord): string {
  const p = s.payment
  const pref = s.kind === 'refund' ? 'Remb. ' : ''
  if (p.mode === 'card') return `${pref}Carte`
  if (p.mode === 'cash') {
    return p.changeCents > 0
      ? `${pref}Esp. · ${s.kind === 'refund' ? 'repris' : 'rendu'} ${fmtEur(p.changeCents)}`
      : `${pref}Espèces`
  }
  return `${pref}Mixte · carte ${fmtEur(p.cardCents)}`
}

export function paymentDetailLines(s: SaleRecord): string {
  const p = s.payment
  const parts: string[] = []
  const isRef = s.kind === 'refund'
  parts.push(
    p.mode === 'card'
      ? isRef
        ? 'Remboursement carte'
        : 'Carte'
      : p.mode === 'cash'
        ? isRef
          ? 'Remboursement espèces'
          : 'Espèces'
        : isRef
          ? 'Remboursement espèces + carte'
          : 'Espèces + carte'
  )
  if (p.cashCents > 0) parts.push(`Espèces : ${fmtEur(p.cashCents)}`)
  if (p.cardCents > 0) parts.push(`Carte : ${fmtEur(p.cardCents)}`)
  if (p.changeCents > 0) parts.push(`${isRef ? 'Reprise' : 'Rendu'} : ${fmtEur(p.changeCents)}`)
  return parts.join(' · ')
}

function linesPreview(s: SaleRecord, maxLen: number): string {
  const parts = s.lines.map((l) => `${l.qty}× ${l.name}`)
  let out = parts.join(' · ')
  if (out.length > maxLen) out = `${out.slice(0, Math.max(0, maxLen - 1))}…`
  return out
}

export type RemoteSaleListItem = {
  id: string
  at: string
  orderNumber: number
  totalCents: number
  eventName: string
  kind: 'sale' | 'refund'
  paymentShort: string
  linesPreview: string
}

export function buildRemoteSalesList(eventId: string | null, limit: number): RemoteSaleListItem[] {
  const cap = Math.min(200, Math.max(1, limit))
  return listSales()
    .filter((s) => !eventId || s.eventId === eventId)
    .slice(0, cap)
    .map((s) => ({
      id: s.id,
      at: s.at,
      orderNumber: s.orderNumber ?? 0,
      totalCents: s.totalCents,
      eventName: s.eventName,
      kind: s.kind === 'refund' ? 'refund' : 'sale',
      paymentShort: paymentShortLabel(s),
      linesPreview: linesPreview(s, 160)
    }))
}

export function findSaleRecordById(id: string, eventId: string | null): SaleRecord | undefined {
  const sale = listSales().find((s) => s.id === id)
  if (!sale) return undefined
  if (eventId && sale.eventId !== eventId) return undefined
  return sale
}
