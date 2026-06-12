import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'
import {
  type AppPersistedData,
  type ProductConfig,
  sumUpPaymentsReady,
  formatDiscountMotifReason,
  type DiscountMotifPreset,
  DEFAULT_DISCOUNT_MOTIFS
} from '@shared/catalog'
import type { RemoteCaisseMirror } from '@shared/remoteCaisseMirror'
import type {
  ClientDisplayState,
  ClientDisplayPhase,
  ClientPaymentDetail
} from '@shared/clientDisplay'
import type { SaleLineSnapshot, SalePayment, SaleRecord } from '@shared/sales'
import type { TicketUnitPayload } from '@shared/ticket'
import {
  getStockMap,
  isLowStock,
  isProductEnabledForEvent,
  listLowStockProductsAfterCart,
  stockRemainingForCart
} from '@shared/inventory'
import {
  finalUnitCents,
  lineBaseUnitCents,
  lineDiscountPct as readLineDiscountPct,
  lineDiscountReason as readLineDiscountReason
} from '@shared/cartLinePricing'
import { buildClientLineDetailLines } from '@shared/clientDisplayLineDetail'
import { useAppState } from '@renderer/state/AppStateContext'
import { useShellNav } from '@renderer/state/ShellNavContext'
import { useToast } from '@renderer/state/ToastContext'
import { repairStaleFocus } from '@renderer/utils/blurActiveElement'
import { centsToEurosInput, formatMoney, parseEurosToCents } from '@renderer/utils/money'
import {
  heldCartsStorageKey,
  readHeldCartState
} from '@renderer/utils/heldCartsStorage'
import type { StoredHeldCart } from '@shared/heldCarts'
import { MAX_HELD_CARTS } from '@shared/heldCarts'
import {
  CHOOSEABLE_SHORTCUT_TOKENS,
  eventMatchesShortcut,
  KEYBOARD_SHORTCUTS_CHANGED,
  readKeyboardShortcuts,
  SHORTCUT_IDS,
  SHORTCUT_LABELS,
  validateUniqueShortcuts,
  writeKeyboardShortcuts
} from '@renderer/utils/keyboardShortcutsStorage'
import { canAddProductToCart, cartIsCardCashExchangeSale } from '@shared/cardCashExchange'
import { formatOrderDigits } from '@shared/orderDigits'
import { formatOrderDisplay } from '@renderer/utils/order'
import PaymentModal from '@renderer/components/PaymentModal'
import EmptyState from '@renderer/components/EmptyState'
import HeldCartsModals from '@renderer/components/HeldCartsModals'

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

