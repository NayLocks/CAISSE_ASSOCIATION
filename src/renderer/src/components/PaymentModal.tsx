import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClientPaymentDetail } from '@shared/clientDisplay'
import type { SalePayment } from '@shared/sales'
import { EUR_DENOMINATIONS } from '@renderer/payment/denominations'
import { formatMoney } from '@renderer/utils/money'

type Step = 'choose' | 'cash' | 'card'

type Props = {
  open: boolean
  totalCents: number
  onClose: () => void
  /** Appelé une fois le paiement validé (espèces, carte ou mixte) */
  onPaid: (payment: SalePayment) => void
  /** SumUp : option + jeton API (et code marchand si terminal) */
  sumupConfigured?: boolean
  /** SumUp Solo : identifiant lecteur `rdr_…` renseigné → envoi au terminal au choix « Carte » */
  sumupTerminalAuto?: boolean
  /** Remboursement client : libellés adaptés, pas de SumUp (encaissement manuel) */
  refundMode?: boolean
  /** À l’ouverture : sauter l’écran de choix et aller directement espèces ou carte (vente uniquement) */
  initialStep?: Step
  /** Affichage client (navigateur) : synchronise le détail du paiement */
  onPaymentDisplayUpdate?: (detail: ClientPaymentDetail | null) => void
}

const SUMUP_POLL_MS = 2500
const SUMUP_MAX_MS = 4 * 60 * 1000

