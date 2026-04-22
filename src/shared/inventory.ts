import type { AppPersistedData } from './catalog'

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
