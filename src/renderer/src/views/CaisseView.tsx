import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ProductConfig, sumUpPaymentsReady } from '@shared/catalog'
import type { RemoteCaisseMirror } from '@shared/remoteCaisseMirror'
import type {
  ClientDisplayState,
  ClientDisplayPhase,
  ClientPaymentDetail
} from '@shared/clientDisplay'
import type { SaleLineSnapshot, SalePayment, SaleRecord } from '@shared/sales'
import type { TicketUnitPayload } from '@shared/ticket'
import { getStockMap } from '@shared/inventory'
import {
  finalUnitCents,
  lineBaseUnitCents,
  lineDiscountPct as readLineDiscountPct,
  lineDiscountReason as readLineDiscountReason
} from '@shared/cartLinePricing'
import { buildClientLineDetailLines } from '@shared/clientDisplayLineDetail'
import { useAppState } from '@renderer/state/AppStateContext'
import { useShellNav } from '@renderer/state/ShellNavContext'
import { formatMoney, parseEurosToCents } from '@renderer/utils/money'
import { formatOrderDisplay } from '@renderer/utils/order'
import PaymentModal from '@renderer/components/PaymentModal'

function useClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function stockAvailable(p: ProductConfig, stock: Record<string, number>): number {
  if (!p.trackStock) return Number.POSITIVE_INFINITY
  return stock[p.id] ?? 0
}

type CartLineRow = {
  product: ProductConfig
  qty: number
  unitCents: number
  listUnitCents: number
  discountPercent: number
  discountReason: string
}

const BENEVOLE_MOTIF_MAX = 200

function formatBenevoleMotif(prenom: string): string {
  const motif = `Bénévole — ${prenom.trim()}`
  return motif.length > BENEVOLE_MOTIF_MAX ? motif.slice(0, BENEVOLE_MOTIF_MAX) : motif
}

function paymentLabel(p: SalePayment, kind: 'sale' | 'refund' = 'sale'): string {
  if (kind === 'refund') {
    if (p.mode === 'card') return 'Remboursement carte'
    if (p.mode === 'cash') return 'Remboursement espèces'
    return 'Remboursement espèces + carte'
  }
  if (p.mode === 'card') return 'Carte'
  if (p.mode === 'cash') return 'Espèces'
  return 'Espèces + carte'
}

