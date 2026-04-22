import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SaleRecord } from '@shared/sales'

type ShellNavValue = {
  /** Vente à préremplir en caisse (remboursement) — consommé au premier rendu traité */
  pendingRefundSale: SaleRecord | null
  acknowledgePendingRefund: () => void
  /** Ouvre la caisse en mode remboursement prérempli depuis une vente */
  openRefundFromSale: (sale: SaleRecord) => void
}

const ShellNavContext = createContext<ShellNavValue | null>(null)

export function ShellNavProvider({
  children,
  goToCaisse
}: {
  children: ReactNode
  goToCaisse: () => void
}): JSX.Element {
  const [pendingRefundSale, setPendingRefundSale] = useState<SaleRecord | null>(null)

  const acknowledgePendingRefund = useCallback(() => {
    setPendingRefundSale(null)
  }, [])

  const openRefundFromSale = useCallback(
    (sale: SaleRecord) => {
      setPendingRefundSale(sale)
      goToCaisse()
    },
    [goToCaisse]
  )

  const value = useMemo(
    (): ShellNavValue => ({
      pendingRefundSale,
      acknowledgePendingRefund,
      openRefundFromSale
    }),
    [pendingRefundSale, acknowledgePendingRefund, openRefundFromSale]
  )

  return <ShellNavContext.Provider value={value}>{children}</ShellNavContext.Provider>
}

export function useShellNav(): ShellNavValue {
  const ctx = useContext(ShellNavContext)
  if (!ctx) throw new Error('useShellNav hors ShellNavProvider')
  return ctx
}
