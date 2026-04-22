import { useCallback, useEffect, useState } from 'react'
import BootChrome from '@renderer/components/BootChrome'

type Props = {
  onBack: () => void
}

export default function LicenseView({ onBack }: Props): JSX.Element {
  const [draft, setDraft] = useState('')
  const [lic, setLic] = useState<Awaited<ReturnType<typeof window.caisse.getLicense>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [userDataRoot, setUserDataRoot] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [l, paths] = await Promise.all([window.caisse.getLicense(), window.caisse.getAppPaths()])
    setLic(l)
    setUserDataRoot(paths.userDataRoot)
    setDraft('')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onSave = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      await window.caisse.setLicense(draft.trim())
      setMsg(
        'Clé enregistrée. Ouvrez une association : la licence doit couvrir son identifiant (jeton long) ou son code (clé courte).'
      )
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, draft, refresh])

  const onClear = useCallback(async () => {
    if (busy) return
    if (!window.confirm('Retirer la clé enregistrée sur cet ordinateur ?')) return
    setBusy(true)
    setMsg(null)
    try {
      await window.caisse.setLicense('')
      setMsg('Clé supprimée de cette installation.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh])

  const badgeLabel = (() => {
    if (!lic) return '…'
    switch (lic.displayStatus) {
      case 'valid':
        return 'Valide (CAISSE_LICENCE)'
      case 'invalid':
        return 'Refusée'
      case 'unconfigured':
        return 'Clés serveur absentes'
      default:
        return 'Aucune clé'
    }
  })()

  const maskedKey = lic?.maskedKey ?? '—'

  return (
    <BootChrome
      title="Licence & activation"
      subtitle="Module CAISSE_LICENCE — jeton signé ou clé courte."
      actions={
        <button type="button" className="btn btn-secondary pro-boot-btn-outline" onClick={onBack}>
          ← Associations
        </button>
      }
    >
      <div className="license-stack">
        <p className="license-lead pro-lead">
          Déposez <code className="mono">public.pem</code> et/ou <code className="mono">master.secret</code> dans le
          dossier <code className="mono">caisse-license</code> des données applicatives, puis saisissez la clé
          fournie.
        </p>

        <div className="card form-card license-status-card pro-card-elevated">
          <h3 className="card-title">État</h3>
          <p className="license-version">
            Version logicielle <strong className="mono">{window.caisse.version}</strong>
          </p>
          <p className="license-line">
            <span className="license-label">Aperçu clé</span>
            <span className="mono license-masked">{maskedKey}</span>
          </p>
          <p className="license-line">
            <span className="license-label">Vérification</span>
            <span
              className={`license-badge license-badge--${
                lic?.displayStatus === 'valid'
                  ? 'active'
                  : lic?.displayStatus === 'invalid'
                    ? 'err'
                    : lic?.displayStatus === 'unconfigured'
                      ? 'warn'
                      : 'inactive'
              }`}
            >
              {badgeLabel}
            </span>
          </p>
          {lic?.mode && lic.mode !== 'none' && (
            <p className="license-line">
              <span className="license-label">Type détecté</span>
              <span className="mono">{lic.mode === 'long' ? 'Jeton long (signé)' : 'Clé courte'}</span>
            </p>
          )}
          {lic?.reason && lic.displayStatus !== 'inactive' && (
            <p className="page-desc license-msg">{lic.reason}</p>
          )}
          {lic?.detail && <p className="page-desc license-msg">{lic.detail}</p>}
          {lic?.payloadSummary && lic.displayStatus === 'valid' && (
            <div className="license-payload">
              <p>
                <span className="license-label">Type licence :</span> {lic.payloadSummary.type}
              </p>
              <p>
                <span className="license-label">Expire :</span>{' '}
                {lic.payloadSummary.expiresAt
                  ? new Date(lic.payloadSummary.expiresAt).toLocaleString('fr-FR')
                  : 'sans date'}
              </p>
              <p>
                <span className="license-label">Identifiants couverts :</span>{' '}
                {lic.payloadSummary.associationsLabel}
              </p>
            </div>
          )}
          {lic?.keysHint && (
            <p className="page-desc license-hint" style={{ marginTop: '0.75rem' }}>
              {lic.keysHint}
            </p>
          )}
          <p className="page-desc license-hint" style={{ marginTop: '0.75rem' }}>
            <strong>Jeton long :</strong> la liste d’identifiants contient l’UUID de l’association (tel qu’affiché
            dans les exports techniques). <strong>Clé courte :</strong> utilisez le même code qu’au menu
            Association (2 à 6 caractères) que dans la licence.
          </p>
        </div>

        <div className="card form-card pro-card-elevated">
          <h3 className="card-title">Enregistrer la clé ou le jeton</h3>
          <label className="field">
            <span>Contenu (une seule clé ou jeton)</span>
            <textarea
              className="mono license-textarea"
              rows={5}
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Jeton long (base64…) ou clé courte (groupes hex)"
            />
          </label>
          <div className="license-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSave()}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || maskedKey === '—'}
              onClick={() => void onClear()}
            >
              Supprimer la clé locale
            </button>
          </div>
          {msg && <p className="sub export-msg license-msg">{msg}</p>}
        </div>

        {userDataRoot && (
          <details className="license-details">
            <summary>Dossier données & emplacement caisse-license</summary>
            <p className="mono license-path">{userDataRoot}</p>
            <p className="page-desc">
              Créez si besoin <code className="mono">caisse-license</code> à côté des fichiers JSON et copiez-y
              les fichiers fournis par l’équipe licence (issus de <code className="mono">npm run keys</code> dans
              le dépôt CAISSE_LICENCE).
            </p>
          </details>
        )}
      </div>
    </BootChrome>
  )
}
