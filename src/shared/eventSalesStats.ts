import type { ProductConfig } from '@shared/catalog'
import type { SalePayment, SaleRecord } from '@shared/sales'

export type NetCashDeltaOptions = {
  kind?: 'sale' | 'refund'
  cardCashExchange?: boolean
}

/** Variation d’espèces en caisse pour une opération (hors carte classique). */
export function netCashEspècesDelta(payment: SalePayment, options?: NetCashDeltaOptions): number {
  const kind = options?.kind ?? 'sale'
  const sign = kind === 'refund' ? -1 : 1
  if (options?.cardCashExchange) {
    return -sign * payment.cardCents
  }
  if (payment.mode === 'card') return 0
  return sign * (payment.cashCents - payment.changeCents)
}

/** Mouvements espèces des ventes / remboursements classiques (hors échanges carte / espèces). */
export function totalCashSalesHorsFondCents(sales: SaleRecord[], eventId: string): number {
  let t = 0
  for (const s of sales) {
    if (s.eventId !== eventId) continue
    if (s.cardCashExchange) continue
    t += netCashEspècesDelta(s.payment, {
      kind: s.kind === 'refund' ? 'refund' : 'sale'
    })
  }
  return t
}

/** Espèces théoriques = fond + cumul des deltas espèces sur l’événement. */
export function theoreticalCashInDrawerCents(
  floatCents: number,
  salesForEvent: SaleRecord[]
): number {
  let t = floatCents
  for (const s of salesForEvent) {
    t += netCashEspècesDelta(s.payment, {
      kind: s.kind === 'refund' ? 'refund' : 'sale',
      cardCashExchange: s.cardCashExchange === true
    })
  }
  return t
}

export function totalCardCentsForEvent(sales: SaleRecord[], eventId: string): number {
  let t = 0
  for (const s of sales) {
    if (s.eventId !== eventId) continue
    if (s.cardCashExchange) continue
    const sign = s.kind === 'refund' ? -1 : 1
    t += sign * s.payment.cardCents
  }
  return t
}

/** Crédit carte des échanges carte / espèces (hors encaissements carte classiques). */
export function totalCardCashExchangeCardCents(sales: SaleRecord[], eventId: string): number {
  let t = 0
  for (const s of sales) {
    if (s.eventId !== eventId || !s.cardCashExchange) continue
    const sign = s.kind === 'refund' ? -1 : 1
    t += sign * s.payment.cardCents
  }
  return t
}

/** Sortie d’espèces liée aux échanges carte / espèces (retrait du tiroir). */
export function totalCardCashExchangeCashOutCents(sales: SaleRecord[], eventId: string): number {
  let t = 0
  for (const s of sales) {
    if (s.eventId !== eventId || !s.cardCashExchange) continue
    const sign = s.kind === 'refund' ? -1 : 1
    t += sign * s.payment.cardCents
  }
  return t
}

/** Chiffre d’affaires total sur l’événement (hors échanges carte / espèces). */
export function totalRevenueCentsForEvent(sales: SaleRecord[], eventId: string): number {
  let t = 0
  for (const s of sales) {
    if (s.eventId !== eventId) continue
    if (s.cardCashExchange) continue
    const sign = s.kind === 'refund' ? -1 : 1
    t += sign * s.totalCents
  }
  return t
}

export interface ProductEventAgg {
  productId: string
  name: string
  emoji: string
  qtyNet: number
  revenueCents: number
  minSoldUnitCents: number
  maxSoldUnitCents: number
  currentPriceCents: number | null
}

export function aggregateProductsForEvent(
  sales: SaleRecord[],
  eventId: string,
  products: ProductConfig[]
): ProductEventAgg[] {
  const map = new Map<
    string,
    {
      name: string
      emoji: string
      qtyNet: number
      revenueCents: number
      minSoldUnitCents: number
      maxSoldUnitCents: number
    }
  >()

  for (const s of sales) {
    if (s.eventId !== eventId) continue
    if (s.cardCashExchange) continue
    const sign = s.kind === 'refund' ? -1 : 1
    for (const line of s.lines) {
      const prev = map.get(line.productId)
      const qtyNet = (prev?.qtyNet ?? 0) + sign * line.qty
      const revenueCents = (prev?.revenueCents ?? 0) + sign * line.lineTotalCents
      const minSold = Math.min(prev?.minSoldUnitCents ?? line.unitCents, line.unitCents)
      const maxSold = Math.max(prev?.maxSoldUnitCents ?? line.unitCents, line.unitCents)
      map.set(line.productId, {
        name: line.name,
        emoji: line.emoji,
        qtyNet,
        revenueCents,
        minSoldUnitCents: prev ? minSold : line.unitCents,
        maxSoldUnitCents: prev ? maxSold : line.unitCents
      })
    }
  }

  const rows: ProductEventAgg[] = []
  for (const [productId, v] of map) {
    if (v.qtyNet === 0 && v.revenueCents === 0) continue
    const p = products.find((x) => x.id === productId)
    rows.push({
      productId,
      name: p?.name ?? v.name,
      emoji: p?.emoji ?? v.emoji,
      qtyNet: v.qtyNet,
      revenueCents: v.revenueCents,
      minSoldUnitCents: v.minSoldUnitCents,
      maxSoldUnitCents: v.maxSoldUnitCents,
      currentPriceCents: p?.priceCents ?? null
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  return rows
}