export default function PaymentModal({
  open,
  totalCents,
  onClose,
  onPaid,
  sumupConfigured = false,
  sumupTerminalAuto = false,
  refundMode = false,
  initialStep = 'choose',
  onPaymentDisplayUpdate
}: Props): JSX.Element | null {
  const effectiveSumup = sumupConfigured && !refundMode
  const effectiveTermAuto = sumupTerminalAuto && !refundMode
  const [step, setStep] = useState<Step>('choose')
  const [cashGiven, setCashGiven] = useState(0)
  const [sumupPhase, setSumupPhase] = useState<'idle' | 'creating' | 'waiting' | 'error'>('idle')
  const [sumupErr, setSumupErr] = useState<string | null>(null)
  /** Montant à passer sur SumUp : `null` = total commande ; sinon complément après espèces (paiement mixte). */
  const [cardChargeCents, setCardChargeCents] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sumupStartedRef = useRef<number>(0)
  const terminalAutoStartedRef = useRef(false)
  /** Session SumUp à annuler au « Retour » / fermeture (terminate lecteur ou désactiver checkout en ligne). */
  const sumupSessionRef = useRef<
    { kind: 'reader' } | { kind: 'online'; checkoutId: string } | null
  >(null)
  const sumupAbortedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    const start: Step =
      refundMode || initialStep === 'choose' ? 'choose' : initialStep === 'cash' ? 'cash' : 'card'
    setStep(start)
    setCashGiven(0)
    setCardChargeCents(null)
    setSumupPhase('idle')
    setSumupErr(null)
    terminalAutoStartedRef.current = false
    sumupSessionRef.current = null
    sumupAbortedRef.current = false
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [open, totalCents, initialStep, refundMode])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const changeCents = useMemo(() => Math.max(0, cashGiven - totalCents), [cashGiven, totalCents])
  const shortCents = useMemo(() => Math.max(0, totalCents - cashGiven), [cashGiven, totalCents])
  /** Total 0 € : valider sans espèces reçues (don / remise 100 %). */
  const canValidateCash = totalCents === 0 || cashGiven >= totalCents
  const canMixed = cashGiven > 0 && cashGiven < totalCents

  const addDenom = useCallback((cents: number) => {
    setCashGiven((s) => s + cents)
  }, [])

  const clearCash = useCallback(() => setCashGiven(0), [])

  const payCardOnly = useCallback(() => {
    onPaid({
      mode: 'card',
      cashCents: 0,
      cardCents: totalCents,
      changeCents: 0
    })
  }, [onPaid, totalCents])

  const completeSumupSuccess = useCallback(() => {
    if (cardChargeCents != null) {
      onPaid({
        mode: 'mixed',
        cashCents: cashGiven,
        cardCents: cardChargeCents,
        changeCents: 0
      })
    } else {
      onPaid({
        mode: 'card',
        cashCents: 0,
        cardCents: totalCents,
        changeCents: 0
      })
    }
  }, [onPaid, totalCents, cashGiven, cardChargeCents])

  const stopSumupPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const cancelActiveSumupFromRef = useCallback(async () => {
    stopSumupPoll()
    const sess = sumupSessionRef.current
    sumupSessionRef.current = null
    if (!sess) return
    if (sess.kind === 'reader') {
      await window.caisse.sumupCancelPayment({})
    } else {
      await window.caisse.sumupCancelPayment({ onlineCheckoutId: sess.checkoutId })
    }
  }, [stopSumupPoll])

  const goBackFromCard = useCallback(async () => {
    sumupAbortedRef.current = true
    await cancelActiveSumupFromRef()
    setSumupPhase('idle')
    setSumupErr(null)
    if (cardChargeCents != null) {
      setCardChargeCents(null)
      setStep('cash')
    } else {
      setStep('choose')
    }
  }, [cancelActiveSumupFromRef, cardChargeCents])

  const handleBackdropClose = useCallback(async () => {
    if (step === 'card' && effectiveSumup) {
      sumupAbortedRef.current = true
      await cancelActiveSumupFromRef()
      setSumupPhase('idle')
      setSumupErr(null)
    }
    onClose()
  }, [step, effectiveSumup, cancelActiveSumupFromRef, onClose])

  const startSumup = useCallback(async () => {
    sumupAbortedRef.current = false
    setSumupErr(null)
    setSumupPhase('creating')
    const ref = crypto.randomUUID()
    const amountCents = cardChargeCents ?? totalCents
    if (amountCents <= 0) {
      setSumupPhase('idle')
      setSumupErr(null)
      if (cardChargeCents != null) {
        onPaid({
          mode: 'mixed',
          cashCents: cashGiven,
          cardCents: Math.max(0, cardChargeCents),
          changeCents: 0
        })
      } else {
        onPaid({ mode: 'card', cashCents: 0, cardCents: 0, changeCents: 0 })
      }
      return
    }
    const r = await window.caisse.sumupCreateCheckout({
      amountCents,
      checkoutReference: ref,
      description: 'Caisse - Association - Buvette'
    })
    if (!r.ok) {
      setSumupPhase('error')
      setSumupErr(
        r.error === 'not_configured'
          ? 'SumUp non configuré (menu SumUp).'
          : typeof r.error === 'string'
            ? r.error
            : 'Erreur SumUp'
      )
      return
    }
    if (sumupAbortedRef.current) {
      if (r.flow === 'reader') {
        await window.caisse.sumupCancelPayment({})
      } else {
        await window.caisse.sumupCancelPayment({ onlineCheckoutId: r.checkoutId })
      }
      return
    }
    if (r.flow === 'online') {
      if (r.nextUrl) {
        await window.caisse.openExternal(r.nextUrl)
      }
      sumupSessionRef.current = { kind: 'online', checkoutId: r.checkoutId }
      setSumupPhase('waiting')
      sumupStartedRef.current = Date.now()
      stopSumupPoll()
      pollRef.current = setInterval(async () => {
        if (Date.now() - sumupStartedRef.current > SUMUP_MAX_MS) {
          stopSumupPoll()
          sumupSessionRef.current = null
          setSumupPhase('error')
          setSumupErr('Délai dépassé. Utilisez « Enregistrer le paiement carte » si encaissement OK.')
          return
        }
        const st = await window.caisse.sumupCheckoutStatus(r.checkoutId)
        if (!st.ok) return
        if (st.paid) {
          stopSumupPoll()
          sumupSessionRef.current = null
          setSumupPhase('idle')
          completeSumupSuccess()
        }
      }, SUMUP_POLL_MS)
      return
    }

    /* Terminal Solo (API Readers) */
    sumupSessionRef.current = { kind: 'reader' }
    setSumupPhase('waiting')
    sumupStartedRef.current = Date.now()
    stopSumupPoll()
    const clientId = r.clientTransactionId
    pollRef.current = setInterval(async () => {
      if (Date.now() - sumupStartedRef.current > SUMUP_MAX_MS) {
        stopSumupPoll()
        sumupSessionRef.current = null
        setSumupPhase('error')
        setSumupErr('Délai dépassé. Vérifiez le terminal ou enregistrez le paiement manuellement.')
        return
      }
      const st = await window.caisse.sumupTransactionStatus(clientId)
      if (!st.ok) return
      if (st.poll === 'error') {
        stopSumupPoll()
        sumupSessionRef.current = null
        setSumupPhase('error')
        setSumupErr(st.message || 'Erreur SumUp')
        return
      }
      if (st.poll === 'failed') {
        stopSumupPoll()
        sumupSessionRef.current = null
        setSumupPhase('error')
        setSumupErr(st.detail ? `Paiement refusé ou annulé (${st.detail}).` : 'Paiement refusé ou annulé.')
        return
      }
      if (st.poll === 'paid') {
        stopSumupPoll()
        sumupSessionRef.current = null
        setSumupPhase('idle')
        completeSumupSuccess()
      }
    }, SUMUP_POLL_MS)
  }, [totalCents, cardChargeCents, completeSumupSuccess, stopSumupPoll, onPaid, cashGiven])

  const prevStepRef = useRef<Step>('choose')
  useEffect(() => {
    if (step === 'card' && prevStepRef.current !== 'card') {
      setSumupPhase('idle')
      setSumupErr(null)
      stopSumupPoll()
      terminalAutoStartedRef.current = false
    }
    prevStepRef.current = step
  }, [step, stopSumupPoll])

  useEffect(() => {
    if (!open || step !== 'card' || !effectiveSumup || !effectiveTermAuto) return
    if (terminalAutoStartedRef.current) return
    if (sumupPhase !== 'idle') return
    terminalAutoStartedRef.current = true
    void startSumup()
  }, [open, step, effectiveSumup, effectiveTermAuto, sumupPhase, startSumup])

  useEffect(() => {
    if (!onPaymentDisplayUpdate) return
    if (!open) {
      onPaymentDisplayUpdate(null)
      return
    }
    if (step === 'choose') {
      onPaymentDisplayUpdate({ kind: 'choose', totalCents, refundMode })
      return
    }
    if (step === 'cash') {
      onPaymentDisplayUpdate({
        kind: 'cash',
        totalCents,
        refundMode,
        cashGivenCents: cashGiven,
        changeCents,
        shortCents,
        canValidateCash,
        canMixed
      })
      return
    }
    onPaymentDisplayUpdate({
      kind: 'card',
      totalCents,
      cardChargeCents: cardChargeCents ?? totalCents,
      refundMode,
      sumupPhase,
      sumupActive: effectiveSumup,
      terminalAuto: effectiveTermAuto
    })
  }, [
    open,
    step,
    cashGiven,
    changeCents,
    shortCents,
    canValidateCash,
    canMixed,
    totalCents,
    refundMode,
    sumupPhase,
    effectiveSumup,
    effectiveTermAuto,
    cardChargeCents,
    onPaymentDisplayUpdate
  ])

  const payCashOnly = useCallback(() => {
    onPaid({
      mode: 'cash',
      cashCents: cashGiven,
      cardCents: 0,
      changeCents: changeCents
    })
  }, [onPaid, cashGiven, changeCents])

  /** Espèces : montant reçu = total, sans rendu (pas de tap sur les vignettes). */
  const payCashExactTotal = useCallback(() => {
    if (totalCents < 0) return
    onPaid({
      mode: 'cash',
      cashCents: totalCents,
      cardCents: 0,
      changeCents: 0
    })
  }, [onPaid, totalCents])

  const payMixed = useCallback(() => {
    onPaid({
      mode: 'mixed',
      cashCents: cashGiven,
      cardCents: shortCents,
      changeCents: 0
    })
  }, [onPaid, cashGiven, shortCents])

  if (!open) return null

  const coins = EUR_DENOMINATIONS.filter((d) => d.kind === 'coin')
  const notes = EUR_DENOMINATIONS.filter((d) => d.kind === 'note')

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-title"
      onClick={() => void handleBackdropClose()}
    >
      <div className="modal modal-pay" onClick={(e) => e.stopPropagation()}>
        <h3 id="pay-title">{refundMode ? 'Remboursement' : 'Paiement'}</h3>
        <p className="pay-total-line">
          <span>{refundMode ? 'Total à rembourser' : 'Total à payer'}</span>
          <strong className="pay-total-amount">{formatMoney(totalCents)}</strong>
        </p>

        {step === 'choose' && (
          <div className="pay-choose">
            <p className="sub">{refundMode ? 'Comment effectuer le remboursement' : 'Choisissez le mode de règlement'}</p>
            <div className="pay-mode-btns">
              <button type="button" className="btn btn-pay-lg" onClick={() => setStep('cash')}>
                Espèces
              </button>
              <button
                type="button"
                className="btn btn-pay-lg"
                onClick={() => {
                  setCardChargeCents(null)
                  setStep('card')
                }}
              >
                Carte
              </button>
            </div>
            <button type="button" className="btn btn-secondary btn-block-pay" onClick={() => void handleBackdropClose()}>
              Annuler
            </button>
          </div>
        )}

        {step === 'card' && (
          <div className="pay-card">
            {cardChargeCents != null && (
              <p className="pay-total-line">
                <span>Déjà reçu en espèces</span>
                <strong className="pay-total-amount">{formatMoney(cashGiven)}</strong>
              </p>
            )}
            {cardChargeCents != null && (
              <p className="pay-total-line">
                <span>Reste à payer par carte (SumUp)</span>
                <strong className="pay-total-amount">{formatMoney(cardChargeCents)}</strong>
              </p>
            )}
            {effectiveSumup ? (
              <>
                {effectiveTermAuto ? (
                  <p className="sub">
                    {cardChargeCents != null ? (
                      <>
                        Seul le <strong>reste à payer</strong> est envoyé au terminal Solo (voir ci-dessus). La
                        vente se valide automatiquement après paiement réussi.
                      </>
                    ) : (
                      <>
                        Le <strong>montant total</strong> est envoyé sur votre <strong>SumUp Solo</strong>.
                        Suivez le terminal (carte ou sans contact) — la vente se valide seule après
                        encaissement.
                      </>
                    )}
                  </p>
                ) : (
                  <p className="sub">
                    {cardChargeCents != null
                      ? 'SumUp est sollicité uniquement pour le reste à payer. Si une page s’ouvre dans le navigateur, terminez la transaction : la caisse se met à jour automatiquement.'
                      : 'SumUp ouvre une transaction pour le montant total. Une page peut s’ouvrir dans le navigateur pour finaliser la transaction ; la caisse se met à jour automatiquement.'}
                  </p>
                )}
                {sumupPhase === 'waiting' && (
                  <p className="pay-sumup-wait">
                    {effectiveTermAuto
                      ? 'En attente du terminal Solo… présentez la carte si le terminal le demande.'
                      : 'En attente de la confirmation SumUp…'}
                  </p>
                )}
                {sumupPhase === 'creating' && (
                  <p className="pay-sumup-wait">
                    {effectiveTermAuto ? 'Envoi du montant au terminal…' : 'Connexion à SumUp en cours…'}
                  </p>
                )}
                {sumupErr && <p className="auth-err pay-sumup-err">{sumupErr}</p>}
                {!effectiveTermAuto && (
                  <button
                    type="button"
                    className="btn btn-primary btn-block-pay"
                    disabled={sumupPhase === 'creating' || sumupPhase === 'waiting'}
                    onClick={() => void startSumup()}
                  >
                    {sumupPhase === 'idle' || sumupPhase === 'error'
                      ? 'Payer avec SumUp'
                      : 'Transaction SumUp en cours…'}
                  </button>
                )}
                {effectiveTermAuto && sumupPhase === 'error' && (
                  <button type="button" className="btn btn-primary btn-block-pay" onClick={() => void startSumup()}>
                    Réessayer l’envoi au terminal Solo
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-block-pay"
                  disabled={sumupPhase === 'waiting'}
                  onClick={() => {
                    if (cardChargeCents != null) {
                      onPaid({
                        mode: 'mixed',
                        cashCents: cashGiven,
                        cardCents: cardChargeCents,
                        changeCents: 0
                      })
                    } else {
                      payCardOnly()
                    }
                  }}
                >
                  {refundMode
                    ? 'Confirmer le remboursement carte (manuel)'
                    : cardChargeCents != null
                      ? 'Enregistrer sans SumUp (espèces + complément carte, manuel)'
                      : 'Enregistrer le paiement carte sans passer par SumUp'}
                </button>
              </>
            ) : (
              <>
                <p className="sub">
                  {cardChargeCents != null
                    ? refundMode
                      ? 'Saisie manuelle du complément par carte (hors SumUp).'
                      : 'Encaissement manuel du reste par carte après espèces (hors SumUp).'
                    : refundMode
                      ? 'Enregistrement manuel du remboursement par carte (montant total, hors SumUp).'
                      : 'Encaissement par carte bancaire pour le montant total.'}
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block-pay"
                  onClick={() => {
                    if (cardChargeCents != null) {
                      onPaid({
                        mode: 'mixed',
                        cashCents: cashGiven,
                        cardCents: cardChargeCents,
                        changeCents: 0
                      })
                    } else {
                      payCardOnly()
                    }
                  }}
                >
                  {refundMode
                    ? 'Confirmer le remboursement carte'
                    : cardChargeCents != null
                      ? 'Valider espèces + complément carte (manuel)'
                      : 'Valider le paiement carte'}
                </button>
              </>
            )}
            <button type="button" className="btn btn-secondary btn-block-pay" onClick={() => void goBackFromCard()}>
              Retour
            </button>
          </div>
        )}

        {step === 'cash' && (
          <div className="pay-cash">
            <p className="sub">
              {refundMode
                ? 'Indiquez les espèces remises au client (tap sur les vignettes), ou validez directement le montant exact.'
                : 'Indiquez les pièces et billets reçus du client (tap sur les vignettes), ou encaissez le montant exact en un clic.'}
            </p>
            {totalCents >= 0 && (
              <button
                type="button"
                className="btn btn-primary btn-block-pay pay-cash-exact-btn"
                onClick={payCashExactTotal}
              >
                {refundMode
                  ? `Rembourser ${formatMoney(totalCents)} en espèces (montant exact)`
                  : totalCents > 0
                    ? `Encaisser ${formatMoney(totalCents)} en espèces (montant exact)`
                    : 'Valider la vente à 0,00 € (espèces)'}
              </button>
            )}
            <div className="denom-section">
              <span className="denom-title">Pièces</span>
              <div className="denom-grid">
                {coins.map((d) => (
                  <button
                    key={d.cents}
                    type="button"
                    className="denom-chip"
                    onClick={() => addDenom(d.cents)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="denom-section">
              <span className="denom-title">Billets</span>
              <div className="denom-grid denom-notes">
                {notes.map((d) => (
                  <button
                    key={d.cents}
                    type="button"
                    className="denom-chip denom-note"
                    onClick={() => addDenom(d.cents)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pay-summary">
              <div className="pay-row">
                <span>{refundMode ? 'Remboursé (espèces)' : 'Encaissé (espèces)'}</span>
                <span className="mono strong">{formatMoney(cashGiven)}</span>
              </div>
              {canValidateCash && (
                <div className="pay-row highlight">
                  <span>{refundMode ? 'Excédent (ne pas remettre)' : 'Rendu monnaie'}</span>
                  <span className="mono strong accent">{formatMoney(changeCents)}</span>
                </div>
              )}
              {canMixed && (
                <div className="pay-row warn">
                  <span>{refundMode ? 'Reste à rembourser' : 'Reste à payer'}</span>
                  <span className="mono strong">{formatMoney(shortCents)}</span>
                </div>
              )}
            </div>

            <div className="pay-actions-col">
              {canValidateCash && (
                <button type="button" className="btn btn-primary btn-block-pay" onClick={payCashOnly}>
                  {refundMode ? 'Valider le remboursement (espèces)' : 'Valider (espèces)'}
                </button>
              )}
              {canMixed && (
                <button
                  type="button"
                  className="btn btn-primary btn-block-pay"
                  onClick={() => {
                    if (effectiveSumup) {
                      setCardChargeCents(shortCents)
                      setStep('card')
                    } else {
                      payMixed()
                    }
                  }}
                >
                  {effectiveSumup
                    ? `Espèces + reste en SumUp (${formatMoney(shortCents)})`
                    : `Espèces + reste en carte (${formatMoney(shortCents)})`}
                </button>
              )}
              <div className="pay-row-btns">
                <button type="button" className="btn btn-secondary" onClick={clearCash}>
                  Réinitialiser les espèces
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setStep('choose')}>
                  Retour
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
