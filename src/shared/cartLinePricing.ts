/** Prix unitaire de base (prix catalogue ou override manuel). */
export function lineBaseUnitCents(
  catalogCents: number,
  priceOverrides: Record<string, number> | undefined,
  id: string
): number {
  const o = priceOverrides?.[id]
  if (typeof o === 'number' && Number.isFinite(o) && o >= 0) return Math.round(o)
  return catalogCents
}

export function lineDiscountPct(
  lineDiscountPct: Record<string, number> | undefined,
  id: string
): number {
  const v = lineDiscountPct?.[id]
  if (v == null || !Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v)))
}

export function lineDiscountReason(
  lineDiscountReason: Record<string, string> | undefined,
  id: string
): string {
  const s = lineDiscountReason?.[id]
  return typeof s === 'string' ? s.trim() : ''
}

/** Prix unitaire net après remise % sur le prix de base. */
export function finalUnitCents(baseCents: number, discountPct: number): number {
  const p = Math.min(100, Math.max(0, discountPct))
  return Math.max(0, Math.round(baseCents * (1 - p / 100)))
}
