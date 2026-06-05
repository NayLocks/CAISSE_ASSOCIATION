import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SaleRecord } from '@shared/sales'
import type { TicketUnitPayload } from '@shared/ticket'
import { receiptLegalInfoFromAssociation } from '@shared/catalog'
import { buildSummaryReceiptPlainText } from '@shared/receiptPlain'
import { formatMoney } from '@renderer/utils/money'
import EmptyState from '@renderer/components/EmptyState'
import { formatOrderDisplay } from '@renderer/utils/order'
import { formatOrderLabel } from '@shared/orderDigits'
import { useAppState } from '@renderer/state/AppStateContext'
import { useShellNav } from '@renderer/state/ShellNavContext'
import {
  buildSalesPdfBase64,
  buildSalesXlsxBase64,
  safeEventFileName
} from '@renderer/utils/exportSales'
import { applyHistoryAdvancedFilters } from '@renderer/utils/historySalesFilter'

function paymentShort(s: SaleRecord): string {
  const p = s.payment
  const pref = s.kind === 'refund' ? 'Remb. ' : ''
  if (p.mode === 'card') return `${pref}Carte`
  if (p.mode === 'cash') {
    return p.changeCents > 0
      ? `${pref}Esp. · ${s.kind === 'refund' ? 'repris' : 'rendu'} ${formatMoney(p.changeCents)}`
      : `${pref}Espèces`
  }
  return `${pref}Mixte · carte ${formatMoney(p.cardCents)}`
}

function paymentDetail(s: SaleRecord): string {
  const p = s.payment
  const parts: string[] = []
  const isRef = s.kind === 'refund'
  parts.push(
    p.mode === 'card'
      ? isRef
        ? 'Remboursement carte'
        : 'Carte'
      : p.mode === 'cash'
        ? isRef
          ? 'Remboursement espèces'
          : 'Espèces'
        : isRef
          ? 'Remboursement espèces + carte'
          : 'Espèces + carte'
  )
  if (p.cashCents > 0) parts.push(`Espèces : ${formatMoney(p.cashCents)}`)
  if (p.cardCents > 0) parts.push(`Carte : ${formatMoney(p.cardCents)}`)
  if (p.changeCents > 0) parts.push(`${isRef ? 'Reprise' : 'Rendu'} : ${formatMoney(p.changeCents)}`)
  return parts.join(' · ')
}

