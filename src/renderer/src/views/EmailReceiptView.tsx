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
      <div className="page-inner">
        <h2 className="page-title">E-mail — tickets récapitulatifs</h2>
        <p className="page-desc">
          Configuration du <strong>serveur SMTP</strong> pour envoyer depuis l’application le ticket récapitulatif
          en <strong>PDF</strong>, comme à l’impression. Sans SMTP, depuis l’<strong>Historique</strong>, un lien{' '}
          <strong>mailto</strong> prépare le message dans votre messagerie.
        </p>

        <div className="card form-card">
          <label className="check-label block-check">
            <input
              type="checkbox"
              checked={er.enabled}
              onChange={(e) => patchEmailReceipt({ enabled: e.target.checked })}
            />
            <span>Activer l’envoi SMTP</span>
          </label>
          <div className="form-grid" style={{ marginTop: '0.75rem' }}>
            <label className="field">
              <span>Serveur SMTP</span>
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
            <label className="check-label block-check">
              <input
                type="checkbox"
                checked={er.secure}
                onChange={(e) => patchEmailReceipt({ secure: e.target.checked })}
              />
              <span>Connexion TLS directe (souvent port 465)</span>
            </label>
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

          <div className="email-from-block">
            <label className="field">
              <span>Adresse expéditrice (champ « De » / From)</span>
              <p className="email-from-hint">
                Adresse utilisée pour les tickets depuis l’historique. Forme simple{' '}
                <code className="mono">tresorier@association.fr</code> ou avec nom affiché :{' '}
                <code className="mono">Buvette Trésor &lt;tresorier@association.fr&gt;</code>
              </p>
              <input
                type="text"
                className="mono email-from-input"
                autoComplete="off"
                spellCheck={false}
                placeholder={`ex. Buvette <tresorier@association.fr>`}
                value={er.fromAddress}
                onChange={(e) => patchEmailReceipt({ fromAddress: e.target.value })}
              />
            </label>
          </div>

          <div className="email-smtp-test">
            <h3 className="card-title email-smtp-test-title">Test du serveur</h3>
            <p className="page-desc email-smtp-test-desc">
              <strong>Vérifier la connexion</strong> ouvre une fenêtre pendant le test, puis le résultat.{' '}
              <strong>E-mail de test</strong> fait de même pour l’envoi : par défaut vers l’expéditeur, ou vers
              l’adresse ci-dessous.
            </p>
            <label className="field">
              <span>Destinataire du message de test (optionnel)</span>
              <input
                type="email"
                autoComplete="off"
                className="mono"
                placeholder="Vide = envoi à l’adresse expéditrice"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
              />
            </label>
            <div className="email-smtp-test-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!er.enabled || busy}
                onClick={() => void runVerify()}
              >
                Vérifier la connexion SMTP
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
          </div>
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
