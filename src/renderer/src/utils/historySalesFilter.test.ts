import { describe, expect, it } from 'vitest'
import { applyHistoryAdvancedFilters } from './historySalesFilter'
import type { SaleRecord } from '@shared/sales'

const baseSale: SaleRecord = {
  id: 's1',
  at: '2026-05-15T12:00:00.000Z',
  eventId: 'ev',
  eventName: 'E',
  associationName: 'A',
  kind: 'sale',
  orderNumber: 42,
  totalCents: 1000,
  lines: [{ productId: 'cafe', name: 'Café', emoji: '☕', qty: 1, unitCents: 1000, lineTotalCents: 1000 }],
  payment: { mode: 'cash', cashCents: 1000, cardCents: 0, changeCents: 0 }
}

describe('applyHistoryAdvancedFilters', () => {
  it('filtre par mode paiement', () => {
    const card: SaleRecord = {
      ...baseSale,
      id: 's2',
      payment: { mode: 'card', cashCents: 0, cardCents: 500, changeCents: 0 }
    }
    const rows = applyHistoryAdvancedFilters([baseSale, card], {
      orderQuery: '',
      amountMinEuros: '',
      amountMaxEuros: '',
      paymentMode: 'cash',
      productQuery: ''
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('s1')
  })

  it('filtre par nom article', () => {
    const rows = applyHistoryAdvancedFilters([baseSale], {
      orderQuery: '',
      amountMinEuros: '',
      amountMaxEuros: '',
      paymentMode: 'all',
      productQuery: 'café'
    })
    expect(rows).toHaveLength(1)
  })
})