export default function HistoryView(): JSX.Element {
  const { data } = useAppState()
  const { openRefundFromSale } = useShellNav()
  const [sales, setSales] = useState<SaleRecord[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [detail, setDetail] = useState<SaleRecord | null>(null)
  const [printMsg, setPrintMsg] = useState<string | null>(null)
  const [emailTo, setEmailTo] = useState('')
  const [emailMsg, setEmailMsg] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<string | 'all'>('all')
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  type HistoryQuick = 'off' | 'today' | 'this_event' | 'refunds'
  const [historyQuick, setHistoryQuick] = useState<HistoryQuick>('off')
  const [advOrder, setAdvOrder] = useState('')
  const [advAmountMin, setAdvAmountMin] = useState('')
  const [advAmountMax, setAdvAmountMax] = useState('')
  const [advPayment, setAdvPayment] = useState<'all' | 'cash' | 'card' | 'mixed'>('all')
  const [advProduct, setAdvProduct] = useState('')

  const reload = (): void => {
    void window.caisse
      .listSales()
      .then(setSales)
      .catch(() => setErr('Impossible de charger l’historique.'))
  }

  useEffect(() => {
    reload()
  }, [data.orderCounter, data.events.length])

  useEffect(() => {
    const onRefresh = (): void => {
      reload()
    }
    window.addEventListener('caisse-sales-refresh', onRefresh)
    return () => window.removeEventListener('caisse-sales-refresh', onRefresh)
  }, [reload])

  useEffect(() => {
    setEmailTo('')
    setEmailMsg(null)
  }, [detail?.id])

  const filteredSales = useMemo(() => {
    let rows = sales
    if (eventFilter !== 'all') rows = rows.filter((s) => s.eventId === eventFilter)
    if (historyQuick === 'today') {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const t0 = start.getTime()
      const t1 = end.getTime()
      rows = rows.filter((s) => {
        const t = new Date(s.at).getTime()
        return t >= t0 && t < t1
      })
    } else if (historyQuick === 'this_event') {
      if (data.selectedEventId) {
        rows = rows.filter((s) => s.eventId === data.selectedEventId)
      }
    } else if (historyQuick === 'refunds') {
      rows = rows.filter((s) => s.kind === 'refund')
    }
    return applyHistoryAdvancedFilters(rows, {
      orderQuery: advOrder,
      amountMinEuros: advAmountMin,
      amountMaxEuros: advAmountMax,
      paymentMode: advPayment,
      productQuery: advProduct
    })
  }, [sales, eventFilter, historyQuick, data.selectedEventId, advOrder, advAmountMin, advAmountMax, advPayment, advProduct])

  const exportForEvent = useMemo(() => {
    if (eventFilter === 'all' || filteredSales.length === 0) return null
    const ev = data.events.find((e) => e.id === eventFilter)
    const eventName = ev?.name ?? filteredSales[0]?.eventName ?? 'Événement'
    const associationName = data.association.name.trim() || 'Association'
    return { eventName, associationName, rows: filteredSales }
  }, [data.events, data.association.name, eventFilter, filteredSales])

  const exportPdf = useCallback(async () => {
    setExportMsg(null)
    if (!exportForEvent) {
      setExportMsg('Sélectionnez un événement et assurez-vous qu’il y a des ventes.')
      return
    }
    const base = safeEventFileName(exportForEvent.eventName)
    const b64 = buildSalesPdfBase64(exportForEvent.rows, {
      eventName: exportForEvent.eventName,
      associationName: exportForEvent.associationName
    })
    const r = await window.caisse.saveFileWithDialog({
      title: 'Exporter les ventes en PDF',
      defaultPath: `ventes-${base}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      dataBase64: b64
    })
    if (r.ok) setExportMsg(`Fichier enregistré : ${r.path}`)
    else if (!r.canceled) setExportMsg('Enregistrement annulé ou impossible.')
  }, [exportForEvent])

  const exportXlsx = useCallback(async () => {
    setExportMsg(null)
    if (!exportForEvent) {
      setExportMsg('Sélectionnez un événement et assurez-vous qu’il y a des ventes.')
      return
    }
    const base = safeEventFileName(exportForEvent.eventName)
    const b64 = buildSalesXlsxBase64(exportForEvent.rows, {
      eventName: exportForEvent.eventName,
      associationName: exportForEvent.associationName
    })
    const r = await window.caisse.saveFileWithDialog({
      title: 'Exporter les ventes en Excel',
      defaultPath: `ventes-${base}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      dataBase64: b64
    })
    if (r.ok) setExportMsg(`Fichier enregistré : ${r.path}`)
    else if (!r.canceled) setExportMsg('Enregistrement annulé ou impossible.')
  }, [exportForEvent])

  const requirePrinter = useCallback((): boolean => {
    if (!data.printing.deviceName) {
      setPrintMsg('Choisissez une imprimante dans le menu Impression.')
      return false
    }
    return true
  }, [data.printing.deviceName])

  const printUnitTickets = useCallback(
    async (sale: SaleRecord) => {
      setPrintMsg(null)
      if (!requirePrinter()) return
      const logo = await window.caisse.getLogoDataUrl(data.association.logoFile)
      const orderNumber =
        sale.orderNumber != null && sale.orderNumber > 0 ? sale.orderNumber : -1
      const tickets: TicketUnitPayload[] = []
      for (const line of sale.lines) {
        for (let i = 0; i < line.qty; i++) {
          const dr =
            typeof line.discountReason === 'string' ? line.discountReason.trim() : ''
          tickets.push({
            orderNumber,
            emoji: line.emoji,
            productName: line.name,
            unitPriceCents: line.unitCents,
            eventName: sale.eventName,
            associationName: data.association.name.trim(),
            atIso: sale.at,
            ...(dr ? { discountReason: dr } : {}),
            ...(sale.cartDiscountPercent != null && sale.cartDiscountPercent > 0
              ? { cartDiscountPercent: sale.cartDiscountPercent }
              : {}),
            ...(typeof sale.cartDiscountReason === 'string' && sale.cartDiscountReason.trim()
              ? { cartDiscountReason: sale.cartDiscountReason.trim() }
              : {})
          })
        }
      }
      const r = await window.caisse.printTickets({
        tickets,
        deviceName: data.printing.deviceName,
        logoDataUrl: logo,
        silent: data.printing.silentPrint
      })
      setPrintMsg(r.ok ? 'Impression des tickets unitaires lancée.' : `Échec : ${r.error ?? ''}`)
    },
    [data, requirePrinter]
  )

  const smtpReceiptConfigured = useMemo(
    () =>
      data.emailReceipt.enabled &&
      data.emailReceipt.host.trim().length > 0 &&
      data.emailReceipt.fromAddress.trim().length > 0,
    [
      data.emailReceipt.enabled,
      data.emailReceipt.host,
      data.emailReceipt.fromAddress
    ]
  )

  const sendReceiptEmail = useCallback(async () => {
    if (!detail) return
    setEmailMsg(null)
    const addr = emailTo.trim()
    if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setEmailMsg('Saisissez une adresse e-mail valide.')
      return
    }
    const legal = receiptLegalInfoFromAssociation(data.association)
    const ordSubject =
      detail.orderNumber != null && detail.orderNumber > 0
        ? formatOrderLabel(detail.orderNumber)
        : 'Ticket caisse'
    const evName = detail.eventName.trim() || 'Événement'
    const assoName = detail.associationName.trim() || data.association.name.trim() || 'Caisse'
    const subject = `${ordSubject} — ${evName} — ${assoName}`

    if (smtpReceiptConfigured) {
      const r = await window.caisse.sendSummaryReceiptEmail({ sale: detail, to: addr })
      setEmailMsg(r.ok ? 'E-mail envoyé.' : r.error)
      return
    }

    const plain = buildSummaryReceiptPlainText(detail, legal)
    const body = plain.length > 1900 ? `${plain.slice(0, 1900)}\n…` : plain
    const mailto = `mailto:${encodeURIComponent(addr)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    await window.caisse.openExternal(mailto)
    setEmailMsg(
      'Votre messagerie par défaut a été ouverte avec le ticket en texte. Pour un envoi direct (PDF), configurez l’SMTP dans le menu E-mail tickets.'
    )
  }, [detail, emailTo, data.association, data.association.name, smtpReceiptConfigured])

  const printCashReceipt = useCallback(
    async (sale: SaleRecord) => {
      setPrintMsg(null)
      if (!requirePrinter()) return
      const logo = await window.caisse.getLogoDataUrl(data.association.logoFile)
      const r = await window.caisse.printSummaryReceipt({
        sale,
        deviceName: data.printing.deviceName,
        logoDataUrl: logo,
        silent: data.printing.silentPrint
      })
      setPrintMsg(r.ok ? 'Ticket de caisse (récapitulatif) lancé.' : `Échec : ${r.error ?? ''}`)
    },
    [data, requirePrinter]
  )

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h2 className="page-title">Historique des ventes</h2>
            <p className="page-desc">
              Chaque vente a un <strong>numéro de commande</strong>. Pour un <strong>remboursement</strong>,
              utilisez <strong>Rembourser</strong> sur une vente : la caisse s’ouvre avec les lignes et prix
              d’origine ; vous pouvez réduire les quantités (partiel) ou tout valider. Filtrez par événement
              puis exportez en <strong>PDF</strong> ou <strong>Excel</strong>.
            </p>
          </div>
          <div className="page-head-actions">
            <button type="button" className="btn btn-secondary" onClick={reload}>
              Actualiser
            </button>
          </div>
        </div>
        <div className="history-toolbar history-toolbar-row history-toolbar--tiered">
          <div className="history-toolbar-cluster history-toolbar-cluster--filters">
          <label className="field inline-field">
            <span>Filtrer par événement</span>
            <select
              className="event-select"
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value as string | 'all')
                setExportMsg(null)
              }}
            >
              <option value="all">Tous les événements</option>
              {data.events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                  {ev.date ? ` (${ev.date})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="history-quick-filters" role="group" aria-label="Filtres rapides">
            <span>Filtres rapides</span>
            <button
              type="button"
              className={`btn btn-secondary btn-compact${historyQuick === 'today' ? ' is-active' : ''}`}
              onClick={() => {
                setHistoryQuick((q) => (q === 'today' ? 'off' : 'today'))
                setExportMsg(null)
              }}
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-compact${historyQuick === 'this_event' ? ' is-active' : ''}`}
              disabled={!data.selectedEventId}
              title={
                data.selectedEventId
                  ? 'Limite aux ventes de l’événement actuellement sélectionné dans l’en-tête'
                  : 'Sélectionnez un événement dans l’en-tête'
              }
              onClick={() => {
                setHistoryQuick((q) => (q === 'this_event' ? 'off' : 'this_event'))
                setExportMsg(null)
              }}
            >
              Événement en-tête
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-compact${historyQuick === 'refunds' ? ' is-active' : ''}`}
              onClick={() => {
                setHistoryQuick((q) => (q === 'refunds' ? 'off' : 'refunds'))
                setExportMsg(null)
              }}
            >
              Remboursements
            </button>
          </div>
          </div>
          <div className="history-advanced-filters">
            <label className="field inline-field">
              <span>N° commande</span>
              <input type="text" value={advOrder} placeholder="ex. 042" onChange={(e) => setAdvOrder(e.target.value)} />
            </label>
            <label className="field inline-field">
              <span>Montant min (€)</span>
              <input
                type="text"
                inputMode="decimal"
                value={advAmountMin}
                onChange={(e) => setAdvAmountMin(e.target.value)}
              />
            </label>
            <label className="field inline-field">
              <span>Montant max (€)</span>
              <input
                type="text"
                inputMode="decimal"
                value={advAmountMax}
                onChange={(e) => setAdvAmountMax(e.target.value)}
              />
            </label>
            <label className="field inline-field">
              <span>Paiement</span>
              <select value={advPayment} onChange={(e) => setAdvPayment(e.target.value as typeof advPayment)}>
                <option value="all">Tous</option>
                <option value="cash">Espèces</option>
                <option value="card">Carte</option>
                <option value="mixed">Mixte</option>
              </select>
            </label>
            <label className="field inline-field grow">
              <span>Article</span>
              <input
                type="search"
                value={advProduct}
                placeholder="Nom ou id article"
                onChange={(e) => setAdvProduct(e.target.value)}
              />
            </label>
          </div>
          <div className="history-toolbar-cluster history-toolbar-cluster--exports">
          <div className="history-export-btns">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!exportForEvent}
              onClick={() => void exportPdf()}
            >
              PDF
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!exportForEvent}
              onClick={() => void exportXlsx()}
            >
              Excel
            </button>
          </div>
          </div>
        </div>
        {exportMsg && <p className="sub export-msg">{exportMsg}</p>}
        {err && <p className="banner-warn">{err}</p>}
        <div className="table-wrap history-table-wrap">
          <table className="data-table history-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date / heure</th>
                <th>Type</th>
                <th>Événement</th>
                <th>Paiement</th>
                <th className="td-right">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="history-empty-cell">
                    <EmptyState
                      icon="📜"
                      title="Aucune vente enregistrée"
                      description="Les ventes validées sur cette caisse apparaîtront ici. Encaissez une commande ou cliquez sur « Actualiser » après une session."
                      density="compact"
                    />
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="history-empty-cell">
                    <EmptyState
                      icon="🔍"
                      title="Aucun résultat avec ces filtres"
                      description="Élargissez le filtre événement ou désactivez les filtres rapides (aujourd’hui, événement en-tête, remboursements)."
                      density="compact"
                      actions={
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setEventFilter('all')
                            setHistoryQuick('off')
                            setExportMsg(null)
                          }}
                        >
                          Réinitialiser les filtres
                        </button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                filteredSales.map((s) => (
                  <tr key={s.id} className={s.kind === 'refund' ? 'hist-row-refund' : undefined}>
                    <td className="mono hist-cde-no">{formatOrderDisplay(s.orderNumber)}</td>
                    <td className="mono td-nowrap">
                      {new Date(s.at).toLocaleString('fr-FR')}
                    </td>
                    <td>
                      {s.kind === 'refund' ? (
                        <span className="hist-badge-refund">Remboursement</span>
                      ) : (
                        <span className="hist-badge-sale">Vente</span>
                      )}
                    </td>
                    <td>
                      <div>{s.eventName}</div>
                      <div className="hist-lines-preview muted">
                        {s.lines.map((l, i) => (
                          <span key={`${s.id}-${l.productId}-${i}`}>
                            {l.qty}× {l.name}{' '}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{paymentShort(s)}</td>
                    <td className="td-right mono strong">
                      {s.kind === 'refund' ? '−' : ''}
                      {formatMoney(s.totalCents)}
                    </td>
                    <td className="td-actions td-actions-hist">
                      {s.kind !== 'refund' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm-hist btn-hist-refund"
                          title="Ouvrir la caisse en remboursement (total ou partiel après ajustement)"
                          onClick={() => openRefundFromSale(s)}
                        >
                          Rembourser
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm-hist"
                        onClick={() => {
                          setPrintMsg(null)
                          setEmailMsg(null)
                          setDetail(s)
                        }}
                      >
                        Voir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hist-detail-title"
          onClick={() => setDetail(null)}
        >
          <div className="modal modal-wide hist-detail-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="hist-detail-title">
              {detail.kind === 'refund' ? 'Détail du remboursement' : 'Détail de la vente'}
            </h3>
            <p className="sub mono">
              {detail.orderNumber != null && detail.orderNumber > 0 ? (
                <>
                  <strong className="hist-cde-no">{formatOrderDisplay(detail.orderNumber)}</strong> ·{' '}
                </>
              ) : null}
              {new Date(detail.at).toLocaleString('fr-FR')}
            </p>
            <div className="hist-detail-grid">
              <div>
                <span className="hist-k">Association</span>
                <span>{detail.associationName}</span>
              </div>
              <div>
                <span className="hist-k">Événement</span>
                <span>{detail.eventName}</span>
              </div>
              <div className="hist-detail-full">
                <span className="hist-k">Paiement</span>
                <span>{paymentDetail(detail)}</span>
              </div>
              {detail.kind === 'refund' &&
                (detail.refundSourceOrderNumber != null || detail.refundSourceSaleId) && (
                  <div className="hist-detail-full">
                    <span className="hist-k">Lié à</span>
                    <span>
                      {detail.refundSourceOrderNumber != null && detail.refundSourceOrderNumber > 0
                        ? formatOrderDisplay(detail.refundSourceOrderNumber)
                        : 'Vente source'}
                      {detail.refundSourceSaleId ? (
                        <span className="muted mono hist-refund-id"> · {detail.refundSourceSaleId.slice(0, 8)}…</span>
                      ) : null}
                    </span>
                  </div>
                )}
            </div>
            <h4 className="hist-lines-title">Lignes</h4>
            <ul className="hist-lines-detail">
              {detail.lines.map((l, i) => {
                const list = l.listUnitCents
                const pct = l.discountPercent ?? 0
                const reason = typeof l.discountReason === 'string' ? l.discountReason.trim() : ''
                const parts: string[] = []
                if (list != null && list !== l.unitCents) {
                  parts.push(`barème ${formatMoney(list)} / u.`)
                }
                if (pct > 0) parts.push(`remise ${pct} %`)
                if (reason) parts.push(reason)
                const extra = parts.join(' · ')
                return (
                  <li key={`${detail.id}-l-${i}`}>
                    <span className="hist-emoji">{l.emoji}</span>
                    <span>
                      <span>
                        {l.qty} × {l.name} — {formatMoney(l.unitCents)} / u. —{' '}
                        <strong>{formatMoney(l.lineTotalCents)}</strong>
                      </span>
                      {extra ? <div className="muted hist-line-note">{extra}</div> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
            {(() => {
              const cp = detail.cartDiscountPercent ?? 0
              if (cp <= 0) return null
              const sub = detail.lines.reduce((s, l) => s + l.lineTotalCents, 0)
              const cr =
                typeof detail.cartDiscountReason === 'string' ? detail.cartDiscountReason.trim() : ''
              return (
                <div className="muted hist-line-note" style={{ margin: '0.35rem 0' }}>
                  Sous-total {formatMoney(sub)} · remise sur le total {cp} %
                  {cr ? ` — ${cr}` : ''}
                </div>
              )
            })()}
            <div className="hist-total-bar">
              {detail.kind === 'refund' ? 'Total remboursé' : 'Total'} :{' '}
              <strong>
                {detail.kind === 'refund' ? '−' : ''}
                {formatMoney(detail.totalCents)}
              </strong>
            </div>
            <div className="hist-print-actions hist-print-actions-row">
              {detail.kind !== 'refund' && (
                <button
                  type="button"
                  className="btn btn-secondary hist-print-btn"
                  onClick={() => void printUnitTickets(detail)}
                >
                  Réimprimer tickets (1 par unité)
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary hist-print-btn"
                onClick={() => void printCashReceipt(detail)}
              >
                Ticket de caisse (récap.)
              </button>
            </div>
            <div className="hist-email-panel">
              <label className="field hist-email-field-block">
                <span>Adresse e-mail du client (ticket récapitulatif)</span>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  className="hist-email-input"
                  placeholder="ex. prenom.nom@domaine.fr"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-secondary hist-email-send-block"
                onClick={() => void sendReceiptEmail()}
              >
                {smtpReceiptConfigured ? 'Envoyer le ticket par e-mail' : 'Ouvrir la messagerie…'}
              </button>
            </div>
            <p className="sub hist-email-hint">
              {smtpReceiptConfigured
                ? 'Envoi depuis l’application : message court + ticket en pièce jointe PDF (même mise en page qu’à l’impression). Paramètres : menu E-mail tickets.'
                : 'Sans SMTP, votre messagerie s’ouvre avec le ticket en texte. Pour un envoi avec pièce jointe depuis l’app, configurez SMTP dans le menu E-mail tickets.'}
            </p>
            {printMsg && <p className="sub hist-print-msg">{printMsg}</p>}
            {emailMsg && <p className="sub hist-print-msg">{emailMsg}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDetail(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
