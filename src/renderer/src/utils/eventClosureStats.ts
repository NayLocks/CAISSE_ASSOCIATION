import type { ProductConfig } from '@shared/catalog'
import type { SaleRecord } from '@shared/sales'
import {
  aggregateProductsForEvent,
  netCashEspècesDelta,
  theoreticalCashInDrawerCents,
  totalCardCashExchangeCardCents,
  totalCardCashExchangeCashOutCents,
  totalCardCentsForEvent,
  totalRevenueCentsForEvent
} from '@shared/eventSalesStats'

export type EventClosureStats = {
  saleCount: number
  refundCount: number
  revenueCents: number
  cashDeltaCents: number
  cardCents: number
  floatCents: number
  theoreticalCashCents: number
  cardCashExchangeCardCents: number
  cardCashExchangeCashOutCents: number
  topProducts: ReturnType<typeof aggregateProductsForEvent>
}

export function buildEventClosureStats(
  sales: SaleRecord[],
  eventId: string,
  products: ProductConfig[],
  floatCents: number
): EventClosureStats {
  const eventSales = sales.filter((s) => s.eventId === eventId)
  const saleCount = eventSales.filter((s) => s.kind !== 'refund').length
  const refundCount = eventSales.filter((s) => s.kind === 'refund').length
  let cashDeltaCents = 0
  for (const s of eventSales) {
    cashDeltaCents += netCashEspècesDelta(s.payment, {
      kind: s.kind === 'refund' ? 'refund' : 'sale',
      cardCashExchange: s.cardCashExchange === true
    })
  }
  return {
    saleCount,
    refundCount,
    revenueCents: totalRevenueCentsForEvent(sales, eventId),
    cashDeltaCents,
    cardCents: totalCardCentsForEvent(sales, eventId),
    floatCents,
    theoreticalCashCents: theoreticalCashInDrawerCents(floatCents, eventSales),
    cardCashExchangeCardCents: totalCardCashExchangeCardCents(sales, eventId),
    cardCashExchangeCashOutCents: totalCardCashExchangeCashOutCents(sales, eventId),
    topProducts: aggregateProductsForEvent(sales, eventId, products)
      .filter((p) => p.qtyNet > 0)
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 15)
  }
}
