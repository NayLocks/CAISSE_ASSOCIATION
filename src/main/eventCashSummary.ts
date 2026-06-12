import type { ProductConfig } from '../shared/catalog.js'
import {
  aggregateProductsForEvent,
  theoreticalCashInDrawerCents,
  totalCardCashExchangeCardCents,
  totalCardCashExchangeCashOutCents,
  totalCardCentsForEvent,
  totalCashSalesHorsFondCents,
  totalRevenueCentsForEvent,
  type ProductEventAgg
} from '../shared/eventSalesStats.js'
import { listSales } from './salesHistory.js'

export type EventCashSummaryPayload = {
  eventName: string | null
  floatCents: number | null
  sessionStarted: boolean
  cashDrawerCents: number | null
  ventesEspècesHorsFondCents: number | null
  cardTotalCents: number
  exchangeCardCents: number
  exchangeCashOutCents: number
  totalEspècesEstiméesCents: number | null
  ventesTotalCents: number
  productRows: ProductEventAgg[]
}

export function buildEventCashSummaryPayload(
  eventId: string | null,
  floatCents: number | null,
  sessionStarted: boolean,
  eventName: string | null,
  products: ProductConfig[]
): EventCashSummaryPayload {
  const empty: EventCashSummaryPayload = {
    eventName,
    floatCents,
    sessionStarted,
    cashDrawerCents: null,
    ventesEspècesHorsFondCents: null,
    cardTotalCents: 0,
    exchangeCardCents: 0,
    exchangeCashOutCents: 0,
    totalEspècesEstiméesCents: null,
    ventesTotalCents: 0,
    productRows: []
  }

  if (!eventId || floatCents == null || !sessionStarted) return empty

  const sales = listSales()
  const eventSales = sales.filter((s) => s.eventId === eventId)
  const ventesEspècesHorsFond = totalCashSalesHorsFondCents(sales, eventId)
  const exchangeCashOut = totalCardCashExchangeCashOutCents(sales, eventId)

  return {
    eventName,
    floatCents,
    sessionStarted: true,
    cashDrawerCents: theoreticalCashInDrawerCents(floatCents, eventSales),
    ventesEspècesHorsFondCents: ventesEspècesHorsFond,
    cardTotalCents: totalCardCentsForEvent(sales, eventId),
    exchangeCardCents: totalCardCashExchangeCardCents(sales, eventId),
    exchangeCashOutCents: exchangeCashOut,
    totalEspècesEstiméesCents: floatCents + ventesEspècesHorsFond - exchangeCashOut,
    ventesTotalCents: totalRevenueCentsForEvent(sales, eventId),
    productRows: aggregateProductsForEvent(sales, eventId, products)
  }
}
