import type { SaleRecord } from '@shared/sales'
import { formatOrderDisplay } from '@renderer/utils/order'

export type HistoryAdvancedFilters = {
  orderQuery: string
  amountMinEuros: string
  amountMaxEuros: string
  paymentMode: 'all' | 'cash' | 'card' | 'mixed'
  productQuery: string
}

export function parseEurosFilter(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export function applyHistoryAdvancedFilters(
  rows: SaleRecord[],
  f: HistoryAdvancedFilters
): SaleRecord[] {
  let out = rows
  const oq = f.orderQuery.trim()
  if (oq) {
    const digits = oq.replace(/\D/g, '')
    out = out.filter((s) => {
      if (s.orderNumber != null && s.orderNumber > 0) {
        if (formatOrderDisplay(s.orderNumber).toLowerCase().includes(oq.toLowerCase())) return true
        if (digits && String(s.orderNumber).includes(digits)) return true
      }
      return s.id.toLowerCase().includes(oq.toLowerCase())
    })
  }
  const minC = parseEurosFilter(f.amountMinEuros)
  const maxC = parseEurosFilter(f.amountMaxEuros)
  if (minC != null) {
    out = out.filter((s) => s.totalCents >= minC)
  }
  if (maxC != null) {
    out = out.filter((s) => s.totalCents <= maxC)
  }
  if (f.paymentMode !== 'all') {
    out = out.filter((s) => s.payment.mode === f.paymentMode)
  }
  const pq = f.productQuery.trim().toLowerCase()
  if (pq) {
    out = out.filter((s) =>
      s.lines.some((l) => l.name.toLowerCase().includes(pq) || l.productId.toLowerCase().includes(pq))
    )
  }
  return out
}
