import { listSales } from './salesHistory.js'
import { loadPersistedData } from './stateStore.js'
import { replaceMirrorFromHttp } from './remoteCaisseState.js'

export function loadSaleForRefund(saleId: string): { ok: true } | { ok: false; error: string } {
  const sale = listSales().find((s) => s.id === saleId)
  if (!sale || sale.kind === 'refund') {
    return { ok: false, error: 'Vente introuvable ou déjà un remboursement.' }
  }
  const data = loadPersistedData()
  const quantities: Record<string, number> = {}
  const overrides: Record<string, number> = {}
  const discPct: Record<string, number> = {}
  const discReason: Record<string, string> = {}
  const caps: Record<string, number> = {}
  for (const line of sale.lines) {
    const p = data.products.find((x) => x.id === line.productId)
    if (!p) continue
    quantities[line.productId] = line.qty
    const list = line.listUnitCents ?? line.unitCents
    overrides[line.productId] = list
    const pct = line.discountPercent ?? 0
    if (pct > 0) discPct[line.productId] = pct
    const reason = typeof line.discountReason === 'string' ? line.discountReason.trim() : ''
    if (reason) discReason[line.productId] = reason
    caps[line.productId] = line.qty
  }
  if (Object.keys(quantities).length === 0) {
    return { ok: false, error: 'Aucune ligne ne correspond au catalogue actuel.' }
  }
  const cartPct = sale.cartDiscountPercent ?? 0
  const cartReasonRaw = typeof sale.cartDiscountReason === 'string' ? sale.cartDiscountReason.trim() : ''
  replaceMirrorFromHttp({
    quantities,
    refundMode: true,
    refundMaxByProduct: caps,
    refundSourceMeta: { saleId: sale.id, orderNumber: sale.orderNumber },
    priceOverrides: overrides,
    lineDiscountPct: discPct,
    lineDiscountReason: discReason,
    cartDiscountPct: cartPct > 0 ? Math.min(100, Math.round(cartPct)) : 0,
    cartDiscountReason: cartReasonRaw.slice(0, 200)
  })
  return { ok: true }
}