export default function CaisseView(): JSX.Element {
  const { data, setData, logoHref } = useAppState()
  const { pendingRefundSale, acknowledgePendingRefund } = useShellNav()
  const now = useClock()
  const [category, setCategory] = useState<string | 'all'>('all')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [showPayment, setShowPayment] = useState(false)
  const [paymentModalInitial, setPaymentModalInitial] = useState<'choose' | 'cash' | 'card'>('choose')
  const [refundMode, setRefundMode] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [lastTotalCents, setLastTotalCents] = useState(0)
  const [lastCartDiscountPct, setLastCartDiscountPct] = useState(0)
  const [lastCartDiscountReason, setLastCartDiscountReason] = useState('')
  const [lastLines, setLastLines] = useState<CartLineRow[]>([])
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({})
  const [discountPctByProduct, setDiscountPctByProduct] = useState<Record<string, number>>({})
  const [discountReasonByProduct, setDiscountReasonByProduct] = useState<Record<string, string>>({})
  const [cartDiscountPct, setCartDiscountPct] = useState(0)
  const [cartDiscountReason, setCartDiscountReason] = useState('')
  /** Menu remise (ligne ou total panier) */
  const [remiseModal, setRemiseModal] = useState<
    | { scope: 'line'; productId: string; draftPct: string; draftReason: string }
    | { scope: 'cart'; draftPct: string; draftReason: string }
    | null
  >(null)
  /** Modale prénom bénévole (au-dessus de la modale Remise). */
  const [benevoleModalOpen, setBenevoleModalOpen] = useState(false)
  const [benevolePrenom, setBenevolePrenom] = useState('')
  const [benevoleError, setBenevoleError] = useState<string | null>(null)
  const [refundMaxByProduct, setRefundMaxByProduct] = useState<Record<string, number> | null>(null)
  const [refundSourceMeta, setRefundSourceMeta] = useState<{
    saleId: string
    orderNumber?: number
  } | null>(null)
  const [lastPayment, setLastPayment] = useState<SalePayment | null>(null)
  const [lastOrderNumber, setLastOrderNumber] = useState<number | null>(null)
  const [lastRecordKind, setLastRecordKind] = useState<'sale' | 'refund'>('sale')
  const [productImg, setProductImg] = useState<Record<string, string>>({})
  const [paymentDetail, setPaymentDetail] = useState<ClientPaymentDetail | null>(null)
  const [tabletPayTick, setTabletPayTick] = useState(0)

  const applyingRemoteCart = useRef(false)

  const onPaymentDisplayUpdate = useCallback((d: ClientPaymentDetail | null) => {
    setPaymentDetail(d)
  }, [])

  const [remoteDisplayOn, setRemoteDisplayOn] = useState(true)

  useEffect(() => {
    void window.caisse.getClientDisplayFlags().then((f) => setRemoteDisplayOn(f.remoteEnabled))
  }, [])

  useEffect(() => {
    void window.caisse.remoteCaisseGetMirror().then((m: RemoteCaisseMirror) => {
      if (
        Object.keys(m.quantities).length > 0 ||
        m.refundMode ||
        (m.refundMaxByProduct && Object.keys(m.refundMaxByProduct).length > 0)
      ) {
        applyingRemoteCart.current = true
        setQuantities(m.quantities)
        setRefundMode(m.refundMode)
        setRefundMaxByProduct(m.refundMaxByProduct)
        setRefundSourceMeta(m.refundSourceMeta)
        setPriceOverrides(m.priceOverrides)
        setDiscountPctByProduct(m.lineDiscountPct ?? {})
        setDiscountReasonByProduct(m.lineDiscountReason ?? {})
        setCartDiscountPct(
          typeof m.cartDiscountPct === 'number' && Number.isFinite(m.cartDiscountPct)
            ? Math.min(100, Math.max(0, Math.round(m.cartDiscountPct)))
            : 0
        )
        setCartDiscountReason(
          typeof m.cartDiscountReason === 'string' ? m.cartDiscountReason.trim().slice(0, 200) : ''
        )
        window.setTimeout(() => {
          applyingRemoteCart.current = false
        }, 80)
      }
    })
  }, [])

  useEffect(() => {
    return window.caisse.onRemoteCaisseStateSync((m: RemoteCaisseMirror) => {
      applyingRemoteCart.current = true
      setQuantities(m.quantities)
      setRefundMode(m.refundMode)
      setRefundMaxByProduct(m.refundMaxByProduct)
      setRefundSourceMeta(m.refundSourceMeta)
      setPriceOverrides(m.priceOverrides)
      setDiscountPctByProduct(m.lineDiscountPct ?? {})
      setDiscountReasonByProduct(m.lineDiscountReason ?? {})
      setCartDiscountPct(
        typeof m.cartDiscountPct === 'number' && Number.isFinite(m.cartDiscountPct)
          ? Math.min(100, Math.max(0, Math.round(m.cartDiscountPct)))
          : 0
      )
      setCartDiscountReason(
        typeof m.cartDiscountReason === 'string' ? m.cartDiscountReason.trim().slice(0, 200) : ''
      )
      window.setTimeout(() => {
        applyingRemoteCart.current = false
      }, 80)
    })
  }, [])

  useEffect(() => {
    return window.caisse.onRemoteCaisseSaleDone(() => {
      setQuantities({})
      setPriceOverrides({})
      setDiscountPctByProduct({})
      setDiscountReasonByProduct({})
      setCartDiscountPct(0)
      setCartDiscountReason('')
      setRemiseModal(null)
      setRefundMaxByProduct(null)
      setRefundSourceMeta(null)
    })
  }, [])

  useEffect(() => {
    return window.caisse.onTabletPaymentOverlay(() => setTabletPayTick((n) => n + 1))
  }, [])

  useEffect(() => {
    if (!remiseModal) return
    if (remiseModal.scope === 'line') {
      const q = quantities[remiseModal.productId]
      if (q == null || q <= 0) setRemiseModal(null)
    } else {
      const hasLines = Object.values(quantities).some((q) => (q ?? 0) > 0)
      if (!hasLines) setRemiseModal(null)
    }
  }, [quantities, remiseModal])

  useEffect(() => {
    if (!remiseModal) {
      setBenevoleModalOpen(false)
      setBenevolePrenom('')
      setBenevoleError(null)
    }
  }, [remiseModal])

  const remoteMirrorPayload = useMemo(
    (): RemoteCaisseMirror => ({
      quantities,
      refundMode,
      refundMaxByProduct,
      refundSourceMeta,
      priceOverrides,
      lineDiscountPct: discountPctByProduct,
      lineDiscountReason: discountReasonByProduct,
      cartDiscountPct,
      cartDiscountReason
    }),
    [
      quantities,
      refundMode,
      refundMaxByProduct,
      refundSourceMeta,
      priceOverrides,
      discountPctByProduct,
      discountReasonByProduct,
      cartDiscountPct,
      cartDiscountReason
    ]
  )

  useEffect(() => {
    if (applyingRemoteCart.current) return
    void window.caisse.remoteCaissePublishState(remoteMirrorPayload)
  }, [remoteMirrorPayload])

  const setRemoteClientEnabled = useCallback(async (enabled: boolean) => {
    await window.caisse.setClientDisplayRemoteEnabled(enabled)
    setRemoteDisplayOn(enabled)
  }, [])

  const products = data.products
  const sumupConfigured = useMemo(
    () => sumUpPaymentsReady(data.integrations.sumup),
    [data.integrations.sumup]
  )

  const sumupTerminalAuto = useMemo(() => {
    const s = data.integrations.sumup
    return Boolean(sumUpPaymentsReady(s) && (s.readerId ?? '').trim().length > 0)
  }, [data.integrations.sumup])

  const productImgSig = useMemo(
    () => products.map((p) => `${p.id}:${p.imageFile ?? ''}`).join('|'),
    [products]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next: Record<string, string> = {}
      for (const p of products) {
        if (!p.imageFile) continue
        const u = await window.caisse.getProductImageDataUrl(p.imageFile)
        if (u && !cancelled) next[p.id] = u
      }
      if (!cancelled) setProductImg(next)
    })()
    return () => {
      cancelled = true
    }
  }, [productImgSig])
  const stock = useMemo(
    () => getStockMap(data, data.selectedEventId),
    [data.stockByEvent, data.selectedEventId]
  )
  const selectedEvent = data.events.find((e) => e.id === data.selectedEventId)
  const eventClosed = selectedEvent?.closed === true
  const sessionInfo =
    data.selectedEventId && data.eventSessions[data.selectedEventId]
      ? data.eventSessions[data.selectedEventId]
      : undefined
  const needsFloat = Boolean(
    data.selectedEventId && selectedEvent && !sessionInfo && !eventClosed
  )
  const canSell = Boolean(selectedEvent && sessionInfo && !eventClosed)

  const [floatDraft, setFloatDraft] = useState('0')

  useEffect(() => {
    setQuantities({})
    setCartDiscountPct(0)
    setCartDiscountReason('')
  }, [data.selectedEventId])

  useEffect(() => {
    if (needsFloat) setFloatDraft('0')
  }, [needsFloat, data.selectedEventId])

  const startSession = useCallback(() => {
    const c = parseEurosToCents(floatDraft.replace(/\s/g, ''))
    if (c === null) return
    const eid = data.selectedEventId
    if (!eid) return
    setData((prev) => ({
      ...prev,
      eventSessions: {
        ...prev.eventSessions,
        [eid]: { floatCents: c, startedAt: new Date().toISOString() }
      }
    }))
  }, [data.selectedEventId, floatDraft, setData])

  const categoryTabs = data.categories

  const filtered = useMemo(() => {
    if (category === 'all') return products
    return products.filter((p) => p.category === category)
  }, [category, products])

  const lines = useMemo((): CartLineRow[] => {
    const out: CartLineRow[] = []
    for (const id of Object.keys(quantities)) {
      const q = quantities[id]
      if (q <= 0) continue
      const product = products.find((p) => p.id === id)
      if (!product) continue
      const listUnitCents = lineBaseUnitCents(product.priceCents, priceOverrides, id)
      const discountPercent = readLineDiscountPct(discountPctByProduct, id)
      const discountReason = readLineDiscountReason(discountReasonByProduct, id)
      const unitCents = finalUnitCents(listUnitCents, discountPercent)
      out.push({ product, qty: q, unitCents, listUnitCents, discountPercent, discountReason })
    }
    out.sort((a, b) => a.product.name.localeCompare(b.product.name, 'fr'))
    return out
  }, [quantities, products, priceOverrides, discountPctByProduct, discountReasonByProduct])

  const subtotalCents = useMemo(
    () => lines.reduce((s, l) => s + l.unitCents * l.qty, 0),
    [lines]
  )
  const totalCents = useMemo(
    () => finalUnitCents(subtotalCents, cartDiscountPct),
    [subtotalCents, cartDiscountPct]
  )

  const applyRefundFromSale = useCallback(
    (sale: SaleRecord) => {
      setRefundMode(true)
      setData((prev) => ({ ...prev, selectedEventId: sale.eventId }))
      const caps: Record<string, number> = {}
      const overrides: Record<string, number> = {}
      const dPct: Record<string, number> = {}
      const dReason: Record<string, string> = {}
      const qtyMap: Record<string, number> = {}
      let missing = 0
      for (const line of sale.lines) {
        const p = products.find((x) => x.id === line.productId)
        if (!p) {
          missing++
          continue
        }
        caps[line.productId] = line.qty
        const list = line.listUnitCents ?? line.unitCents
        overrides[line.productId] = list
        const pct = line.discountPercent ?? 0
        if (pct > 0) dPct[line.productId] = pct
        const r = typeof line.discountReason === 'string' ? line.discountReason.trim() : ''
        if (r) dReason[line.productId] = r
        qtyMap[line.productId] = line.qty
      }
      if (Object.keys(qtyMap).length === 0) {
        window.alert(
          missing > 0
            ? 'Aucun article de cette vente ne correspond au catalogue actuel. Vérifiez les articles.'
            : 'Vente vide.'
        )
        return
      }
      setRefundMaxByProduct(caps)
      setPriceOverrides(overrides)
      setDiscountPctByProduct(dPct)
      setDiscountReasonByProduct(dReason)
      const cPct = sale.cartDiscountPercent ?? 0
      setCartDiscountPct(cPct > 0 ? Math.min(100, Math.round(cPct)) : 0)
      setCartDiscountReason(
        typeof sale.cartDiscountReason === 'string' ? sale.cartDiscountReason.trim().slice(0, 200) : ''
      )
      setQuantities(qtyMap)
      setRefundSourceMeta({
        saleId: sale.id,
        orderNumber: sale.orderNumber
      })
      if (missing > 0) {
        window.alert(
          `${missing} ligne(s) ignorée(s) : article absent du catalogue ou identifiant modifié. Les autres lignes sont chargées.`
        )
      }
    },
    [products, setData]
  )

  useEffect(() => {
    if (!pendingRefundSale) return
    if (pendingRefundSale.kind === 'refund') {
      acknowledgePendingRefund()
      window.alert('Choisissez une vente (et non un remboursement déjà enregistré).')
      return
    }
    const s = pendingRefundSale
    acknowledgePendingRefund()
    applyRefundFromSale(s)
  }, [pendingRefundSale, acknowledgePendingRefund, applyRefundFromSale])

  const toggleRefundMode = useCallback(() => {
    setRefundMode((v) => !v)
    setQuantities({})
    setPriceOverrides({})
    setDiscountPctByProduct({})
    setDiscountReasonByProduct({})
    setCartDiscountPct(0)
    setCartDiscountReason('')
    setRefundMaxByProduct(null)
    setRefundSourceMeta(null)
    setRemiseModal(null)
  }, [])

  const add = useCallback(
    (p: ProductConfig) => {
      if (!canSell) return
      const max = stockAvailable(p, stock)
      const cur = quantities[p.id] ?? 0
      const cap = refundMaxByProduct?.[p.id]
      if (refundMode && cap != null && cur + 1 > cap) return
      if (!refundMode && p.trackStock && cur + 1 > max) return
      setQuantities((prev) => ({ ...prev, [p.id]: cur + 1 }))
    },
    [canSell, quantities, stock, refundMode, refundMaxByProduct]
  )

  const setQty = useCallback(
    (id: string, qty: number) => {
      if (!canSell) return
      const product = products.find((p) => p.id === id)
      if (!product) return
      const maxStock = stockAvailable(product, stock)
      const cap = refundMaxByProduct?.[id]
      let next = Math.max(0, qty)
      if (refundMode && cap != null) next = Math.min(next, cap)
      if (!refundMode && product.trackStock) next = Math.min(next, maxStock)
      setQuantities((prev) => {
        const n = { ...prev }
        if (next <= 0) {
          delete n[id]
          setPriceOverrides((po) => {
            if (!(id in po)) return po
            const c = { ...po }
            delete c[id]
            return c
          })
          setDiscountPctByProduct((dp) => {
            if (!(id in dp)) return dp
            const c = { ...dp }
            delete c[id]
            return c
          })
          setDiscountReasonByProduct((dr) => {
            if (!(id in dr)) return dr
            const c = { ...dr }
            delete c[id]
            return c
          })
        } else n[id] = next
        return n
      })
    },
    [canSell, products, stock, refundMode, refundMaxByProduct]
  )

  const clearCart = useCallback(() => {
    setQuantities({})
    setPriceOverrides({})
    setDiscountPctByProduct({})
    setDiscountReasonByProduct({})
    setCartDiscountPct(0)
    setCartDiscountReason('')
    setRefundMaxByProduct(null)
    setRefundSourceMeta(null)
    setRemiseModal(null)
  }, [])

  const commitLineRemise = useCallback((productId: string, pct: number, reason: string) => {
    setDiscountPctByProduct((prev) => {
      const n = { ...prev }
      if (pct <= 0) delete n[productId]
      else n[productId] = Math.min(100, Math.max(0, Math.round(pct)))
      return n
    })
    setDiscountReasonByProduct((prev) => {
      const n = { ...prev }
      const t = reason.trim()
      if (!t) delete n[productId]
      else n[productId] = t.slice(0, 200)
      return n
    })
    setRemiseModal(null)
  }, [])

  const commitCartRemise = useCallback((pct: number, reason: string) => {
    const p = pct <= 0 ? 0 : Math.min(100, Math.max(0, Math.round(pct)))
    setCartDiscountPct(p)
    setCartDiscountReason(p <= 0 ? '' : reason.trim().slice(0, 200))
    setRemiseModal(null)
  }, [])

  const confirmBenevolePrenom = useCallback(() => {
    const p = benevolePrenom.trim()
    if (!p) {
      setBenevoleError('Le prénom est obligatoire.')
      return
    }
    setRemiseModal((m) => (m ? { ...m, draftReason: formatBenevoleMotif(p) } : m))
    setBenevoleModalOpen(false)
    setBenevolePrenom('')
    setBenevoleError(null)
  }, [benevolePrenom])

  const openPaymentChoose = useCallback(() => {
    if (lines.length === 0) return
    if (!data.selectedEventId || !canSell) return
    setPaymentModalInitial('choose')
    setShowPayment(true)
  }, [lines.length, data.selectedEventId, canSell])

  const openPaymentCash = useCallback(() => {
    if (lines.length === 0) return
    if (!data.selectedEventId || !canSell) return
    setPaymentModalInitial('cash')
    setShowPayment(true)
  }, [lines.length, data.selectedEventId, canSell])

  const openPaymentCard = useCallback(() => {
    if (lines.length === 0) return
    if (!data.selectedEventId || !canSell) return
    setPaymentModalInitial('card')
    setShowPayment(true)
  }, [lines.length, data.selectedEventId, canSell])

  const finalizeSale = useCallback(
    (payment: SalePayment) => {
      if (!data.selectedEventId || !selectedEvent) return
      const snapLines = lines.map((l) => ({ ...l }))
      const subtotal = snapLines.reduce((s, l) => s + l.unitCents * l.qty, 0)
      const cartPctSnap = Math.min(100, Math.max(0, Math.round(cartDiscountPct)))
      const total = finalUnitCents(subtotal, cartPctSnap)
      const cartReasonSnap = cartDiscountReason.trim()
      const isRefund = refundMode

      const orderNumber = data.orderCounter + 1

      setLastTotalCents(total)
      setLastCartDiscountPct(cartPctSnap)
      setLastCartDiscountReason(cartReasonSnap)
      setLastLines(snapLines)
      setLastPayment(payment)
      setLastOrderNumber(orderNumber)
      setLastRecordKind(isRefund ? 'refund' : 'sale')
      setQuantities({})
      setPriceOverrides({})
      setDiscountPctByProduct({})
      setDiscountReasonByProduct({})
      setCartDiscountPct(0)
      setCartDiscountReason('')
      setRemiseModal(null)
      setRefundMaxByProduct(null)
      setRefundSourceMeta(null)
      if (isRefund) setRefundMode(false)
      setShowPayment(false)

      setData((prev) => {
        const eid = prev.selectedEventId
        if (!eid) return { ...prev, orderCounter: orderNumber }
        const map = { ...(prev.stockByEvent[eid] ?? {}) }
        for (const { product: p, qty } of snapLines) {
          if (!p.trackStock) continue
          const cur = map[p.id] ?? 0
          map[p.id] = isRefund ? cur + qty : Math.max(0, cur - qty)
        }
        return {
          ...prev,
          stockByEvent: { ...prev.stockByEvent, [eid]: map },
          orderCounter: orderNumber
        }
      })

      const assocName = data.association.name.trim() || 'Association'
      const sale: SaleRecord = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        orderNumber,
        eventId: selectedEvent.id,
        eventName: selectedEvent.name,
        associationName: assocName,
        lines: snapLines.map((l): SaleLineSnapshot => {
          const lineTotalCents = l.unitCents * l.qty
          const snap: SaleLineSnapshot = {
            productId: l.product.id,
            name: l.product.name,
            emoji: l.product.emoji,
            qty: l.qty,
            unitCents: l.unitCents,
            lineTotalCents
          }
          if (l.listUnitCents !== l.unitCents || l.discountPercent > 0) {
            snap.listUnitCents = l.listUnitCents
          }
          if (l.discountPercent > 0) snap.discountPercent = l.discountPercent
          const dr = l.discountReason.trim()
          if (dr) snap.discountReason = dr
          return snap
        }),
        totalCents: total,
        ...(cartPctSnap > 0 ? { cartDiscountPercent: cartPctSnap } : {}),
        ...(cartReasonSnap ? { cartDiscountReason: cartReasonSnap } : {}),
        payment,
        ...(isRefund
          ? {
              kind: 'refund' as const,
              ...(refundSourceMeta
                ? {
                    refundSourceSaleId: refundSourceMeta.saleId,
                    ...(refundSourceMeta.orderNumber != null && refundSourceMeta.orderNumber > 0
                      ? { refundSourceOrderNumber: refundSourceMeta.orderNumber }
                      : {})
                  }
                : {})
            }
          : {})
      }

      void window.caisse.appendSale(sale).then(async () => {
        if (!isRefund && data.printing.autoPrintTickets && data.printing.deviceName) {
          const logo = await window.caisse.getLogoDataUrl(data.association.logoFile)
          const tickets: TicketUnitPayload[] = []
          const atIso = sale.at
          for (const line of snapLines) {
            for (let i = 0; i < line.qty; i++) {
              tickets.push({
                orderNumber,
                emoji: line.product.emoji,
                productName: line.product.name,
                unitPriceCents: line.unitCents,
                eventName: selectedEvent.name,
                associationName: data.association.name.trim(),
                atIso,
                ...(line.discountReason.trim()
                  ? { discountReason: line.discountReason.trim() }
                  : {}),
                ...(cartPctSnap > 0 ? { cartDiscountPercent: cartPctSnap } : {}),
                ...(cartReasonSnap ? { cartDiscountReason: cartReasonSnap } : {})
              })
            }
          }
          await window.caisse.printTickets({
            tickets,
            deviceName: data.printing.deviceName,
            logoDataUrl: logo,
            silent: data.printing.silentPrint
          })
        }
        setShowSuccess(true)
      })
    },
    [
      data,
      selectedEvent,
      lines,
      setData,
      refundMode,
      refundSourceMeta,
      cartDiscountPct,
      cartDiscountReason
    ]
  )

  const assoc = data.association

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const t = await window.caisse.getTabletPaymentOverlay()
      if (cancelled) return
      const linesPayload = (showSuccess && lastLines.length > 0 ? lastLines : lines).map((l) => {
        const lineDetailLines = buildClientLineDetailLines({
          qty: l.qty,
          unitCents: l.unitCents,
          listUnitCents: l.listUnitCents,
          discountPercent: l.discountPercent,
          discountReason: l.discountReason
        })
        return {
          emoji: l.product.emoji,
          name: l.product.name,
          qty: l.qty,
          unitCents: l.unitCents,
          lineTotalCents: l.unitCents * l.qty,
          ...(lineDetailLines.length > 0 ? { lineDetailLines } : {})
        }
      })
      const totalDisp = showSuccess ? lastTotalCents : totalCents

      let phase: ClientDisplayPhase = 'welcome'
      let payDetail: ClientPaymentDetail | undefined
      if (showSuccess && lastPayment) {
        phase = 'thanks'
      } else if (t.active && t.detail) {
        phase = 'payment'
        payDetail = t.detail
      } else if (showPayment) {
        phase = 'payment'
        payDetail = paymentDetail ?? undefined
      } else if (linesPayload.length > 0) {
        phase = 'cart'
      } else {
        phase = 'welcome'
      }

      const cartPctLive = Math.min(100, Math.max(0, Math.round(cartDiscountPct)))
      const cartReasonLive = cartDiscountReason.trim()
      const linesSubForCart = linesPayload.reduce((s, l) => s + l.lineTotalCents, 0)
      const showCartRecap =
        (phase === 'cart' || phase === 'payment') &&
        linesPayload.length > 0 &&
        (cartPctLive > 0 || cartReasonLive.length > 0)
      const cartDiscountSummary = showCartRecap
        ? {
            linesSubtotalCents: linesSubForCart,
            discountAmountCents: linesSubForCart - totalDisp,
            ...(cartPctLive > 0 ? { percent: cartPctLive } : {}),
            ...(cartReasonLive ? { reason: cartReasonLive } : {})
          }
        : undefined

      const payload: ClientDisplayState = {
        associationName: data.association.name.trim() || 'Buvette',
        associationNumero: data.association.numero.trim() || undefined,
        eventName: selectedEvent?.name ?? null,
        refundMode,
        phase,
        lines: linesPayload,
        totalCents: totalDisp,
        ...(cartDiscountSummary ? { cartDiscountSummary } : {}),
        thanksTitle:
          showSuccess && lastPayment
            ? lastRecordKind === 'refund'
              ? 'Remboursement enregistré'
              : 'Merci pour votre achat !'
            : undefined,
        thanksDetail: showSuccess && lastPayment ? formatMoney(lastTotalCents) : undefined,
        orderNumberLabel:
          showSuccess && lastOrderNumber != null && lastOrderNumber > 0
            ? formatOrderDisplay(lastOrderNumber)
            : null,
        logoDataUrl: logoHref,
        paymentDetail: phase === 'payment' ? payDetail : undefined,
        clientUiTheme: data.clientDisplayTheme ?? 'light'
      }
      void window.caisse.pushClientDisplay(payload)
    })()
    return () => {
      cancelled = true
    }
  }, [
    data.association.name,
    data.association.numero,
    selectedEvent?.name,
    refundMode,
    lines,
    totalCents,
    showSuccess,
    showPayment,
    lastPayment,
    lastLines,
    lastTotalCents,
    lastOrderNumber,
    lastRecordKind,
    logoHref,
    paymentDetail,
    data.clientDisplayTheme,
    tabletPayTick,
    cartDiscountPct,
    cartDiscountReason
  ])

  return (
    <>
      <div className="main">
        <div className="panel-left">
          {!data.selectedEventId && (
            <div className="banner-warn" role="status">
              Sélectionnez un <strong>événement actif</strong> (menu Événements ou liste ci-dessous)
              pour encaisser.
            </div>
          )}
          {data.selectedEventId && selectedEvent && eventClosed && (
            <div className="banner-event-closed" role="status">
              <strong>Événement clôturé</strong> — aucun encaissement ni remboursement n’est possible pour «{' '}
              {selectedEvent.name} ». Rouvrez l’événement dans le menu <strong>Événements</strong> ou choisissez
              un autre événement.
            </div>
          )}
          {data.selectedEventId && selectedEvent && needsFloat && (
            <div className="banner-warn banner-float" role="status">
              <strong>Fond de caisse requis</strong> — saisissez le montant d’espèces en caisse au démarrage
              de la session pour cet événement, puis validez (ci-dessous ou dans l’encart).
            </div>
          )}
          <div className="tabs" role="tablist" aria-label="Catégories">
            <button
              type="button"
              role="tab"
              aria-selected={category === 'all'}
              className={`tab${category === 'all' ? ' active' : ''}`}
              onClick={() => setCategory('all')}
            >
              <span className="emoji">✦</span> Tout
            </button>
            {categoryTabs.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                className={`tab${category === c.id ? ' active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                <span className="emoji">{c.short}</span>
                {c.label}
              </button>
            ))}
          </div>
          <div className="grid-wrap">
            <div className="product-grid">
              {filtered.map((p) => {
                const avail = stockAvailable(p, stock)
                const disabled = !canSell || (!refundMode && p.trackStock && avail <= 0)
                const low = p.trackStock && avail > 0 && avail <= 5
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`product-card${disabled ? ' disabled' : ''}`}
                    disabled={disabled}
                    onClick={() => add(p)}
                    title={
                      disabled
                        ? refundMode
                          ? 'Indisponible'
                          : 'Rupture de stock'
                        : p.trackStock
                          ? `${p.name} — stock : ${avail}`
                          : p.name
                    }
                  >
                    <span
                      className={`stock-badge${p.trackStock ? '' : ' stock-badge-muted'}${low ? ' stock-badge-low' : ''}`}
                      aria-hidden
                    >
                      {p.trackStock ? avail : '—'}
                    </span>
                    {productImg[p.id] ? (
                      <div className="product-card-visual">
                        <img src={productImg[p.id]} alt="" className="product-card-img" />
                      </div>
                    ) : (
                      <div className="emoji">{p.emoji}</div>
                    )}
                    <div className="name">{p.name}</div>
                    <div className="price">{formatMoney(p.priceCents)}</div>
                    {p.trackStock && (
                      <div className="stock-hint" aria-hidden>
                        Stock {avail}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <aside className={`panel-cart${refundMode ? ' panel-cart-refund' : ''}`}>
          <div className="cart-head">
            <div className="cart-head-top">
              <h2>{refundMode ? 'Remboursement' : 'Panier'}</h2>
              <button
                type="button"
                className="btn btn-secondary btn-cart-clear"
                disabled={lines.length === 0}
                onClick={clearCart}
              >
                Vider le panier
              </button>
            </div>
            <div className="cart-head-row">
              <label className="refund-toggle">
                <input
                  type="checkbox"
                  checked={refundMode}
                  disabled={eventClosed}
                  onChange={() => toggleRefundMode()}
                />
                <span>Mode remboursement</span>
              </label>
            </div>
            <label className="check-label cart-remote-toggle">
              <input
                type="checkbox"
                checked={remoteDisplayOn}
                onChange={(e) => void setRemoteClientEnabled(e.target.checked)}
              />
              <span>Affichage client (navigateur / 2ᵉ écran)</span>
            </label>
            <span>
              {refundMode && refundSourceMeta?.orderNumber != null && refundSourceMeta.orderNumber > 0 ? (
                <>
                  <span className="refund-source-pill" title="Remboursement lié à une vente passée">
                    Depuis commande {formatOrderDisplay(refundSourceMeta.orderNumber)}
                  </span>
                  {' · '}
                </>
              ) : null}
              {selectedEvent ? (
                <>
                  <span className="event-pill">{selectedEvent.name}</span>
                  {' · '}
                </>
              ) : null}
              {sessionInfo ? (
                <>
                  {' '}
                  <span className="float-pill" title="Fond de caisse au démarrage de la session">
                    Fond {formatMoney(sessionInfo.floatCents)}
                  </span>
                  {' '}
                </>
              ) : null}
              {lines.length ? `${lines.length} ligne(s)` : 'Aucun article'}
            </span>
          </div>
          <div className="cart-lines">
            {lines.length === 0 ? (
              <div className="empty-cart">
                {refundMode
                  ? 'Ajoutez les articles remboursés depuis la grille'
                  : 'Ajoutez des articles depuis la grille'}
              </div>
            ) : (
              lines.map(
                ({ product: p, qty, unitCents, listUnitCents, discountPercent, discountReason }) => {
                  const maxRef = refundMaxByProduct?.[p.id]
                  const atCap = refundMode && maxRef != null && qty >= maxRef
                  return (
                    <div key={p.id} className="line">
                      <div className="line-top">
                        <span className="name">
                          {p.emoji} {p.name}
                        </span>
                        <span className="unit">{formatMoney(unitCents)} net / u. ×</span>
                      </div>
                      {!refundMode ? (
                        <div className="line-adjust">
                          <label className="line-adjust-field line-adjust-field--price">
                            <span>Prix unitaire TTC (€)</span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              disabled={!canSell}
                              value={Math.round(listUnitCents) / 100}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                if (!Number.isFinite(v) || v < 0) return
                                const c = Math.round(v * 100)
                                if (c === p.priceCents) {
                                  setPriceOverrides((prev) => {
                                    const n = { ...prev }
                                    delete n[p.id]
                                    return n
                                  })
                                } else {
                                  setPriceOverrides((prev) => ({ ...prev, [p.id]: c }))
                                }
                              }}
                            />
                          </label>
                          <div className="line-adjust-actions">
                            <button
                              type="button"
                              className={
                                'btn-remise-cart' +
                                (discountPercent > 0 ? ' btn-remise-cart--active' : '')
                              }
                              disabled={!canSell}
                              title="Remise sur cette ligne"
                              onClick={() =>
                                setRemiseModal({
                                  scope: 'line',
                                  productId: p.id,
                                  draftPct: discountPercent > 0 ? String(discountPercent) : '',
                                  draftReason: discountReason
                                })
                              }
                            >
                              <span className="btn-remise-cart__icon" aria-hidden>
                                %
                              </span>
                              <span className="btn-remise-cart__label">Remise</span>
                              {discountPercent > 0 ? (
                                <span className="btn-remise-cart__badge">{discountPercent} %</span>
                              ) : null}
                            </button>
                            {priceOverrides[p.id] != null ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-compact"
                                disabled={!canSell}
                                onClick={() =>
                                  setPriceOverrides((prev) => {
                                    const n = { ...prev }
                                    delete n[p.id]
                                    return n
                                  })
                                }
                              >
                                Prix catalogue
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : discountPercent > 0 || listUnitCents !== unitCents ? (
                        <div className="line-readonly-muted">
                          Barème {formatMoney(listUnitCents)} / u.
                          {discountPercent > 0 ? ` · remise ${discountPercent} %` : ''}
                          {discountReason.trim() ? ` — ${discountReason.trim()}` : ''}
                        </div>
                      ) : null}
                      <div className="line-controls">
                        <button
                          type="button"
                          className="qbtn"
                          aria-label="Diminuer"
                          disabled={!canSell}
                          onClick={() => setQty(p.id, qty - 1)}
                        >
                          −
                        </button>
                        <span className="qty">{qty}</span>
                        <button
                          type="button"
                          className="qbtn"
                          aria-label="Augmenter"
                          onClick={() => setQty(p.id, qty + 1)}
                          disabled={
                            !canSell ||
                            atCap ||
                            (!refundMode && p.trackStock && qty >= stockAvailable(p, stock))
                          }
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="qbtn danger"
                          aria-label="Retirer"
                          disabled={!canSell}
                          onClick={() => setQty(p.id, 0)}
                        >
                          ×
                        </button>
                      </div>
                      <div className="line-total">Sous-total {formatMoney(unitCents * qty)}</div>
                    </div>
                  )
                }
              )
            )}
          </div>
          <div className="cart-footer">
            {lines.length > 0 ? (
              <div className="cart-global-remise">
                <div className="cart-global-remise__meta">
                  {cartDiscountPct > 0 ? (
                    <>
                      Sous-total {formatMoney(subtotalCents)}
                      {' · '}
                      remise sur le total {cartDiscountPct} %
                      {cartDiscountReason.trim()
                        ? ` — ${cartDiscountReason.trim()}`
                        : ''}
                    </>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={
                    'btn-remise-cart' + (cartDiscountPct > 0 ? ' btn-remise-cart--active' : '')
                  }
                  disabled={!canSell}
                  title="Remise sur le total du panier"
                  onClick={() =>
                    setRemiseModal({
                      scope: 'cart',
                      draftPct: cartDiscountPct > 0 ? String(cartDiscountPct) : '',
                      draftReason: cartDiscountReason
                    })
                  }
                >
                  <span className="btn-remise-cart__icon" aria-hidden>
                    %
                  </span>
                  <span className="btn-remise-cart__label">Remise totale</span>
                  {cartDiscountPct > 0 ? (
                    <span className="btn-remise-cart__badge">{cartDiscountPct} %</span>
                  ) : null}
                </button>
              </div>
            ) : null}
            <div className="total-row">
              <span className="label">{refundMode ? 'Total à rembourser' : 'Total'}</span>
              <span className="amount">{formatMoney(totalCents)}</span>
            </div>
            <div className={`actions${refundMode ? ' actions-single' : ' cart-pay-actions'}`}>
              {refundMode ? (
                <button
                  type="button"
                  className="btn btn-primary btn-refund"
                  disabled={lines.length === 0 || !data.selectedEventId || !canSell}
                  onClick={openPaymentChoose}
                >
                  Rembourser
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={lines.length === 0 || !data.selectedEventId || !canSell}
                    onClick={openPaymentCash}
                  >
                    Espèces
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={lines.length === 0 || !data.selectedEventId || !canSell}
                    onClick={openPaymentCard}
                  >
                    Carte
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {needsFloat && selectedEvent && (
        <div
          className="overlay session-float-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="float-title"
        >
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 id="float-title">Démarrer la session — {selectedEvent.name}</h3>
            <p className="sub">
              Indiquez le <strong>fond de caisse</strong> (espèces disponibles en début de service). Vous
              pouvez saisir <strong>0 €</strong> si besoin.
            </p>
            <label className="field">
              <span>Fond de caisse (€)</span>
              <input
                type="text"
                inputMode="decimal"
                className="mono"
                value={floatDraft}
                onChange={(e) => setFloatDraft(e.target.value)}
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={startSession}>
                Démarrer la session
              </button>
            </div>
          </div>
        </div>
      )}

      {remiseModal ? (
        <div
          className="overlay remise-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remise-title"
          onClick={() => {
            setBenevoleModalOpen(false)
            setRemiseModal(null)
          }}
        >
          <div className="modal discount-menu-modal" onClick={(e) => e.stopPropagation()}>
            {remiseModal.scope === 'cart'
              ? (() => {
                  const applyManualCart = () => {
                    const raw = remiseModal.draftPct
                    const t = raw.replace(/\s/g, '').replace(',', '.').trim()
                    if (t === '') {
                      commitCartRemise(0, '')
                      return
                    }
                    const v = parseFloat(t)
                    if (!Number.isFinite(v) || v < 0) {
                      window.alert('Pourcentage invalide (0 à 100).')
                      return
                    }
                    commitCartRemise(Math.min(100, Math.round(v)), remiseModal.draftReason)
                  }
                  return (
                    <>
                      <h3 id="remise-title">Remise sur le total</h3>
                      <p className="sub remise-modal-product">
                        S’applique au sous-total du panier (somme des lignes après remises par article).
                      </p>
                      <label className="field">
                        <span>Remise (%)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="mono"
                          autoFocus
                          placeholder="0 à 100 — laisser vide pour 0 %"
                          value={remiseModal.draftPct}
                          onChange={(e) =>
                            setRemiseModal((m) =>
                              m && m.scope === 'cart' ? { ...m, draftPct: e.target.value } : m
                            )
                          }
                        />
                      </label>
                      <p className="sub discount-preset-label">Propositions :</p>
                      <div className="discount-preset-row">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!canSell}
                          onClick={() =>
                            setRemiseModal((m) =>
                              m && m.scope === 'cart' ? { ...m, draftPct: '50' } : m
                            )
                          }
                        >
                          50 %
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!canSell}
                          onClick={() =>
                            setRemiseModal((m) =>
                              m && m.scope === 'cart' ? { ...m, draftPct: '100' } : m
                            )
                          }
                        >
                          100 %
                        </button>
                      </div>
                      <label className="field">
                        <span>Motif (facultatif)</span>
                        <input
                          type="text"
                          maxLength={200}
                          value={remiseModal.draftReason}
                          placeholder="Texte libre…"
                          onChange={(e) =>
                            setRemiseModal((m) =>
                              m && m.scope === 'cart' ? { ...m, draftReason: e.target.value } : m
                            )
                          }
                        />
                      </label>
                      <div className="remise-modal-inline">
                        <button
                          type="button"
                          className="btn-benevole"
                          disabled={!canSell}
                          onClick={() => {
                            setBenevolePrenom('')
                            setBenevoleError(null)
                            setBenevoleModalOpen(true)
                          }}
                        >
                          <span className="btn-benevole__emoji" aria-hidden>
                            🤝
                          </span>
                          <span className="btn-benevole__text">Motif bénévole</span>
                        </button>
                      </div>
                      <div className="modal-actions remise-modal-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setBenevoleModalOpen(false)
                            setRemiseModal(null)
                          }}
                        >
                          Retour
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!canSell}
                          onClick={() => commitCartRemise(0, '')}
                        >
                          Aucune remise
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!canSell}
                          onClick={applyManualCart}
                        >
                          Appliquer la saisie
                        </button>
                      </div>
                    </>
                  )
                })()
              : (() => {
                  const rp = products.find((x) => x.id === remiseModal.productId)
                  if (!rp) {
                    return (
                      <>
                        <p>Article introuvable.</p>
                        <div className="modal-actions">
                          <button type="button" className="btn btn-primary" onClick={() => setRemiseModal(null)}>
                            Fermer
                          </button>
                        </div>
                      </>
                    )
                  }
                  const applyManualLine = () => {
                    const raw = remiseModal.draftPct
                    const t = raw.replace(/\s/g, '').replace(',', '.').trim()
                    if (t === '') {
                      commitLineRemise(remiseModal.productId, 0, remiseModal.draftReason)
                      return
                    }
                    const v = parseFloat(t)
                    if (!Number.isFinite(v) || v < 0) {
                      window.alert('Pourcentage invalide (0 à 100).')
                      return
                    }
                    commitLineRemise(
                      remiseModal.productId,
                      Math.min(100, Math.round(v)),
                      remiseModal.draftReason
                    )
                  }
                  return (
                    <>
                      <h3 id="remise-title">Remise</h3>
                      <p className="sub remise-modal-product">
                        {rp.emoji} {rp.name}
                      </p>
                      <label className="field">
                        <span>Remise (%)</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="mono"
                          autoFocus
                          placeholder="0 à 100 — laisser vide pour 0 %"
                          value={remiseModal.draftPct}
                          onChange={(e) =>
                            setRemiseModal((m) =>
                              m && m.scope === 'line' ? { ...m, draftPct: e.target.value } : m
                            )
                          }
                        />
                      </label>
                      <p className="sub discount-preset-label">Propositions :</p>
                      <div className="discount-preset-row">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!canSell}
                          onClick={() =>
                            setRemiseModal((m) =>
                              m && m.scope === 'line' ? { ...m, draftPct: '50' } : m
                            )
                          }
                        >
                          50 %
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!canSell}
                          onClick={() =>
                            setRemiseModal((m) =>
                              m && m.scope === 'line' ? { ...m, draftPct: '100' } : m
                            )
                          }
                        >
                          100 %
                        </button>
                      </div>
                      <label className="field">
                        <span>Motif (facultatif)</span>
                        <input
                          type="text"
                          maxLength={200}
                          value={remiseModal.draftReason}
                          placeholder="Texte libre…"
                          onChange={(e) =>
                            setRemiseModal((m) =>
                              m && m.scope === 'line' ? { ...m, draftReason: e.target.value } : m
                            )
                          }
                        />
                      </label>
                      <div className="remise-modal-inline">
                        <button
                          type="button"
                          className="btn-benevole"
                          disabled={!canSell}
                          onClick={() => {
                            setBenevolePrenom('')
                            setBenevoleError(null)
                            setBenevoleModalOpen(true)
                          }}
                        >
                          <span className="btn-benevole__emoji" aria-hidden>
                            🤝
                          </span>
                          <span className="btn-benevole__text">Motif bénévole</span>
                        </button>
                      </div>
                      <div className="modal-actions remise-modal-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setBenevoleModalOpen(false)
                            setRemiseModal(null)
                          }}
                        >
                          Retour
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={!canSell}
                          onClick={() => commitLineRemise(remiseModal.productId, 0, '')}
                        >
                          Aucune remise
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={!canSell}
                          onClick={applyManualLine}
                        >
                          Appliquer la saisie
                        </button>
                      </div>
                    </>
                  )
                })()}
          </div>
        </div>
      ) : null}

      {benevoleModalOpen && remiseModal ? (
        <div
          className="overlay benevole-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="benevole-modal-title"
          onClick={() => {
            setBenevoleModalOpen(false)
            setBenevolePrenom('')
            setBenevoleError(null)
          }}
        >
          <div className="modal benevole-prenom-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="benevole-modal-title">Motif bénévole</h3>
            <p className="sub">
              Indiquez le <strong>prénom</strong> du bénévole : il sera ajouté au motif de remise
              (&quot;Bénévole — …&quot;).
            </p>
            <label className="field">
              <span>Prénom du bénévole</span>
              <input
                type="text"
                autoFocus
                maxLength={80}
                className="mono"
                value={benevolePrenom}
                onChange={(e) => {
                  setBenevolePrenom(e.target.value)
                  setBenevoleError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmBenevolePrenom()
                  }
                }}
              />
            </label>
            {benevoleError ? (
              <p className="auth-err" role="alert">
                {benevoleError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setBenevoleModalOpen(false)
                  setBenevolePrenom('')
                  setBenevoleError(null)
                }}
              >
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmBenevolePrenom}>
                Valider
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PaymentModal
        open={showPayment}
        totalCents={totalCents}
        onClose={() => setShowPayment(false)}
        onPaid={finalizeSale}
        sumupConfigured={sumupConfigured}
        sumupTerminalAuto={sumupTerminalAuto}
        refundMode={refundMode}
        initialStep={paymentModalInitial}
        onPaymentDisplayUpdate={onPaymentDisplayUpdate}
      />

      {showSuccess && lastPayment && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={() => setShowSuccess(false)}
        >
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-brand">
              {logoHref ? (
                <img src={logoHref} alt="" className="receipt-logo" />
              ) : (
                <div className="brand-mark sm" aria-hidden>
                  🍺
                </div>
              )}
              <div>
                <h3 id="modal-title">{assoc.name || 'Caisse - Association - Buvette'}</h3>
                {assoc.numero ? <p className="sub mono">N° {assoc.numero}</p> : null}
              </div>
            </div>
            <p className="sub">
              {lastRecordKind === 'refund'
                ? 'Remboursement enregistré — le panier a été vidé.'
                : 'Paiement enregistré — le panier a été vidé.'}
            </p>
            {lastOrderNumber != null && (
              <div className="order-banner mono">Commande {formatOrderDisplay(lastOrderNumber)}</div>
            )}
            <div className="receipt pay-receipt-box">
              {selectedEvent ? <div>Événement : {selectedEvent.name}</div> : null}
              <div>{now.toLocaleString('fr-FR')}</div>
              <div className="pay-receipt-mode">
                {lastRecordKind === 'refund' ? 'Remboursement : ' : 'Règlement : '}
                <strong>{paymentLabel(lastPayment, lastRecordKind)}</strong>
              </div>
              {lastPayment.cashCents > 0 && (
                <div>Espèces : {formatMoney(lastPayment.cashCents)}</div>
              )}
              {lastPayment.cardCents > 0 && (
                <div>Carte : {formatMoney(lastPayment.cardCents)}</div>
              )}
              {lastPayment.changeCents > 0 && (
                <div className="accent">Rendu : {formatMoney(lastPayment.changeCents)}</div>
              )}
              {lastLines.map((l) => (
                <div key={l.product.id}>
                  <div>
                    {l.qty}× {l.product.name} … {formatMoney(l.unitCents * l.qty)}
                  </div>
                  {(l.discountPercent > 0 || l.listUnitCents !== l.unitCents) && (
                    <div className="pay-receipt-line-note">
                      Barème {formatMoney(l.listUnitCents)} / u.
                      {l.discountPercent > 0 ? ` · remise ${l.discountPercent} %` : ''}
                      {l.discountReason.trim() ? ` — ${l.discountReason.trim()}` : ''}
                    </div>
                  )}
                </div>
              ))}
              {lastCartDiscountPct > 0 ? (
                <div className="pay-receipt-line-note">
                  Sous-total {formatMoney(lastLines.reduce((s, l) => s + l.unitCents * l.qty, 0))} · remise sur le
                  total {lastCartDiscountPct} %
                  {lastCartDiscountReason.trim() ? ` — ${lastCartDiscountReason.trim()}` : ''}
                </div>
              ) : null}
              <div className="big">Total : {formatMoney(lastTotalCents)}</div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setShowSuccess(false)}>
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
