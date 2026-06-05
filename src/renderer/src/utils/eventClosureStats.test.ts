import { describe, expect, it } from 'vitest'
import { buildEventClosureStats } from './eventClosureStats'
import type { SaleRecord } from '@shared/sales'

describe('buildEventClosureStats', () => {
  it('agrège CA, espèces et top articles', () => {
    const sales: SaleRecord[] = [
      {
        id: '1',
        at: '2026-05-15T10:00:00.000Z',
        eventId: 'ev1',
        eventName: 'Fête',
        associationName: 'Test',
        kind: 'sale',
        orderNumber: 1,
        totalCents: 500,
        lines: [
          {
            productId: 'a',
            name: 'Café',
            emoji: '☕',
            qty: 2,
            unitCents: 250,
            lineTotalCents: 500
          }
        ],
        payment: { mode: 'cash', cashCents: 500, cardCents: 0, changeCents: 0 }
      }
    ]
    const stats = buildEventClosureStats(sales, 'ev1', [], 1000)
    expect(stats.saleCount).toBe(1)
    expect(stats.revenueCents).toBe(500)
    expect(stats.floatCents).toBe(1000)
    expect(stats.theoreticalCashCents).toBe(1500)
    expect(stats.topProducts[0]?.qtyNet).toBe(2)
  })
})
