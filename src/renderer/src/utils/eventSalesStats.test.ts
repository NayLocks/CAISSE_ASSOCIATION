import { describe, expect, it } from 'vitest'
import { netCashEspècesDelta } from './eventSalesStats'

describe('netCashEspècesDelta', () => {
  it('retire les espèces du tiroir sur échange carte / espèces', () => {
    const delta = netCashEspècesDelta(
      { mode: 'card', cashCents: 0, cardCents: 52_300, changeCents: 0 },
      { kind: 'sale', cardCashExchange: true }
    )
    expect(delta).toBe(-52_300)
  })
})
