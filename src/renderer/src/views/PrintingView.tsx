import { useCallback, useEffect, useState } from 'react'
import type { TicketUnitPayload } from '@shared/ticket'
import type { SaleRecord } from '@shared/sales'
import type { EscposPaperCutMode, EscposPaperWidth, ThermalUnitTicketEngine } from '@shared/catalog'
import { useAppState } from '@renderer/state/AppStateContext'

type PrinterRow = { name: string; displayName: string }

export default function PrintingView(): JSX.Element {
  const { data, setData } = useAppState()
  const [printers, setPrinters] = useState<PrinterRow[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [printMsg, setPrintMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.caisse
      .listPrinters()
      .then(setPrinters)
      .catch(() => setLoadErr('Liste des imprimantes indisponible.'))
  }, [])

  const setDevice = useCallback(
    (deviceName: string | null) => {
      setData((prev) => ({
        ...prev,
        printing: { ...prev.printing, deviceName }
      }))
    },
    [setData]
  )

  const setAuto = useCallback(
    (autoPrintTickets: boolean) => {
      setData((prev) => ({
        ...prev,
        printing: { ...prev.printing, autoPrintTickets }
      }))
    },
    [setData]
  )

  const setSilentPrint = useCallback(
    (silentPrint: boolean) => {
      setData((prev) => ({
        ...prev,
        printing: { ...prev.printing, silentPrint }
      }))
    },
    [setData]
  )

  const setUnitTicketEngine = useCallback(
    (unitTicketEngine: ThermalUnitTicketEngine) => {
      setData((prev) => ({
        ...prev,
        printing: { ...prev.printing, unitTicketEngine }
      }))
    },
    [setData]
  )

  const setEscposCutMode = useCallback(
    (escposCutMode: EscposPaperCutMode) => {
      setData((prev) => ({
        ...prev,
        printing: { ...prev.printing, escposCutMode }
      }))
    },
    [setData]
  )

  const setEscposPaperWidth = useCallback(
    (escposPaperWidth: EscposPaperWidth) => {
      setData((prev) => ({
        ...prev,
        printing: { ...prev.printing, escposPaperWidth }
      }))
    },
    [setData]
  )

  const setEscposCutInverted = useCallback(
    (escposCutInverted: boolean) => {
      setData((prev) => ({
        ...prev,
        printing: { ...prev.printing, escposCutInverted }
      }))
    },
    [setData]
  )

  const testPrint = useCallback(async () => {
    setPrintMsg(null)
    const dn = data.printing.deviceName
    if (!dn) {
      setPrintMsg('Choisissez d’abord une imprimante.')
      return
    }
    const logo = await window.caisse.getLogoDataUrl(data.association.logoFile)
    const t: TicketUnitPayload = {
      orderNumber: 0,
      emoji: '🧪',
      productName: 'Test impression',
      unitPriceCents: 100,
      eventName: 'Test',
      associationName: data.association.name.trim(),
      atIso: new Date().toISOString()
    }
    const r = await window.caisse.printTickets({
      tickets: [t],
      deviceName: dn,
      logoDataUrl: logo,
      silent: data.printing.silentPrint
    })
    setPrintMsg(r.ok ? 'Impression envoyée.' : `Échec : ${r.error ?? 'inconnu'}`)
  }, [data])

  const p = data.printing

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <h2 className="page-title">Impression tickets</h2>
        <p className="page-desc">
          Après chaque vente validée, un <strong>ticket par unité</strong> peut être imprimé (ex. 3× Coca → 3
          tickets « 1 × Coca ») avec logo, date et événement. Si l’impression échoue avec un pilote « SERVICE INFO » ou un
          redirecteur, décochez l’impression silencieuse pour utiliser la boîte Windows. L’
          <strong>affichage client</strong> (écran public) est dans <strong>Écran client</strong>. L’envoi du récap par
          e-mail (PDF) se configure dans <strong>E-mail tickets</strong>.
        </p>

        {loadErr && <p className="banner-warn">{loadErr}</p>}

        <div className="card form-card">
          <label className="field">
            <span>Imprimante</span>
            <select
              className="input-inline"
              value={p.deviceName ?? ''}
              onChange={(e) => setDevice(e.target.value || null)}
            >
              <option value="">— Sélectionner —</option>
              {printers.map((pr) => (
                <option key={pr.name} value={pr.name}>
                  {pr.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="check-label block-check">
            <input
              type="checkbox"
              checked={p.autoPrintTickets}
              onChange={(e) => setAuto(e.target.checked)}
            />
            <span>Imprimer automatiquement les tickets après chaque vente</span>
          </label>
          <label className="check-label block-check">
            <input
              type="checkbox"
              checked={p.silentPrint}
              onChange={(e) => setSilentPrint(e.target.checked)}
            />
            <span>Impression silencieuse (sans boîte de dialogue Windows)</span>
          </label>
          <fieldset className="field" style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
            <legend style={{ padding: '0 0.35rem' }}>Tickets unitaires (vitesse)</legend>
            <p className="sub" style={{ margin: '0 0 0.65rem' }}>
              Le <strong>récapitulatif caisse</strong> et l’e-mail PDF restent en mode navigateur (HTML).
            </p>
            <label className="check-label block-check">
              <input
                type="radio"
                name="unitTicketEngine"
                checked={p.unitTicketEngine === 'html_chromium'}
                onChange={() => setUnitTicketEngine('html_chromium')}
              />
              <span>
                <strong>Navigateur (HTML)</strong> — logo, mise en page actuelle ; un peu plus lent sur les
                séries.
              </span>
            </label>
            <label className="check-label block-check">
              <input
                type="radio"
                name="unitTicketEngine"
                checked={p.unitTicketEngine === 'escpos_raw'}
                onChange={() => setUnitTicketEngine('escpos_raw')}
              />
              <span>
                <strong>ESC/POS brut (Windows)</strong> — commandes ESC/POS (texte + logo en points),
                ordre et mise en page rapprochés du ticket HTML ; plus rapide en série qu’une fenêtre
                navigateur. Choisissez la largeur du rouleau (58 / 80 mm) pour le retour à la ligne.
              </span>
            </label>
            {p.unitTicketEngine === 'escpos_raw' && (
              <div style={{ marginLeft: '1.35rem', marginTop: '0.5rem', marginBottom: '0.15rem' }}>
                <p className="sub" style={{ margin: '0 0 0.4rem' }}>
                  Largeur du rouleau (texte + logo)
                </p>
                <label className="check-label block-check">
                  <input
                    type="radio"
                    name="escposPaperWidth"
                    checked={(p.escposPaperWidth ?? '80mm') === '80mm'}
                    onChange={() => setEscposPaperWidth('80mm')}
                  />
                  <span>
                    <strong>80 mm</strong> — environ 48 caractères par ligne (réglage par défaut).
                  </span>
                </label>
                <label className="check-label block-check">
                  <input
                    type="radio"
                    name="escposPaperWidth"
                    checked={p.escposPaperWidth === '58mm'}
                    onChange={() => setEscposPaperWidth('58mm')}
                  />
                  <span>
                    <strong>58 mm</strong> — environ 32 caractères par ligne si le ticket est plus étroit.
                  </span>
                </label>
                <p className="sub" style={{ margin: '0.75rem 0 0.4rem' }}>
                  Coupe papier (fin de chaque ticket : avance jusqu’à la lame puis coupe, commandes{' '}
                  <code>GS V 65 / 66</code> — plus fiable qu’un simple <code>GS V 0 / 1</code> sur la plupart des
                  Epson et compatibles).
                </p>
                <label className="check-label block-check">
                  <input
                    type="radio"
                    name="escposCutMode"
                    checked={(p.escposCutMode ?? 'partial') === 'partial'}
                    onChange={() => setEscposCutMode('partial')}
                  />
                  <span>
                    <strong>Partielle</strong> — souvent une languette ; le ticket reste accroché au rouleau
                    jusqu’à tirer.
                  </span>
                </label>
                <label className="check-label block-check">
                  <input
                    type="radio"
                    name="escposCutMode"
                    checked={p.escposCutMode === 'full'}
                    onChange={() => setEscposCutMode('full')}
                  />
                  <span>
                    <strong>Totale</strong> — ticket entièrement séparé du rouleau.
                  </span>
                </label>
                <label className="check-label block-check">
                  <input
                    type="checkbox"
                    checked={p.escposCutInverted === true}
                    onChange={(e) => setEscposCutInverted(e.target.checked)}
                  />
                  <span>
                    <strong>Codes coupe inversés</strong> — à activer si la coupe <em>totale</em> laisse encore une
                    languette : certains clones utilisent <code>GS V 1</code> pour la totale et <code>GS V 0</code>{' '}
                    pour la partielle (inverse Epson).
                  </span>
                </label>
              </div>
            )}
          </fieldset>
          <div className="print-actions">
            <button type="button" className="btn btn-primary" onClick={() => void testPrint()}>
              Imprimer un ticket test
            </button>
          </div>
          {printMsg && <p className="sub">{printMsg}</p>}
          <h3 className="card-title" style={{ marginTop: '1.25rem' }}>
            Ticket de caisse à la demande
          </h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Pour réimprimer une vente passée (unités ou récapitulatif), ouvrez l’onglet{' '}
            <strong>Historique</strong>, puis <strong>Voir</strong> sur la ligne concernée.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!data.printing.deviceName}
            onClick={() => {
              const demo: SaleRecord = {
                id: 'demo',
                at: new Date().toISOString(),
                orderNumber: 1,
                eventId: 'demo',
                eventName: 'Démonstration',
                associationName: data.association.name.trim(),
                lines: [
                  {
                    productId: 'x',
                    name: 'Article test',
                    emoji: '🧪',
                    qty: 2,
                    unitCents: 150,
                    lineTotalCents: 300
                  }
                ],
                totalCents: 300,
                payment: {
                  mode: 'card',
                  cashCents: 0,
                  cardCents: 300,
                  changeCents: 0
                }
              }
              void (async () => {
                setPrintMsg(null)
                if (!data.printing.deviceName) {
                  setPrintMsg('Choisissez d’abord une imprimante.')
                  return
                }
                const logo = await window.caisse.getLogoDataUrl(data.association.logoFile)
                const r = await window.caisse.printSummaryReceipt({
                  sale: demo,
                  deviceName: data.printing.deviceName,
                  logoDataUrl: logo,
                  silent: data.printing.silentPrint
                })
                setPrintMsg(
                  r.ok ? 'Ticket de caisse démo envoyé.' : `Échec : ${r.error ?? ''}`
                )
              })()
            }}
          >
            Imprimer un ticket de caisse démo
          </button>
        </div>
      </div>
    </div>
  )
}
