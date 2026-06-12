import type { ProductConfig } from './catalog'

/** Article « échange carte / espèces » : seul type d’article dans le panier (quantité libre), paiement carte obligatoire. */
export function isCardCashExchangeProduct(p: ProductConfig | undefined | null): boolean {
  return p?.cardCashExchange === true
}

export function cartCardCashExchangeProduct(
  products: ProductConfig[],
  quantities: Record<string, number>
): ProductConfig | null {
  for (const id of Object.keys(quantities)) {
    if ((quantities[id] ?? 0) <= 0) continue
    const p = products.find((x) => x.id === id)
    if (isCardCashExchangeProduct(p)) return p ?? null
  }
  return null
}

export function canAddProductToCart(
  products: ProductConfig[],
  quantities: Record<string, number>,
  candidate: ProductConfig
): { ok: true } | { ok: false; message: string } {
  const exchangeInCart = cartCardCashExchangeProduct(products, quantities)
  if (isCardCashExchangeProduct(candidate)) {
    const other = Object.keys(quantities).some(
      (id) => id !== candidate.id && (quantities[id] ?? 0) > 0
    )
    if (other) {
      return {
        ok: false,
        message:
          'Cet article d’échange carte / espèces doit être seul dans le panier. Videz le panier d’abord.'
      }
    }
  } else if (exchangeInCart) {
    return {
      ok: false,
      message: `Le panier contient « ${exchangeInCart.name} » (échange carte / espèces). Retirez-le avant d’ajouter d’autres articles.`
    }
  }
  return { ok: true }
}

export function cartIsCardCashExchangeSale(
  lines: { product: ProductConfig; qty: number }[]
): boolean {
  if (lines.length !== 1) return false
  const line = lines[0]!
  return line.qty > 0 && isCardCashExchangeProduct(line.product)
}
