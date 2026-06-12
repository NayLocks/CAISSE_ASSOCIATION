import { describe, expect, it } from 'vitest'
import { canAddProductToCart, cartIsCardCashExchangeSale } from './cardCashExchange'
import type { ProductConfig } from './catalog'

const exchange: ProductConfig = {
  id: 'ex',
  name: 'Échange',
  priceCents: 0,
  category: 'boissons',
  emoji: '💳',
  imageFile: null,
  trackStock: false,
  lowStockThreshold: null,
  cardCashExchange: true
}

const cafe: ProductConfig = {
  id: 'cafe',
  name: 'Café',
  priceCents: 150,
  category: 'boissons',
  emoji: '☕',
  imageFile: null,
  trackStock: false,
  lowStockThreshold: null
}

describe('cardCashExchange', () => {
  it('refuse un second article si échange déjà dans le panier', () => {
    const r = canAddProductToCart([exchange, cafe], { ex: 1 }, cafe)
    expect(r.ok).toBe(false)
  })

  it('détecte une vente échange seule (quantité libre)', () => {
    expect(cartIsCardCashExchangeSale([{ product: exchange, qty: 1 }])).toBe(true)
    expect(cartIsCardCashExchangeSale([{ product: exchange, qty: 3 }])).toBe(true)
    expect(cartIsCardCashExchangeSale([{ product: exchange, qty: 1 }, { product: cafe, qty: 1 }])).toBe(
      false
    )
  })

  it('autorise plusieurs unités du même échange', () => {
    const r = canAddProductToCart([exchange], { ex: 2 }, exchange)
    expect(r.ok).toBe(true)
  })
})
