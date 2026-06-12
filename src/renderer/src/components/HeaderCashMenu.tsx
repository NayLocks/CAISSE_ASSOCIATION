import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProductConfig } from '@shared/catalog'
import type { SaleRecord } from '@shared/sales'
import { formatMoney } from '@renderer/utils/money'
import {
  aggregateProductsForEvent,
  theoreticalCashInDrawerCents,
  totalCardCashExchangeCardCents,
  totalCardCashExchangeCashOutCents,
  totalCardCentsForEvent,
  totalCashSalesHorsFondCents,
  totalRevenueCentsForEvent
} from '@shared/eventSalesStats'

type Props = {
  orderCounter: number
  selectedEventId: string | null
  eventName: string | null
  floatCents: number | null
  products: ProductConfig[]
  sessionStarted: boolean
}

function soldPriceLabel(min: number, max: number): string {
  if (min === max) return formatMoney(min)
  return `${formatMoney(min)} – ${formatMoney(max)}`
}

export default function HeaderCashMenu({
  orderCounter,
  selectedEventId,
  eventName,
  floatCents,
  products,
  sessionStarted
}: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [sales, setSales] = useState<SaleRecord[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  const reload = useCallback(() => {
    void window.caisse.listSales().then(setSales).catch(() => setSales([]))
  }, [])

  useEffect(() => {
    reload()
  }, [reload, orderCounter])

  useEffect(() => {
    const onRefresh = (): void => {
      reload()
    }
    window.addEventListener('caisse-sales-refresh', onRefresh)
    return () => window.removeEventListener('caisse-sales-refresh', onRefresh)
  }, [reload])

  useEffect(() => {
    const t = setInterval(reload, 15000)
    return () => clearInterval(t)
  }, [reload])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onDoc = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDoc)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const eventSales = useMemo(
    () => (selectedEventId ? sales.filter((s) => s.eventId === selectedEventId) : []),
    [sales, selectedEventId]
  )

  const cashDrawer = useMemo(() => {
    if (floatCents == null) return null
    return theoreticalCashInDrawerCents(floatCents, eventSales)
  }, [floatCents, eventSales])

  const exchangeCashOutCents = useMemo(
    () => (selectedEventId ? totalCardCashExchangeCashOutCents(sales, selectedEventId) : 0),
    [sales, selectedEventId]
  )

  /** Ventes espèces classiques (hors fond, hors sorties liées aux échanges). */
  const ventesEspècesHorsFondCents = useMemo(() => {
    if (floatCents == null || !selectedEventId) return null
    return totalCashSalesHorsFondCents(sales, selectedEventId)
  }, [floatCents, sales, selectedEventId])

  const totalEspècesEstiméesCents = useMemo(() => {
    if (floatCents == null || ventesEspècesHorsFondCents == null) return null
    return floatCents + ventesEspècesHorsFondCents - exchangeCashOutCents
  }, [floatCents, ventesEspècesHorsFondCents, exchangeCashOutCents])

  const cardTotal = useMemo(
    () => (selectedEventId ? totalCardCentsForEvent(sales, selectedEventId) : 0),
    [sales, selectedEventId]
  )

  const exchangeCardCents = useMemo(
    () => (selectedEventId ? totalCardCashExchangeCardCents(sales, selectedEventId) : 0),
    [sales, selectedEventId]
  )
  const ventesTotalCents = useMemo(
    () => (selectedEventId ? totalRevenueCentsForEvent(sales, selectedEventId) : 0),
    [sales, selectedEventId]
  )

  const productRows = useMemo(
    () =>
      selectedEventId ? aggregateProductsForEvent(sales, selectedEventId, products) : [],
    [sales, selectedEventId, products]
  )

  const disabled = !selectedEventId || !sessionStarted || floatCents == null

  return (
    <div className="header-cash-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`header-cash-btn${disabled ? ' header-cash-btn-muted' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        title={
          disabled
            ? !selectedEventId
              ? 'Sélectionnez un événement'
              : 'Démarrez la session caisse (fond de caisse) pour voir le bilan'
            : 'Bilan espèces et ventes par article'
        }
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <div className="header-cash-btn-inner">
          <div className="header-cash-btn-col">
            <span className="header-cash-label">Caisse</span>
            <span className="header-cash-amount">
              {disabled ? '—' : cashDrawer != null ? formatMoney(cashDrawer) : '—'}
            </span>
          </div>
          <span className="header-cash-btn-sep" aria-hidden />
          <div className="header-cash-btn-col">
            <span className="header-cash-label">Ventes</span>
            <span
              className="header-cash-amount header-cash-amount-sales"
              title="Total des ventes sur l’événement (espèces + carte, après remboursements)"
            >
              {disabled ? '—' : formatMoney(ventesTotalCents)}
            </span>
          </div>
        </div>
      </button>

      {open && !disabled && (
        <div className="header-cash-popover" role="dialog" aria-label="Bilan caisse événement">
          <div className="header-cash-pop-head">
            <strong>{eventName ?? 'Événement'}</strong>
            <p className="header-cash-sub">
              Espèces théoriques en tiroir (fond + mouvements espèces, hors carte).
            </p>
          </div>
          <dl className="header-cash-dl">
            <div>
              <dt>Fond de caisse</dt>
              <dd>{formatMoney(floatCents ?? 0)}</dd>
            </div>
            <div>
              <dt>Ventes espèces (hors fond)</dt>
              <dd>
                {ventesEspècesHorsFondCents != null ? formatMoney(ventesEspècesHorsFondCents) : '—'}
              </dd>
            </div>
            <div>
              <dt>Encaissements carte (info)</dt>
              <dd>{formatMoney(cardTotal)}</dd>
            </div>
            {exchangeCardCents !== 0 ? (
              <>
                <div>
                  <dt>Échanges — crédit carte</dt>
                  <dd>{formatMoney(exchangeCardCents)}</dd>
                </div>
                <div>
                  <dt>Échanges — sortie espèces</dt>
                  <dd>{formatMoney(-exchangeCashOutCents)}</dd>
                </div>
              </>
            ) : null}
            <div className="header-cash-highlight">
              <dt>Total espèces estimées</dt>
              <dd>{totalEspècesEstiméesCents != null ? formatMoney(totalEspècesEstiméesCents) : '—'}</dd>
            </div>
          </dl>

          <h4 className="header-cash-table-title">Ventes par article</h4>
          {productRows.length === 0 ? (
            <p className="muted header-cash-empty">Aucune vente sur cet événement.</p>
          ) : (
            <div className="header-cash-table-wrap">
              <table className="header-cash-table">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th className="num">Qté</th>
                    <th className="num">Montant</th>
                    <th>Prix</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((r) => {
                    const cur = r.currentPriceCents
                    const soldStr = soldPriceLabel(r.minSoldUnitCents, r.maxSoldUnitCents)
                    const priceMismatch =
                      cur != null &&
                      (r.minSoldUnitCents !== cur || r.maxSoldUnitCents !== cur)
                    return (
                      <tr key={r.productId}>
                        <td>
                          <span className="header-cash-emoji" aria-hidden>
                            {r.emoji}
                          </span>{' '}
                          {r.name}
                        </td>
                        <td className="num mono">{r.qtyNet}</td>
                        <td className="num mono">{formatMoney(r.revenueCents)}</td>
                        <td className="header-cash-price-cell">
                          {priceMismatch ? (
                            <>
                              <span className="header-cash-price-line" title="Prix lors des ventes">
                                Vente : {soldStr}
                              </span>
                              <span className="header-cash-price-line muted" title="Prix catalogue actuel">
                                Actuel : {formatMoney(cur)}
                              </span>
                            </>
                          ) : cur != null ? (
                            <span title="Identique au catalogue">{formatMoney(cur)}</span>
                          ) : (
                            <span className="muted">{soldStr}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
