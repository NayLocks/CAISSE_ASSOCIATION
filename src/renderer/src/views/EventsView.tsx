import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventItem } from '@shared/catalog'
import { useAppState } from '@renderer/state/AppStateContext'
import { useToast } from '@renderer/state/ToastContext'
import {
  buildSalesPdfBase64,
  buildSalesXlsxBase64,
  safeEventFileName
} from '@renderer/utils/exportSales'
import { buildEventClosureStats } from '@renderer/utils/eventClosureStats'
import { buildEventClosurePdfBase64 } from '@renderer/utils/exportEventClosure'
import {
  blurActiveElement,
  stabilizeFocusAfterDelete,
  stabilizeFocusAfterNativeDialog
} from '@renderer/utils/blurActiveElement'
import { centsToEurosInput, formatMoney, parseEurosToCents } from '@renderer/utils/money'

function newId(): string {
  return crypto.randomUUID()
}

const CAISSE_SALES_REFRESH_EVENT = 'caisse-sales-refresh'

export default function EventsView(): JSX.Element {
  const { data, setData } = useAppState()
  const { showToast } = useToast()
  const [draft, setDraft] = useState({ name: '', date: '', notes: '' })
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [floatEdit, setFloatEdit] = useState<{ eventId: string; draft: string } | null>(null)
  const pendingEventByIdRef = useRef<Record<string, EventItem>>({})
  const syncTimerByIdRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const addEvent = useCallback(() => {
    const name = draft.name.trim() || 'Nouvel événement'
    const ev: EventItem = {
      id: newId(),
      name,
      date: draft.date,
      notes: draft.notes.trim(),
      closed: false
    }
    setData((prev) => ({
      ...prev,
      events: [...prev.events, ev],
      stockByEvent: { ...prev.stockByEvent, [ev.id]: {} },
      disabledProductsByEvent: { ...prev.disabledProductsByEvent, [ev.id]: {} },
      selectedEventId: prev.selectedEventId ?? ev.id
    }))
    setDraft({ name: '', date: '', notes: '' })
  }, [draft, setData])

  const remove = useCallback(
    (id: string) => {
      if (!confirm('Supprimer cet événement ?')) {
        stabilizeFocusAfterNativeDialog()
        return
      }
      blurActiveElement()
      window.setTimeout(() => {
        setData((prev) => {
          const events = prev.events.filter((e) => e.id !== id)
          let selectedEventId = prev.selectedEventId
          if (selectedEventId === id) {
            selectedEventId = events[0]?.id ?? null
          }
          const stockByEvent = { ...prev.stockByEvent }
          delete stockByEvent[id]
          const disabledProductsByEvent = { ...prev.disabledProductsByEvent }
          delete disabledProductsByEvent[id]
          const eventSessions = { ...prev.eventSessions }
          delete eventSessions[id]
          return { ...prev, events, selectedEventId, stockByEvent, disabledProductsByEvent, eventSessions }
        })
        window.setTimeout(() => stabilizeFocusAfterDelete(), 0)
      }, 0)
    },
    [setData]
  )

  const setActive = useCallback(
    (id: string) => {
      setData((prev) => ({ ...prev, selectedEventId: id }))
    },
    [setData]
  )

  const flushSalesSyncDebounced = useCallback((eventId: string) => {
    const tPrev = syncTimerByIdRef.current[eventId]
    if (tPrev) clearTimeout(tPrev)
    syncTimerByIdRef.current[eventId] = setTimeout(() => {
      delete syncTimerByIdRef.current[eventId]
      const ev = pendingEventByIdRef.current[eventId]
      if (!ev) return
      void window.caisse
        .syncEventSalesMetadata({
          eventId: ev.id,
          eventName: ev.name,
          eventDate: ev.date,
          eventNotes: ev.notes
        })
        .then(() => {
          window.dispatchEvent(new CustomEvent(CAISSE_SALES_REFRESH_EVENT))
        })
    }, 450)
  }, [])

  useEffect(() => {
    return () => {
      for (const t of Object.values(syncTimerByIdRef.current)) clearTimeout(t)
    }
  }, [])

  const updateField = useCallback(
    (id: string, field: 'name' | 'date' | 'notes', value: string) => {
      setData((prev) => {
        const nextEvents = prev.events.map((e) => (e.id === id ? { ...e, [field]: value } : e))
        const ev = nextEvents.find((e) => e.id === id)
        if (ev) {
          pendingEventByIdRef.current[id] = ev
          flushSalesSyncDebounced(id)
        }
        return { ...prev, events: nextEvents }
      })
    },
    [setData, flushSalesSyncDebounced]
  )

  const exportEvent = useCallback(
    async (ev: EventItem, kind: 'pdf' | 'xlsx') => {
      setExportMsg(null)
      const all = await window.caisse.listSales()
      const rows = all.filter((s) => s.eventId === ev.id)
      if (rows.length === 0) {
        setExportMsg(`Aucune vente enregistrée pour « ${ev.name} ».`)
        return
      }
      const associationName = data.association.name.trim() || 'Association'
      const base = safeEventFileName(ev.name)
      if (kind === 'pdf') {
        const b64 = buildSalesPdfBase64(rows, {
          eventName: ev.name,
          associationName
        })
        const r = await window.caisse.saveFileWithDialog({
          title: 'Exporter les ventes en PDF',
          defaultPath: `ventes-${base}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          dataBase64: b64
        })
        if (r.ok) setExportMsg(`PDF enregistré : ${r.path}`)
        else if (!r.canceled) setExportMsg('Enregistrement impossible.')
      } else {
        const b64 = buildSalesXlsxBase64(rows, {
          eventName: ev.name,
          associationName
        })
        const r = await window.caisse.saveFileWithDialog({
          title: 'Exporter les ventes en Excel',
          defaultPath: `ventes-${base}.xlsx`,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }],
          dataBase64: b64
        })
        if (r.ok) setExportMsg(`Excel enregistré : ${r.path}`)
        else if (!r.canceled) setExportMsg('Enregistrement impossible.')
      }
    },
    [data.association.name]
  )

  const setClosed = useCallback(
    (id: string, closed: boolean) => {
      setData((prev) => ({
        ...prev,
        events: prev.events.map((e) => (e.id === id ? { ...e, closed } : e))
      }))
    },
    [setData]
  )

  const exportClosureReport = useCallback(
    async (ev: EventItem) => {
      setExportMsg(null)
      const all = await window.caisse.listSales()
      const session = data.eventSessions[ev.id]
      const floatCents = session?.floatCents ?? 0
      const stats = buildEventClosureStats(all, ev.id, data.products, floatCents)
      const b64 = buildEventClosurePdfBase64(ev, stats, {
        associationName: data.association.name.trim() || 'Association',
        closedAtIso: new Date().toISOString()
      })
      const base = safeEventFileName(ev.name)
      const r = await window.caisse.saveFileWithDialog({
        title: 'Rapport de clôture (PDF)',
        defaultPath: `cloture-${base}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        dataBase64: b64
      })
      if (r.ok) setExportMsg(`Rapport de clôture enregistré : ${r.path}`)
      else if (!r.canceled) setExportMsg('Enregistrement du rapport impossible.')
    },
    [data.association.name, data.eventSessions, data.products]
  )

  const duplicateEvent = useCallback(
    (sourceId: string) => {
      const src = data.events.find((e) => e.id === sourceId)
      if (!src) return
      const name = `${src.name.trim()} (copie)`.slice(0, 120)
      const ev: EventItem = {
        id: newId(),
        name: name || 'Événement (copie)',
        date: src.date,
        notes: src.notes,
        closed: false
      }
      const stockCopy = { ...(data.stockByEvent[sourceId] ?? {}) }
      const disabledCopy = { ...(data.disabledProductsByEvent[sourceId] ?? {}) }
      setData((prev) => ({
        ...prev,
        events: [...prev.events, ev],
        stockByEvent: { ...prev.stockByEvent, [ev.id]: stockCopy },
        disabledProductsByEvent: { ...prev.disabledProductsByEvent, [ev.id]: disabledCopy },
        selectedEventId: ev.id
      }))
      showToast({ variant: 'success', message: `Événement « ${ev.name} » créé avec le stock et les articles actifs copiés.` })
    },
    [data.events, data.stockByEvent, data.disabledProductsByEvent, setData, showToast]
  )

  const closeEvent = useCallback(
    (id: string) => {
      const ev = data.events.find((e) => e.id === id)
      if (
        !confirm(
          'Clôturer cet événement ?\n\nPlus aucun encaissement ni remboursement ne sera possible à la caisse pour cet événement (consultation et exports restent possibles).'
        )
      ) {
        return
      }
      setClosed(id, true)
      if (ev && confirm('Générer le rapport de clôture (PDF) maintenant ?')) {
        void exportClosureReport(ev)
      }
    },
    [setClosed, data.events, exportClosureReport]
  )

  const reopenEvent = useCallback(
    (id: string) => {
      if (!confirm('Rouvrir cet événement ? La caisse pourra à nouveau encaisser et rembourser.')) return
      setClosed(id, false)
    },
    [setClosed]
  )

  const saveFloatEdit = useCallback(() => {
    if (!floatEdit) return
    const c = parseEurosToCents(floatEdit.draft.replace(/\s/g, ''))
    if (c === null) {
      showToast({ variant: 'error', message: 'Montant invalide.' })
      return
    }
    const eid = floatEdit.eventId
    setData((prev) => {
      const cur = prev.eventSessions[eid]
      if (!cur) return prev
      return {
        ...prev,
        eventSessions: {
          ...prev.eventSessions,
          [eid]: { ...cur, floatCents: c }
        }
      }
    })
    setFloatEdit(null)
  }, [floatEdit, setData, showToast])

  return (
    <div className="page">
      <div className="page-inner">
        <h2 className="page-title">Événements</h2>
        <p className="page-desc">
          La caisse est liée à l’<strong>événement actif</strong>. Sélectionnez-le ici ou depuis
          l’en-tête. Vous pouvez aussi <strong>extraire les ventes</strong> de chaque événement en PDF ou
          Excel. Si vous modifiez le <strong>nom</strong>, la <strong>date</strong> ou les{' '}
          <strong>notes</strong> d’un événement, ces libellés sont mis à jour sur toutes les ventes déjà
          enregistrées pour cet événement (historique, tickets réimprimés).
        </p>
        {exportMsg && <p className="sub export-msg">{exportMsg}</p>}

        <div className="card form-card event-new-card">
          <h3 className="card-title">Nouvel événement</h3>
          <div className="form-row">
            <label className="field">
              <span>Nom</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="ex. Tournoi de printemps"
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              />
            </label>
          </div>
          <label className="field">
            <span>Notes (optionnel)</span>
            <input
              type="text"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Lieu, horaires…"
            />
          </label>
          <div className="form-card-actions">
            <button type="button" className="btn btn-primary" onClick={addEvent}>
              Ajouter l’événement
            </button>
          </div>
        </div>

        <div className="events-list">
          {data.events.length === 0 ? (
            <p className="muted center-pad">Aucun événement. Ajoutez-en un ci-dessus.</p>
          ) : (
            data.events.map((ev) => (
              <div
                key={ev.id}
                className={`event-card${
                  data.selectedEventId === ev.id ? ' event-card-active' : ''
                }`}
              >
                <div className="event-card-top">
                  <label className="field grow">
                    <span>Nom</span>
                    <input
                      type="text"
                      value={ev.name}
                      onChange={(e) => updateField(ev.id, 'name', e.target.value)}
                    />
                  </label>
                  <label className="field w-date">
                    <span>Date</span>
                    <input
                      type="date"
                      value={ev.date}
                      onChange={(e) => updateField(ev.id, 'date', e.target.value)}
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Notes</span>
                  <input
                    type="text"
                    value={ev.notes}
                    onChange={(e) => updateField(ev.id, 'notes', e.target.value)}
                  />
                </label>
                <p className="event-session-hint">
                  {ev.closed ? (
                    <span className="event-closed-badge">Événement clôturé — caisse verrouillée pour cet événement</span>
                  ) : data.eventSessions[ev.id] ? (
                    <>
                      Session démarrée — fond de caisse :{' '}
                      <strong>{formatMoney(data.eventSessions[ev.id].floatCents)}</strong>
                    </>
                  ) : (
                    <span className="muted">Session caisse non démarrée (fond requis à la caisse)</span>
                  )}
                </p>
                <div className="event-actions">
                  <div className="event-actions-row">
                    <button
                      type="button"
                      className={`btn${data.selectedEventId === ev.id ? ' btn-accent' : ' btn-secondary'}`}
                      onClick={() => setActive(ev.id)}
                    >
                      {data.selectedEventId === ev.id ? 'Événement actif' : 'Définir comme actif'}
                    </button>
                    {!ev.closed ? (
                      <button
                        type="button"
                        className="btn btn-danger-outline"
                        onClick={() => closeEvent(ev.id)}
                      >
                        Clôturer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => reopenEvent(ev.id)}
                      >
                        Rouvrir la caisse
                      </button>
                    )}
                  </div>
                  <div className="event-actions-row">
                    {data.eventSessions[ev.id] && !ev.closed && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          setFloatEdit({
                            eventId: ev.id,
                            draft: centsToEurosInput(data.eventSessions[ev.id].floatCents)
                          })
                        }
                      >
                        Modifier le fond de caisse
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void exportClosureReport(ev)}
                    >
                      Rapport clôture
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => duplicateEvent(ev.id)}
                    >
                      Dupliquer
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void exportEvent(ev, 'pdf')}
                    >
                      Export PDF
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void exportEvent(ev, 'xlsx')}
                    >
                      Export Excel
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => remove(ev.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {floatEdit && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="float-edit-title"
          onClick={() => setFloatEdit(null)}
        >
          <div className="modal modal-float-edit" onClick={(e) => e.stopPropagation()}>
            <h3 id="float-edit-title">Fond de caisse</h3>
            <p className="sub">
              Montant d’espèces présent en caisse au moment du comptage (révision du fond pendant
              l’événement).
            </p>
            <label className="field">
              <span>Montant (€)</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={floatEdit.draft}
                onChange={(e) => setFloatEdit((f) => (f ? { ...f, draft: e.target.value } : f))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveFloatEdit()
                }}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={saveFloatEdit}>
                Enregistrer
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setFloatEdit(null)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
