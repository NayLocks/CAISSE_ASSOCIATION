import { describe, expect, it } from 'vitest'
import {
  netCashEspècesDelta,
  theoreticalCashInDrawerCents,
  totalCashSalesHorsFondCents
} from '@shared/eventSalesStats'
import type { SaleRecord } from '@shared/sales'

describe('netCashEspècesDelta', () => {
  it('retire les espèces du tiroir sur échange carte / espèces', () => {
    const delta = netCashEspècesDelta(
      { mode: 'card', cashCents: 0, cardCents: 52_300, changeCents: 0 },
      { kind: 'sale', cardCashExchange: true }
    )
    expect(delta).toBe(-52_300)
  })
})

describe('totalCashSalesHorsFondCents', () => {
  const eventId = 'ev1'

  it('ignore les échanges dans les ventes espèces hors fond', () => {
    const sales: SaleRecord[] = [
      {
        id: '1',
        at: '',
        orderNumber: 1,
        eventId,
        eventName: 'E',
        associationName: 'A',
        lines: [],
        totalCents: 10_000,
        payment: { mode: 'cash', cashCents: 10_000, cardCents: 0, changeCents: 0 }
      },
      {
        id: '2',
        at: '',
        orderNumber: 2,
        eventId,
        eventName: 'E',
        associationName: 'A',
        lines: [],
        totalCents: 50_000,
        cardCashExchange: true,
        payment: { mode: 'card', cashCents: 0, cardCents: 50_000, changeCents: 0 }
      }
    ]
    expect(totalCashSalesHorsFondCents(sales, eventId)).toBe(10_000)
    expect(theoreticalCashInDrawerCents(100_000, sales)).toBe(100_000 + 10_000 - 50_000)
    expect(
      100_000 + totalCashSalesHorsFondCents(sales, eventId) - 50_000
    ).toBe(theoreticalCashInDrawerCents(100_000, sales))
  })
})