type HeldCartEntry = StoredHeldCart

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
  const { showToast } = useToast()
  const now = useClock()
  const discountMotifPresets = useMemo(
    () => (data.discountMotifs?.length ? data.discountMotifs : DEFAULT_DISCOUNT_MOTIFS),
    [data.discountMotifs]
  )
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
  /** Modale commentaire pour un motif « avec commentaire obligatoire ». */
  const [motifCommentPreset, setMotifCommentPreset] = useState<DiscountMotifPreset | null>(null)
  const [motifCommentDraft, setMotifCommentDraft] = useState('')
  const [motifCommentError, setMotifCommentError] = useState<string | null>(null)
  /** Modale secondaire : liste des motifs (après « Oui »). */
  const [motifPickerOpen, setMotifPickerOpen] = useState(false)
  const [variablePriceModal, setVariablePriceModal] = useState<{
    product: ProductConfig
    draftEuros: string
    mode: 'add' | 'increase'
  } | null>(null)
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
  const [heldCarts, setHeldCarts] = useState<HeldCartEntry[]>([])
  const [nextHoldTicketNum, setNextHoldTicketNum] = useState(1)
  const [heldModalView, setHeldModalView] = useState<null | 'menu' | 'list'>(null)
  const [remoteCartEditor, setRemoteCartEditor] = useState<'pc' | 'tablet' | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const productSearchInputRef = useRef<HTMLInputElement>(null)
  const shortcutsOverlayRef = useRef<HTMLDivElement>(null)
  const remiseOverlayRef = useRef<HTMLDivElement>(null)
  const motifPickerOverlayRef = useRef<HTMLDivElement>(null)
  const benevoleOverlayRef = useRef<HTMLDivElement>(null)
  const variablePriceOverlayRef = useRef<HTMLDivElement>(null)

  const [kbdShortcuts, setKbdShortcuts] = useState(() => readKeyboardShortcuts())
  const [shortcutEditDraft, setShortcutEditDraft] = useState(() => readKeyboardShortcuts())

  useEffect(() => {
    const onUp = (): void => setKbdShortcuts(readKeyboardShortcuts())
    window.addEventListener(KEYBOARD_SHORTCUTS_CHANGED, onUp)
    return () => window.removeEventListener(KEYBOARD_SHORTCUTS_CHANGED, onUp)
  }, [])

  useEffect(() => {
    if (shortcutsOpen) setShortcutEditDraft(readKeyboardShortcuts())
  }, [shortcutsOpen])

  useFocusTrap(shortcutsOverlayRef, shortcutsOpen)
  useFocusTrap(remiseOverlayRef, Boolean(remiseModal))
  useFocusTrap(motifPickerOverlayRef, motifPickerOpen && Boolean(remiseModal))
  useFocusTrap(benevoleOverlayRef, Boolean(motifCommentPreset && remiseModal))
  useFocusTrap(variablePriceOverlayRef, Boolean(variablePriceModal))

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

  const [forceCartPrompt, setForceCartPrompt] = useState(false)

  useEffect(() => {
    void window.caisse.remoteCaisseGetCartGate().then((g) => setRemoteCartEditor(g.cartEditor))
    const offEditor = window.caisse.onRemoteCartEditor((editor) => setRemoteCartEditor(editor))
    const offForced = window.caisse.onRemoteCartControlForced((p) => {
      setRemoteCartEditor(p.cartEditor)
      if (p.claimedBy === 'tablet') {
        showToast({
          variant: 'warning',
          message: 'La tablette a repris le contrôle du panier partagé — caisse PC en lecture seule.'
        })
      }
    })
    return () => {
      offEditor()
      offForced()
    }
  }, [showToast])

  const forceCartControlOnPc = useCallback(async () => {
    const r = await window.caisse.remoteCaisseForceCartControl()
    setRemoteCartEditor(r.cartEditor)
    setForceCartPrompt(false)
    showToast({ variant: 'success', message: 'Contrôle du panier repris sur ce PC.' })
  }, [showToast])

  useEffect(() => {
    return window.caisse.onRemoteCaisseEventChanged((p) => {
      const name = p.eventName?.trim() || '—'
      showToast({
        variant: 'info',
        message: `Événement changé depuis la tablette : « ${name} ».`
      })
    })
  }, [showToast])

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
      setMotifCommentPreset(null)
      setMotifCommentDraft('')
      setMotifCommentError(null)
      setMotifPickerOpen(false)
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
    void window.caisse.remoteCaissePublishState(remoteMirrorPayload).then((r) => {
      if (!r.ok) {
        showToast({ variant: 'error', message: r.error })
        applyingRemoteCart.current = true
        void window.caisse.remoteCaisseGetMirror().then((m) => {
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
      }
    })
  }, [remoteMirrorPayload, showToast])

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

  const heldStorageKey = useMemo(
    () => heldCartsStorageKey(data.association, data.selectedEventId),
    [
      data.association.licenseAssociationCode,
      data.association.numero,
      data.association.name,
      data.selectedEventId
    ]
  )

  const refreshHeldFromServer = useCallback(async () => {
    const r = await window.caisse.heldCartsGet()
    if (r.ok) {
      setHeldCarts(r.entries)
      setNextHoldTicketNum(r.nextHoldTicketNum)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await window.caisse.heldCartsGet()
      if (cancelled || !r.ok) return
      if (r.entries.length === 0) {
        const legacy = readHeldCartState(heldStorageKey)
        if (legacy.entries.length > 0) {
          const mig = await window.caisse.heldCartsSet(legacy)
          if (cancelled) return
          if (mig.ok) {
            setHeldCarts(mig.entries)
            setNextHoldTicketNum(mig.nextHoldTicketNum)
            try {
              localStorage.removeItem(heldStorageKey)
            } catch {
              /* quota ou navigation privée */
            }
            return
          }
        }
      }
      setHeldCarts(r.entries)
      setNextHoldTicketNum(r.nextHoldTicketNum)
    })()
    return () => {
      cancelled = true
    }
  }, [heldStorageKey])

  useEffect(() => {
    return window.caisse.onHeldCartsUpdated(() => {
      void refreshHeldFromServer()
    })
  }, [refreshHeldFromServer])

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
    let base = category === 'all' ? products : products.filter((p) => p.category === category)
    base = base.filter((p) => isProductEnabledForEvent(data, data.selectedEventId, p.id))
    const q = productSearch.trim().toLowerCase()
    if (!q) return base
    return base.filter((p) => p.name.toLowerCase().includes(q))
  }, [category, products, productSearch, refundMode, data])

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

  const cartIsCardCashExchange = useMemo(
    () => cartIsCardCashExchangeSale(lines),
    [lines]
  )

  useEffect(() => {
    void window.caisse.associationSyncSetCartGate({
      hasCartLines: lines.length > 0,
      paymentOpen: showPayment
    })
  }, [lines.length, showPayment])

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
        showToast({
          variant: 'error',
          message:
            missing > 0
              ? 'Aucun article de cette vente ne correspond au catalogue actuel. Vérifiez les articles.'
              : 'Vente vide.'
        })
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
        showToast({
          variant: 'error',
          message: `${missing} ligne(s) ignorée(s) : article absent du catalogue ou identifiant modifié. Les autres lignes sont chargées.`
        })
      }
    },
    [products, setData, showToast]
  )

  useEffect(() => {
    if (!pendingRefundSale) return
    if (pendingRefundSale.kind === 'refund') {
      acknowledgePendingRefund()
      showToast({
        message: 'Choisissez une vente (et non un remboursement déjà enregistré).'
      })
      return
    }
    const s = pendingRefundSale
    acknowledgePendingRefund()
    applyRefundFromSale(s)
  }, [pendingRefundSale, acknowledgePendingRefund, applyRefundFromSale, showToast])

  const toggleRefundMode = useCallback(() => {
    if (!refundMode) {
      const hasItems = Object.values(quantities).some((q) => (q ?? 0) > 0)
      if (hasItems) {
        setRefundMode(true)
        setRefundMaxByProduct(null)
        setRefundSourceMeta(null)
        setRemiseModal(null)
        setMotifCommentPreset(null)
        setMotifCommentDraft('')
        setMotifCommentError(null)
        setMotifPickerOpen(false)
        return
      }
    }
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
    setMotifCommentPreset(null)
    setMotifCommentDraft('')
    setMotifCommentError(null)
    setMotifPickerOpen(false)
  }, [refundMode, quantities])

  const add = useCallback(
    (p: ProductConfig) => {
      if (remoteCartEditor === 'tablet') {
        showToast({
          variant: 'error',
          message: 'La tablette édite le panier partagé — modification impossible sur le PC.'
        })
        return
      }
      if (!canSell) return
      if (!refundMode && !isProductEnabledForEvent(data, data.selectedEventId, p.id)) {
        showToast({ variant: 'warning', message: `« ${p.name} » n’est pas disponible sur cet événement.` })
        return
      }
      const gate = canAddProductToCart(products, quantities, p)
      if (!gate.ok) {
        showToast({ variant: 'warning', message: gate.message })
        return
      }
      const max = stockAvailable(p, stock)
      const cur = quantities[p.id] ?? 0
      const cap = refundMaxByProduct?.[p.id]
      if (refundMode && cap != null && cur + 1 > cap) return
      if (!refundMode && p.trackStock && cur + 1 > max) return
      setQuantities((prev) => ({ ...prev, [p.id]: cur + 1 }))
    },
    [canSell, data, quantities, stock, refundMode, refundMaxByProduct, remoteCartEditor, showToast, products]
  )

  const promptAddProduct = useCallback(
    (p: ProductConfig) => {
      if (remoteCartEditor === 'tablet') {
        showToast({
          variant: 'error',
          message: 'La tablette édite le panier partagé — modification impossible sur le PC.'
        })
        return
      }
      if (!canSell) return
      if (!refundMode && !isProductEnabledForEvent(data, data.selectedEventId, p.id)) {
        showToast({ variant: 'warning', message: `« ${p.name} » n’est pas disponible sur cet événement.` })
        return
      }
      const max = stockAvailable(p, stock)
      const cur = quantities[p.id] ?? 0
      const cap = refundMaxByProduct?.[p.id]
      if (refundMode && cap != null && cur + 1 > cap) return
      if (!refundMode && p.trackStock && cur + 1 > max) return
      const gate = canAddProductToCart(products, quantities, p)
      if (!gate.ok) {
        showToast({ variant: 'warning', message: gate.message })
        return
      }
      if (p.variablePrice) {
        const prevCents = priceOverrides[p.id] ?? p.priceCents
        setVariablePriceModal({
          product: p,
          draftEuros: prevCents > 0 ? centsToEurosInput(prevCents) : '',
          mode: 'add'
        })
        return
      }
      add(p)
    },
    [add, canSell, products, quantities, priceOverrides, showToast, stock, refundMode, refundMaxByProduct, remoteCartEditor]
  )

  const setQty = useCallback(
    (id: string, qty: number) => {
      if (remoteCartEditor === 'tablet') {
        showToast({
          variant: 'error',
          message: 'La tablette édite le panier partagé — modification impossible sur le PC.'
        })
        return
      }
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
    [canSell, products, stock, refundMode, refundMaxByProduct, remoteCartEditor, showToast]
  )

  const confirmVariablePrice = useCallback(() => {
    if (!variablePriceModal) return
    const c = parseEurosToCents(variablePriceModal.draftEuros.replace(/\s/g, ''))
    if (c === null) {
      showToast({ variant: 'error', message: 'Saisissez un prix unitaire valide (€).' })
      return
    }
    const p = variablePriceModal.product
    const mode = variablePriceModal.mode
    setPriceOverrides((prev) => ({ ...prev, [p.id]: c }))
    setVariablePriceModal(null)
    if (mode === 'increase') {
      setQty(p.id, (quantities[p.id] ?? 0) + 1)
    } else {
      add(p)
    }
  }, [add, quantities, setQty, showToast, variablePriceModal])

  const increaseLineQty = useCallback(
    (id: string, curQty: number) => {
      const product = products.find((p) => p.id === id)
      if (!product) return
      if (product.variablePrice) {
        const prevCents = priceOverrides[id] ?? product.priceCents
        setVariablePriceModal({
          product,
          draftEuros: prevCents > 0 ? centsToEurosInput(prevCents) : '',
          mode: 'increase'
        })
        return
      }
      setQty(id, curQty + 1)
    },
    [priceOverrides, products, setQty, showToast]
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
    setVariablePriceModal(null)
  }, [])

  const applyMirrorToCart = useCallback((m: RemoteCaisseMirror) => {
    setQuantities({ ...m.quantities })
    setRefundMode(m.refundMode)
    setRefundMaxByProduct(m.refundMaxByProduct ? { ...m.refundMaxByProduct } : null)
    setRefundSourceMeta(m.refundSourceMeta ? { ...m.refundSourceMeta } : null)
    setPriceOverrides({ ...m.priceOverrides })
    setDiscountPctByProduct({ ...(m.lineDiscountPct ?? {}) })
    setDiscountReasonByProduct({ ...(m.lineDiscountReason ?? {}) })
    const cp =
      typeof m.cartDiscountPct === 'number' && Number.isFinite(m.cartDiscountPct)
        ? Math.min(100, Math.max(0, Math.round(m.cartDiscountPct)))
        : 0
    setCartDiscountPct(cp)
    setCartDiscountReason(
      typeof m.cartDiscountReason === 'string' ? m.cartDiscountReason.trim().slice(0, 200) : ''
    )
    setRemiseModal(null)
    setMotifCommentPreset(null)
    setMotifCommentDraft('')
    setMotifCommentError(null)
    setMotifPickerOpen(false)
  }, [])

  const saveShortcutDraft = useCallback(() => {
    const err = validateUniqueShortcuts(shortcutEditDraft)
    if (err) {
      showToast({ variant: 'error', message: err })
      return
    }
    writeKeyboardShortcuts(shortcutEditDraft)
    setKbdShortcuts(readKeyboardShortcuts())
    showToast({ variant: 'success', message: 'Raccourcis enregistrés pour cet appareil.' })
  }, [shortcutEditDraft, showToast])

  const putCartOnHold = useCallback(async () => {
    if (refundMode) {
      showToast({
        variant: 'error',
        message:
          'Impossible en mode remboursement. Terminez ou quittez le remboursement avant de mettre un panier en attente.'
      })
      return
    }
    if (lines.length === 0) {
      showToast({ message: 'Panier vide.' })
      return
    }
    if (heldCarts.length >= MAX_HELD_CARTS) {
      showToast({
        variant: 'error',
        message: `Maximum ${MAX_HELD_CARTS} paniers en attente. Reprenez ou supprimez-en un.`
      })
      return
    }
    const ticketLabel = `Ticket ${formatOrderDigits(nextHoldTicketNum)}`
    const place = await window.caisse.heldCartsPlace({
      displayName: ticketLabel,
      totalCents,
      lineCount: lines.length,
      mirror: structuredClone(remoteMirrorPayload)
    })
    if (!place.ok) {
      showToast({
        variant: 'error',
        message: place.error ?? 'Impossible de mettre le panier en attente.'
      })
      return
    }
    setHeldCarts(place.state.entries)
    setNextHoldTicketNum(place.state.nextHoldTicketNum)
    clearCart()
    setRefundMode(false)
    showToast({
      variant: 'success',
      message: `${place.entry.displayName} : ticket d’attente imprimé, panier mis de côté.`
    })
  }, [
    refundMode,
    lines.length,
    heldCarts.length,
    nextHoldTicketNum,
    remoteMirrorPayload,
    totalCents,
    clearCart,
    showToast
  ])

  const restoreHeldCart = useCallback(
    async (entryId: string) => {
      const entry = heldCarts.find((h) => h.id === entryId)
      if (!entry) return
      const hasActive = Object.values(quantities).some((q) => (q ?? 0) > 0)
      if (hasActive) {
        showToast({
          variant: 'error',
          message:
            'Le panier actuel n’est pas vide : videz-le ou mettez-le en attente avant de reprendre un autre panier.'
        })
        return
      }
      if (refundMode) {
        showToast({
          variant: 'error',
          message: 'Quittez le mode remboursement avant de reprendre un panier en attente.'
        })
        return
      }
      const r = await window.caisse.heldCartsRemove(entryId)
      if (!r.ok) {
        showToast({ variant: 'error', message: r.error ?? 'Impossible de reprendre ce panier.' })
        return
      }
      applyMirrorToCart(structuredClone(entry.mirror))
      setHeldCarts(r.entries)
      setNextHoldTicketNum(r.nextHoldTicketNum)
      setHeldModalView(null)
      showToast({ message: 'Panier repris.' })
    },
    [heldCarts, quantities, refundMode, applyMirrorToCart, showToast]
  )

  const discardHeldCart = useCallback(
    async (entryId: string) => {
      const r = await window.caisse.heldCartsRemove(entryId)
      if (!r.ok) {
        showToast({ variant: 'error', message: r.error ?? 'Suppression impossible.' })
        return
      }
      setHeldCarts(r.entries)
      setNextHoldTicketNum(r.nextHoldTicketNum)
      showToast({ message: 'Panier en attente supprimé (non encaissé).' })
    },
    [showToast]
  )

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

  const applyDiscountMotifPreset = useCallback((preset: DiscountMotifPreset) => {
    setMotifPickerOpen(false)
    if (preset.commentRequired) {
      setMotifCommentPreset(preset)
      setMotifCommentDraft('')
      setMotifCommentError(null)
    } else {
      const label = preset.label.trim().slice(0, 200)
      setRemiseModal((m) => (m ? { ...m, draftReason: label } : m))
    }
  }, [])

  const confirmMotifComment = useCallback(() => {
    if (!motifCommentPreset) return
    const t = motifCommentDraft.trim()
    if (!t) {
      setMotifCommentError('Ce champ est obligatoire.')
      return
    }
    const text = formatDiscountMotifReason(motifCommentPreset.label, t)
    setRemiseModal((m) => (m ? { ...m, draftReason: text } : m))
    setMotifCommentPreset(null)
    setMotifCommentDraft('')
    setMotifCommentError(null)
  }, [motifCommentPreset, motifCommentDraft])

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
      const isExchange = cartIsCardCashExchangeSale(snapLines)

      if (isExchange) {
        if (
          payment.mode !== 'card' ||
          payment.cashCents !== 0 ||
          payment.cardCents !== total ||
          payment.changeCents !== 0
        ) {
          showToast({
            variant: 'error',
            message: 'Échange carte / espèces : paiement intégral par carte uniquement.'
          })
          return
        }
      }

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

      const eid = data.selectedEventId
      let nextPersisted: AppPersistedData = { ...data, orderCounter: orderNumber }
      if (eid) {
        const map = { ...(data.stockByEvent[eid] ?? {}) }
        for (const { product: p, qty } of snapLines) {
          if (!p.trackStock) continue
          const cur = map[p.id] ?? 0
          map[p.id] = isRefund ? cur + qty : Math.max(0, cur - qty)
        }
        nextPersisted = {
          ...nextPersisted,
          stockByEvent: { ...data.stockByEvent, [eid]: map }
        }
      }
      setData(() => nextPersisted)

      const assocName = data.association.name.trim() || 'Association'
      const sale: SaleRecord = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        orderNumber,
        eventId: selectedEvent.id,
        eventName: selectedEvent.name,
        eventDate: selectedEvent.date,
        eventNotes: selectedEvent.notes,
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
        ...(isExchange ? { cardCashExchange: true as const } : {}),
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

      void (async () => {
        try {
          await window.caisse.setDataImmediate(nextPersisted)
          await window.caisse.appendSale(sale)
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
            const printR = await window.caisse.printTickets({
              tickets,
              deviceName: data.printing.deviceName,
              logoDataUrl: logo,
              silent: data.printing.silentPrint
            })
            if (!printR.ok) {
              showToast({
                variant: 'error',
                message: `Vente enregistrée, mais l’impression a échoué : ${printR.error ?? 'erreur inconnue'}`
              })
            }
          }
          setShowSuccess(true)
        } catch (e) {
          showToast({
            variant: 'error',
            message:
              e instanceof Error
                ? `Erreur lors de l’enregistrement de la vente : ${e.message}`
                : 'Erreur lors de l’enregistrement de la vente.'
          })
        }
      })()
    },
    [
      data,
      selectedEvent,
      lines,
      setData,
      showToast,
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (shortcutsOpen) return
      const ks = readKeyboardShortcuts()
      if (eventMatchesShortcut(e, ks.help)) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (eventMatchesShortcut(e, ks.holdCart)) {
        e.preventDefault()
        setHeldModalView('menu')
        return
      }
      if (eventMatchesShortcut(e, ks.clearCart)) {
        e.preventDefault()
        clearCart()
        return
      }
      if (eventMatchesShortcut(e, ks.toggleRefund)) {
        e.preventDefault()
        toggleRefundMode()
        return
      }
      if (eventMatchesShortcut(e, ks.payCash)) {
        e.preventDefault()
        openPaymentCash()
        return
      }
      if (eventMatchesShortcut(e, ks.payCard)) {
        e.preventDefault()
        openPaymentCard()
        return
      }
      const el = e.target as HTMLElement | null
      if (!el) return
      const inField =
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      if (inField) return
      if (eventMatchesShortcut(e, ks.focusSearch)) {
        e.preventDefault()
        productSearchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [putCartOnHold, shortcutsOpen, clearCart, toggleRefundMode, openPaymentCash, openPaymentCard])

  const cartLockedByTablet = remoteCartEditor === 'tablet'
  const lowStockProducts = useMemo(() => {
    const visible = products.filter((p) => isProductEnabledForEvent(data, data.selectedEventId, p.id))
    return listLowStockProductsAfterCart(visible, stock, quantities, refundMode)
  }, [products, stock, quantities, refundMode, data])

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
          {cartLockedByTablet && (
            <div className="banner-warn banner-cart-lock" role="status">
              <p className="banner-cart-lock__text">
                <strong>Tablette active</strong> — le panier partagé est modifié sur la tablette. Cette caisse
                est en lecture seule.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-compact banner-cart-lock__btn"
                onClick={() => setForceCartPrompt(true)}
              >
                Reprendre sur le PC
              </button>
            </div>
          )}
          {lowStockProducts.length > 0 && canSell && !eventClosed && (
            <div className="banner-warn banner-stock-low" role="status">
              <strong>Stock bas :</strong>{' '}
              {lowStockProducts
                .slice(0, 6)
                .map((p) => `${p.emoji} ${p.name}`)
                .join(' · ')}
              {lowStockProducts.length > 6 ? ` (+${lowStockProducts.length - 6})` : ''}
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
          <div className="caisse-toolbar caisse-toolbar--tiered">
            <div className="toolbar-cluster toolbar-cluster--primary">
            <div className="caisse-toolbar-search-wrap">
              <label className="caisse-toolbar-label" htmlFor="caisse-product-search-input">
                Recherche articles
              </label>
              <input
                id="caisse-product-search-input"
                ref={productSearchInputRef}
                type="search"
                className="caisse-product-search"
                placeholder={`Tapez un nom d’article… (${kbdShortcuts.focusSearch} pour focus)`}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                aria-label="Filtrer les articles par nom"
              />
            </div>
            </div>
            <div className="toolbar-cluster toolbar-cluster--secondary">
            <div className="caisse-toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary caisse-toolbar-shortcuts-btn"
                onClick={() => setShortcutsOpen(true)}
              >
                Raccourcis ({kbdShortcuts.help})
              </button>
            </div>
            </div>
          </div>
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
                const inCart = quantities[p.id] ?? 0
                const remaining = stockRemainingForCart(p, stock, inCart, refundMode)
                const disabled =
                  cartLockedByTablet ||
                  !canSell ||
                  (!refundMode && p.trackStock && remaining <= 0)
                const low = isLowStock(p, remaining)
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`product-card${disabled ? ' disabled' : ''}${low ? ' stock-low' : ''}`}
                    disabled={disabled}
                    onClick={() => promptAddProduct(p)}
                    title={
                      disabled
                        ? refundMode
                          ? 'Indisponible'
                          : 'Rupture de stock'
                        : p.trackStock
                          ? `${p.name} — stock : ${remaining}`
                          : p.name
                    }
                  >
                    <span
                      className={`stock-badge${p.trackStock ? '' : ' stock-badge-muted'}${low ? ' stock-badge-low' : ''}`}
                      aria-hidden
                    >
                      {p.trackStock ? remaining : '—'}
                    </span>
                    {productImg[p.id] ? (
                      <div className="product-card-visual">
                        <img src={productImg[p.id]} alt="" className="product-card-img" />
                      </div>
                    ) : (
                      <div className="emoji">{p.emoji}</div>
                    )}
                    <div className="name">{p.name}</div>
                    <div className={`price${p.variablePrice ? ' price-variable' : ''}`}>
                      {p.variablePrice ? 'Prix variable' : formatMoney(p.priceCents)}
                    </div>
                    {p.trackStock && (
                      <div className="stock-hint" aria-hidden>
                        Stock {remaining}
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
              <div className="cart-head-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-held-menu"
                  disabled={!canSell || refundMode || cartLockedByTablet}
                  title={`Attente : récupérer ou mettre de côté le panier (${kbdShortcuts.holdCart})`}
                  onClick={() => setHeldModalView('menu')}
                >
                  Attente
                  {heldCarts.length > 0 ? (
                    <span className="held-recup-badge" aria-label={`${heldCarts.length} en attente`}>
                      {heldCarts.length}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-cart-clear"
                  disabled={lines.length === 0 || cartLockedByTablet}
                  onClick={clearCart}
                >
                  Vider le panier
                </button>
              </div>
            </div>
            <div className="cart-options-strip" role="group" aria-label="Options de caisse">
              <button
                type="button"
                role="switch"
                aria-checked={refundMode}
                aria-label="Mode remboursement"
                disabled={eventClosed}
                className={`cart-option-card cart-option-refund${refundMode ? ' is-on' : ''}${
                  eventClosed ? ' is-disabled' : ''
                }`}
                onClick={() => toggleRefundMode()}
              >
                <span className="cart-option-card__icon" aria-hidden>
                  ↩
                </span>
                <span className="cart-option-card__body">
                  <span className="cart-option-card__title">Rembours.</span>
                  <span className="cart-option-card__hint">
                    Retour ou annulation (même flux que la vente)
                  </span>
                </span>
                <span className="cart-switch" aria-hidden>
                  <span className="cart-switch__track" />
                  <span className="cart-switch__thumb" />
                </span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={remoteDisplayOn}
                aria-label="Affichage client sur un second écran ou navigateur"
                className={`cart-option-card cart-option-display${remoteDisplayOn ? ' is-on' : ''}`}
                onClick={() => void setRemoteClientEnabled(!remoteDisplayOn)}
              >
                <span className="cart-option-card__icon" aria-hidden>
                  🖥
                </span>
                <span className="cart-option-card__body">
                  <span className="cart-option-card__title">Écran client</span>
                  <span className="cart-option-card__hint">
                    Panier visible sur navigateur ou 2ᵉ écran (menu Écran client pour l’URL)
                  </span>
                </span>
                <span className="cart-switch" aria-hidden>
                  <span className="cart-switch__track" />
                  <span className="cart-switch__thumb" />
                </span>
              </button>
            </div>
            <div className="cart-meta-row" role="status" aria-live="polite">
              {refundMode && refundSourceMeta?.orderNumber != null && refundSourceMeta.orderNumber > 0 ? (
                <span className="refund-source-pill" title="Remboursement lié à une vente passée">
                  {formatOrderDisplay(refundSourceMeta.orderNumber)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="cart-lines">
            {lines.length === 0 ? (
              <div className="empty-cart">
                <EmptyState
                  icon={refundMode ? '↩' : '🛒'}
                  title={refundMode ? 'Aucune ligne de remboursement' : 'Panier vide'}
                  description={
                    refundMode
                      ? 'Ajoutez les articles depuis la grille ; les quantités sont plafonnées par la vente d’origine.'
                      : 'Ajoutez des articles depuis la grille à gauche, ou utilisez la recherche pour aller plus vite.'
                  }
                  actions={
                    !refundMode ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          productSearchInputRef.current?.focus()
                        }}
                      >
                        Aller à la recherche
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              lines.map(
                ({ product: p, qty, unitCents, listUnitCents, discountPercent, discountReason }) => {
                  const maxRef = refundMaxByProduct?.[p.id]
                  const atCap = refundMode && maxRef != null && qty >= maxRef
                  return (
                    <div
                      key={p.id}
                      className={`line cart-line${refundMode ? ' cart-line--refund' : ''}`}
                    >
                      <div className="line-head">
                        <div className="cart-line-product">
                          <span className="cart-line-emoji" aria-hidden>
                            {p.emoji}
                          </span>
                          <span className="name" title={`${p.emoji} ${p.name}`}>
                            {p.name}
                          </span>
                        </div>
                        <div className="line-controls line-controls--compact">
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
                            onClick={() => increaseLineQty(p.id, qty)}
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
                      </div>
                      {!refundMode && !p.cardCashExchange ? (
                        <div className="line-inline-tools">
                          <label className="line-pu-field">
                            <span className="line-pu-field__lbl">PU TTC €</span>
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
                          <button
                            type="button"
                            className={
                              'btn-remise-cart btn-remise-cart--line' +
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
                            <span className="btn-remise-cart__label">Remise ligne</span>
                            {discountPercent > 0 ? (
                              <span className="btn-remise-cart__badge">{discountPercent} %</span>
                            ) : null}
                          </button>
                          {priceOverrides[p.id] != null ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-compact btn-catalog"
                              disabled={!canSell}
                              title="Rétablir le prix de base de l’article (sans surcote manuelle)"
                              onClick={() =>
                                setPriceOverrides((prev) => {
                                  const n = { ...prev }
                                  delete n[p.id]
                                  return n
                                })
                              }
                            >
                              Prix de base article
                            </button>
                          ) : null}
                        </div>
                      ) : discountPercent > 0 || listUnitCents !== unitCents ? (
                        <div className="line-readonly-muted line-readonly-muted--compact">
                          Barème {formatMoney(listUnitCents)} / u.
                          {discountPercent > 0 ? ` · remise ${discountPercent} %` : ''}
                          {discountReason.trim() ? ` — ${discountReason.trim()}` : ''}
                        </div>
                      ) : null}
                      <div className="line-foot">
                        <span className="line-foot-unit">
                          {formatMoney(unitCents)} / u. × {qty}
                        </span>
                        <span className="line-foot-total">{formatMoney(unitCents * qty)}</span>
                      </div>
                    </div>
                  )
                }
              )
            )}
          </div>
          <div className="cart-footer">
            {lines.length > 0 && !cartIsCardCashExchange ? (
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
                    'btn-remise-cart btn-remise-cart--total' +
                    (cartDiscountPct > 0 ? ' btn-remise-cart--active' : '')
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
                    ∑
                  </span>
                  <span className="btn-remise-cart__label">Remise sur total panier</span>
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
            {cartIsCardCashExchange ? (
              <p className="sub cart-exchange-hint" role="status">
                Échange carte / espèces : paiement par carte uniquement (sortie d’espèces du tiroir). Quantité libre sur cet article.
              </p>
            ) : null}
            <div className={`actions${refundMode || cartIsCardCashExchange ? ' actions-single' : ' cart-pay-actions'}`}>
              {refundMode ? (
                <button
                  type="button"
                  className="btn btn-primary btn-refund"
                  disabled={lines.length === 0 || !data.selectedEventId || !canSell || cartLockedByTablet}
                  onClick={cartIsCardCashExchange ? openPaymentCard : openPaymentChoose}
                >
                  Rembourser
                </button>
              ) : cartIsCardCashExchange ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={lines.length === 0 || !data.selectedEventId || !canSell || cartLockedByTablet}
                  onClick={openPaymentCard}
                >
                  Payer par carte
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={lines.length === 0 || !data.selectedEventId || !canSell || cartLockedByTablet}
                    onClick={openPaymentCash}
                  >
                    Espèces
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={lines.length === 0 || !data.selectedEventId || !canSell || cartLockedByTablet}
                    onClick={openPaymentCard}
                  >
                    Carte
                  </button>
                </>
              )}
            </div>
            <div className="cart-lines-count" aria-live="polite">
              {lines.length ? `${lines.length} ligne${lines.length > 1 ? 's' : ''}` : 'Panier vide'}
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

      {variablePriceModal ? (
        <div
          ref={variablePriceOverlayRef}
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="variable-price-title"
          onClick={() => {
            setVariablePriceModal(null)
            repairStaleFocus()
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="variable-price-title">Prix unitaire</h3>
            <p className="sub">
              {variablePriceModal.product.emoji} {variablePriceModal.product.name} — saisissez le
              montant TTC pour{' '}
              {variablePriceModal.mode === 'increase' ? 'cette unité supplémentaire' : 'cet article'}.
            </p>
            <label className="field">
              <span>Prix unitaire (€)</span>
              <input
                type="text"
                inputMode="decimal"
                className="mono"
                autoFocus
                placeholder="ex. 5,00"
                value={variablePriceModal.draftEuros}
                onChange={(e) =>
                  setVariablePriceModal((m) => (m ? { ...m, draftEuros: e.target.value } : m))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmVariablePrice()
                  }
                }}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setVariablePriceModal(null)
                  repairStaleFocus()
                }}
              >
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmVariablePrice}>
                Valider
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {remiseModal ? (
        <div
          ref={remiseOverlayRef}
          className="overlay remise-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remise-title"
          onClick={() => {
            setMotifCommentPreset(null)
            setMotifCommentDraft('')
            setMotifCommentError(null)
            setMotifPickerOpen(false)
            setRemiseModal(null)
            repairStaleFocus()
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
                      showToast({ variant: 'error', message: 'Pourcentage invalide (0 à 100).' })
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
                      <div className="remise-motif-ask">
                        <p className="sub">Souhaitez-vous utiliser un motif enregistré ?</p>
                        <div className="remise-motif-ask-row">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setMotifPickerOpen(false)}
                          >
                            Non
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!canSell}
                            onClick={() => setMotifPickerOpen(true)}
                          >
                            Oui, choisir
                          </button>
                        </div>
                      </div>
                      <div className="modal-actions remise-modal-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setMotifCommentPreset(null)
                            setMotifCommentDraft('')
                            setMotifCommentError(null)
                            setMotifPickerOpen(false)
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
                      showToast({ variant: 'error', message: 'Pourcentage invalide (0 à 100).' })
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
                      <div className="remise-motif-ask">
                        <p className="sub">Souhaitez-vous utiliser un motif enregistré ?</p>
                        <div className="remise-motif-ask-row">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setMotifPickerOpen(false)}
                          >
                            Non
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={!canSell}
                            onClick={() => setMotifPickerOpen(true)}
                          >
                            Oui, choisir
                          </button>
                        </div>
                      </div>
                      <div className="modal-actions remise-modal-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setMotifCommentPreset(null)
                            setMotifCommentDraft('')
                            setMotifCommentError(null)
                            setMotifPickerOpen(false)
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

      {motifPickerOpen && remiseModal ? (
        <div
          ref={motifPickerOverlayRef}
          className="overlay motif-picker-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="motif-picker-title"
          onClick={() => setMotifPickerOpen(false)}
        >
          <div className="modal discount-motif-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="motif-picker-title">Motifs enregistrés</h3>
            <p className="sub">Sélectionnez un motif à insérer dans le champ « Motif (facultatif) ».</p>
            <div className="discount-motif-strip">
              {discountMotifPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="btn-benevole"
                  disabled={!canSell}
                  onClick={() => applyDiscountMotifPreset(preset)}
                >
                  <span className="btn-benevole__emoji" aria-hidden>
                    🏷️
                  </span>
                  <span className="btn-benevole__text">{preset.label}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setMotifPickerOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {motifCommentPreset && remiseModal ? (
        <div
          ref={benevoleOverlayRef}
          className="overlay benevole-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="motif-comment-modal-title"
          onClick={() => {
            setMotifCommentPreset(null)
            setMotifCommentDraft('')
            setMotifCommentError(null)
          }}
        >
          <div className="modal benevole-prenom-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="motif-comment-modal-title">{motifCommentPreset.label}</h3>
            <p className="sub">
              Saisissez le détail du motif : il sera enregistré sous la forme{' '}
              <strong>&quot;{motifCommentPreset.label} — …&quot;</strong>.
            </p>
            <label className="field">
              <span>{motifCommentPreset.commentLabel}</span>
              <input
                type="text"
                autoFocus
                maxLength={120}
                className="mono"
                value={motifCommentDraft}
                onChange={(e) => {
                  setMotifCommentDraft(e.target.value)
                  setMotifCommentError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmMotifComment()
                  }
                }}
              />
            </label>
            {motifCommentError ? (
              <p className="auth-err" role="alert">
                {motifCommentError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setMotifCommentPreset(null)
                  setMotifCommentDraft('')
                  setMotifCommentError(null)
                }}
              >
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmMotifComment}>
                Valider
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {forceCartPrompt ? (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="force-cart-title"
          onClick={() => setForceCartPrompt(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="force-cart-title">Reprendre le panier</h3>
            <p className="sub">
              La tablette passera en lecture seule. Le contenu actuel du panier est conservé sur les deux
              terminaux.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForceCartPrompt(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void forceCartControlOnPc()}
              >
                Reprendre sur le PC
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {heldModalView ? (
        <HeldCartsModals
          view={heldModalView}
          heldCarts={heldCarts}
          linesCount={lines.length}
          canSell={canSell}
          onClose={() => setHeldModalView(null)}
          onViewChange={setHeldModalView}
          onPutOnHold={() => void putCartOnHold()}
          onRestore={(id) => void restoreHeldCart(id)}
          onDiscard={(id) => void discardHeldCart(id)}
        />
      ) : null}

      <PaymentModal
        open={showPayment}
        totalCents={totalCents}
        onClose={() => {
          setShowPayment(false)
          repairStaleFocus()
        }}
        onPaid={finalizeSale}
        sumupConfigured={sumupConfigured}
        sumupTerminalAuto={sumupTerminalAuto}
        refundMode={refundMode}
        initialStep={paymentModalInitial}
        cardOnly={cartIsCardCashExchange}
        onPaymentDisplayUpdate={onPaymentDisplayUpdate}
        cashPaymentUi={data.cashPaymentUi === 'express' ? 'express' : 'detail'}
      />

      {showSuccess && lastPayment && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={() => {
            setShowSuccess(false)
            repairStaleFocus()
          }}
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
              <div className="order-banner mono">{formatOrderDisplay(lastOrderNumber)}</div>
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowSuccess(false)
                  repairStaleFocus()
                }}
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}
      {shortcutsOpen ? (
        <div
          ref={shortcutsOverlayRef}
          className="overlay shortcuts-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="caisse-shortcuts-title"
          onClick={() => {
            setShortcutsOpen(false)
            repairStaleFocus()
          }}
        >
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3 id="caisse-shortcuts-title">Raccourcis clavier</h3>
            <p className="sub">
              Touches autorisées : <strong>F1–F12</strong> ou la barre oblique <strong>/</strong>. Chaque touche
              doit être <strong>unique</strong>. Le retour encaissement est aussi actif depuis les autres vues.
            </p>
            <table className="shortcuts-table">
              <thead>
                <tr>
                  <th scope="col">Touche</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {SHORTCUT_IDS.map((id) => (
                  <tr key={id}>
                    <td>
                      <label htmlFor={`caisse-sc-${id}`} className="sr-only">
                        {SHORTCUT_LABELS[id]}
                      </label>
                      <select
                        id={`caisse-sc-${id}`}
                        className="input-inline mono"
                        value={shortcutEditDraft[id]}
                        onChange={(e) =>
                          setShortcutEditDraft((d) => ({ ...d, [id]: e.target.value }))
                        }
                      >
                        {CHOOSEABLE_SHORTCUT_TOKENS.map((t) => (
                          <option key={t} value={t}>
                            {t === '/' ? '/ (barre oblique)' : t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <strong>{SHORTCUT_LABELS[id]}</strong>
                      {id === 'gotoCaisse' ? (
                        <span className="sub block">
                          Raccourci global : fonctionne depuis toutes les vues de l’application.
                        </span>
                      ) : null}
                      {id === 'holdCart' ? (
                        <span className="sub block">
                          Ouvre le menu Attente (récupérer une vente ou mettre le panier de côté).
                        </span>
                      ) : null}
                      {id === 'focusSearch' ? (
                        <span className="sub block">
                          Hors champs de saisie (champ texte, zone de texte, liste déroulante).
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void saveShortcutDraft()}>
                Enregistrer
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setShortcutsOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
