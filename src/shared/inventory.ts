import type { AppPersistedData, ProductConfig } from './catalog'

/** Article en alerte stock bas (seuil défini et stock ≤ seuil). */
export function isLowStock(product: ProductConfig, qty: number): boolean {
  if (!product.trackStock) return false
  const th = product.lowStockThreshold
  if (th === null || th === undefined || !Number.isFinite(th)) return false
  return qty <= Math.max(0, Math.floor(th))
}

export function listLowStockProducts(
  products: ProductConfig[],
  stockMap: Record<string, number>
): ProductConfig[] {
  return products.filter((p) => {
    if (!p.trackStock) return false
    const qty = stockMap[p.id] ?? 0
    return isLowStock(p, qty)
  })
}

/** Stock disponible pour un événement (articles suivis). */
export function getStockMap(data: AppPersistedData, eventId: string | null): Record<string, number> {
  if (!eventId) return {}
  return { ...(data.stockByEvent[eventId] ?? {}) }
}

export function removeProductFromAllStock(
  stockByEvent: Record<string, Record<string, number>>,
  productId: string
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [eid, m] of Object.entries(stockByEvent)) {
    const mm = { ...m }
    delete mm[productId]
    out[eid] = mm
  }
  return out
}

/** Initialise la quantité à 0 pour un article sur tous les événements (activation suivi stock). */
export function initProductStockAcrossEvents(
  stockByEvent: Record<string, Record<string, number>>,
  eventIds: string[],
  productId: string
): Record<string, Record<string, number>> {
  const out = { ...stockByEvent }
  for (const eid of eventIds) {
    const m = { ...(out[eid] ?? {}) }
    if (m[productId] === undefined) m[productId] = 0
    out[eid] = m
  }
  return out
}
