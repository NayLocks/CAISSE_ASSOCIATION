import { useCallback, useEffect, useState } from 'react'
import type { EmailReceiptConfig } from '@shared/catalog'
import { useAppState } from '@renderer/state/AppStateContext'

type SmtpDialog =
  | null
  | { step: 'verify'; status: 'running' }
  | { step: 'verify'; status: 'done'; ok: boolean; text: string }
  | { step: 'send'; status: 'running' }
  | { step: 'send'; status: 'done'; ok: boolean; text: string }

export default function EmailReceiptView(): JSX.Element {
  const { data, setData } = useAppState()
  const [testTo, setTestTo] = useState('')
  const [dialog, setDialog] = useState<SmtpDialog>(null)

  const patchEmailReceipt = useCallback(
    (patch: Partial<EmailReceiptConfig>) => {
      setData((prev) => ({
        ...prev,
        emailReceipt: { ...prev.emailReceipt, ...patch }
      }))
    },
    [setData]
  )

  const er = data.emailReceipt
  const busy = dialog?.status === 'running'

  useEffect(() => {
    if (!dialog || dialog.status !== 'done') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDialog(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog])

  const closeDialog = useCallback(() => {
    setDialog(null)
  }, [])

  const runVerify = useCallback(async () => {
    setDialog({ step: 'verify', status: 'running' })
    try {
      const r = await window.caisse.testEmailSmtp({ mode: 'verify' })
      setDialog({
        step: 'verify',
        status: 'done',
        ok: r.ok,
        text: r.ok ? r.message : r.error
      })
    } catch (e) {
      setDialog({
        step: 'verify',
        status: 'done',
        ok: false,
        text: e instanceof Error ? e.message : String(e)
      })
    }
  }, [])

  const runSendTest = useCallback(async () => {
    setDialog({ step: 'send', status: 'running' })
    try {
      const r = await window.caisse.testEmailSmtp({
        mode: 'send',
        testTo: testTo.trim() || undefined
      })
      setDialog({
        step: 'send',
        status: 'done',
        ok: r.ok,
        text: r.ok ? r.message : r.error
      })
    } catch (e) {
      setDialog({
        step: 'send',
        status: 'done',
        ok: false,
        text: e instanceof Error ? e.message : String(e)
      })
    }
  }, [testTo])

  const backdropClose = useCallback(() => {
    if (dialog?.status === 'done') closeDialog()
  }, [dialog, closeDialog])

  return (
    <div className="page page-scroll">
      <div className="page-inner email-receipt-page">
        <header className="email-receipt-head">
          <h2 className="page-title">E-mail — ticket récapitulatif (PDF)</h2>
          <p className="page-desc email-receipt-head__lead">
            Depuis l’historique de vente, vous pouvez envoyer le même récapitulatif qu’à l’impression, en pièce jointe
            PDF.
          </p>
          <p
            className={
              er.enabled ? 'email-rcpt-status email-rcpt-status--on' : 'email-rcpt-status email-rcpt-status--off'
            }
            role="status"
          >
            {er.enabled
              ? 'Envoi direct par l’application (SMTP) : activé.'
              : 'Envoi par la messagerie du poste : lien mailto dans l’historique.'}
          </p>
        </header>

        <div className="email-receipt-stack">
          <section className="card form-card email-receipt-card" aria-labelledby="email-rcpt-intro-title">
            <h3 id="email-rcpt-intro-title" className="email-rcpt-card-title">
              Deux façons d’envoyer
            </h3>
            <p className="email-rcpt-card-lead">
              Choisissez une seule approche selon que votre association dispose d’un compte SMTP (hébergeur, Google
              Workspace, etc.) ou préfère la boîte mail déjà installée sur le PC.
            </p>
            <div className="email-rcpt-intro-grid">
              <div className="email-rcpt-intro-panel">
                <div className="email-rcpt-intro-panel__label">Sans SMTP dans l’app</div>
                <ul className="email-rcpt-intro-panel__list">
                  <li>Aucun mot de passe stocké dans l’application.</li>
                  <li>L’historique ouvre votre messagerie avec un brouillon (mailto + PDF en pièce jointe si pris en charge).</li>
                </ul>
              </div>
              <div className="email-rcpt-intro-panel email-rcpt-intro-panel--accent">
                <div className="email-rcpt-intro-panel__label">Avec SMTP</div>
                <ul className="email-rcpt-intro-panel__list">
                  <li>L’app envoie elle-même l’e-mail (pièce jointe PDF identique à l’impression).</li>
                  <li>Indispensable si vous voulez un envoi « en un clic » sans ouvrir Outlook / Thunderbird.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="card form-card email-receipt-card">
            <label className="check-label block-check email-rcpt-toggle">
              <input
                type="checkbox"
                checked={er.enabled}
                onChange={(e) => patchEmailReceipt({ enabled: e.target.checked })}
              />
              <span>Activer l’envoi SMTP depuis l’application</span>
            </label>
            <p className="email-rcpt-lead-muted">
              Lorsque cette option est désactivée, les champs ci-dessous sont ignorés ; l’historique continue de proposer
              le lien mailto.
            </p>

            <div className="email-rcpt-subsection">
              <h3 className="email-rcpt-subtitle">Serveur</h3>
              <div className="form-row email-rcpt-host-row">
                <label className="field">
                  <span>Hôte SMTP</span>
                  <input
                    type="text"
                    className="mono"
                    autoComplete="off"
                    placeholder="ex. smtp.monhebergeur.fr"
                    value={er.host}
                    onChange={(e) => patchEmailReceipt({ host: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Port</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    className="mono"
                    value={er.port || ''}
                    onChange={(e) =>
                      patchEmailReceipt({
                        port: Math.min(65535, Math.max(1, Number(e.target.value) || 587))
                      })
                    }
                  />
                </label>
              </div>
              <label className="check-label block-check email-rcpt-tls-row">
                <input
                  type="checkbox"
                  checked={er.secure}
                  onChange={(e) => patchEmailReceipt({ secure: e.target.checked })}
                />
                <span>TLS direct (souvent port 465 — à activer uniquement si votre fournisseur l’exige)</span>
              </label>
            </div>

            <div className="email-rcpt-subsection">
              <h3 className="email-rcpt-subtitle">Compte sur le serveur</h3>
              <p className="email-rcpt-field-hint">
                Souvent identique à une boîte « no-reply » ou « tresorier » fournie par l’hébergeur.
              </p>
              <div className="form-grid">
                <label className="field">
                  <span>Identifiant</span>
                  <input
                    type="text"
                    autoComplete="username"
                    value={er.user}
                    onChange={(e) => patchEmailReceipt({ user: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Mot de passe</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={er.password}
                    onChange={(e) => patchEmailReceipt({ password: e.target.value })}
                  />
                </label>
              </div>
            </div>

            <div className="email-rcpt-subsection">
              <h3 className="email-rcpt-subtitle">Adresse affichée « De » (From)</h3>
              <p className="email-rcpt-field-hint">
                Adresse vue par le client. Exemples : <code className="mono">tresorier@association.fr</code> ou{' '}
                <code className="mono">Buvette &lt;tresorier@association.fr&gt;</code>
              </p>
              <label className="field">
                <span className="sr-only">From</span>
                <input
                  type="text"
                  className="mono email-from-input"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ex. Buvette <tresorier@association.fr>"
                  value={er.fromAddress}
                  onChange={(e) => patchEmailReceipt({ fromAddress: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="card form-card email-receipt-card email-rcpt-tests" aria-labelledby="email-rcpt-tests-title">
            <h3 id="email-rcpt-tests-title" className="email-rcpt-card-title">
              Vérifier avant la vente
            </h3>
            <p className="email-rcpt-tests-desc">
              Les tests ne partent pas en caisse : ils confirment que le serveur répond, puis qu’un message peut être
              envoyé. La fenêtre de progression se ferme dès le résultat.
            </p>
            <label className="field">
              <span>Destinataire du message de test (facultatif)</span>
              <input
                type="email"
                autoComplete="off"
                className="mono"
                placeholder="Si vide : envoi vers l’adresse « From » ci-dessus"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </label>
            <div className="email-rcpt-test-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!er.enabled || busy}
                onClick={() => void runVerify()}
              >
                Tester la connexion
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!er.enabled || busy}
                onClick={() => void runSendTest()}
              >
                Envoyer un e-mail de test
              </button>
            </div>
          </section>
        </div>
      </div>

      {dialog && (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="smtp-dialog-title"
          onClick={() => backdropClose()}
        >
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            {dialog.step === 'verify' && dialog.status === 'running' && (
              <>
                <h3 id="smtp-dialog-title">Vérification de la connexion</h3>
                <p className="sub">Connexion au serveur SMTP en cours…</p>
                <p className="email-smtp-modal-wait" aria-live="polite">
                  Veuillez patienter.
                </p>
              </>
            )}
            {dialog.step === 'verify' && dialog.status === 'done' && (
              <>
                <h3 id="smtp-dialog-title">
                  {dialog.ok ? 'Connexion réussie' : 'Connexion impossible'}
                </h3>
                <p className={dialog.ok ? 'email-smtp-modal-body email-smtp-modal-ok' : 'email-smtp-modal-body email-smtp-modal-err'}>
                  {dialog.text}
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn btn-primary" onClick={closeDialog}>
                    Fermer
                  </button>
                </div>
              </>
            )}
            {dialog.step === 'send' && dialog.status === 'running' && (
              <>
                <h3 id="smtp-dialog-title">Envoi du message de test</h3>
                <p className="sub">Envoi en cours via le serveur SMTP…</p>
                <p className="email-smtp-modal-wait" aria-live="polite">
                  Veuillez patienter.
                </p>
              </>
            )}
            {dialog.step === 'send' && dialog.status === 'done' && (
              <>
                <h3 id="smtp-dialog-title">
                  {dialog.ok ? 'E-mail de test envoyé' : 'E-mail de test non envoyé'}
                </h3>
                <p className={dialog.ok ? 'email-smtp-modal-body email-smtp-modal-ok' : 'email-smtp-modal-body email-smtp-modal-err'}>
                  {dialog.text}
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn btn-primary" onClick={closeDialog}>
                    Fermer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
