import { useCallback, useEffect, useState } from 'react'
import BootChrome from '@renderer/components/BootChrome'
import { useToast } from '@renderer/state/ToastContext'

type Item = {
  id: string
  displayName: string
  licenseAssociationCode: string | null
  logoDataUrl: string | null
}

export default function AssociationPicker({
  onOpen,
  onOpenLicense
}: {
  onOpen: (id: string) => void | Promise<void>
  /** Accès administration : écran licence (avant connexion à une association). */
  onOpenLicense?: () => void
}): JSX.Element {
  const { showToast } = useToast()
  const [items, setItems] = useState<Item[]>([])
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [licenseOkForAsso, setLicenseOkForAsso] = useState(false)
  const [licenseAssoMsg, setLicenseAssoMsg] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newLicenseCode, setNewLicenseCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Item | null>(null)
  const [removePin, setRemovePin] = useState('')
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  /** Code déjà connu côté serveur (license-lookup) : proposer l’envoi d’une demande à l’admin. */
  const [duplicateModal, setDuplicateModal] = useState<{
    code: string
    serverName: string
    /** Renvoyé par le processus principal (détail licence vs fiche catalogue seule). */
    message?: string
  } | null>(null)
  const [adminNotifyBusy, setAdminNotifyBusy] = useState(false)

  const refresh = useCallback(async () => {
    const [r, lic] = await Promise.all([window.caisse.listAssociations(), window.caisse.getLicense()])
    if (r.ok) {
      setItems(r.items)
      setLastSelectedId(r.lastSelectedId)
    }
    const ok = lic.displayStatus === 'valid'
    setLicenseOkForAsso(ok)
    setLicenseAssoMsg(
      ok ? null : (lic.reason ?? 'Enregistrez une licence valide via « Licence & activation » pour continuer.')
    )
  }, [])

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    void window.caisse.setClientDisplaySessionOpen(false)
  }, [])

  const onCreate = useCallback(async () => {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    setCreateErr(null)
    try {
      const r = await window.caisse.createAssociation({
        displayName: name,
        licenseAssociationCode: newLicenseCode
      })
      if (r.ok) {
        if ('result' in r && r.result === 'admin_notified') {
          showToast({ message: r.message ?? 'Demande enregistrée.', variant: 'success' })
          setDuplicateModal(null)
        } else {
          setNewName('')
          setNewLicenseCode('')
          setDuplicateModal(null)
        }
        await refresh()
      } else {
        if (r.error === 'code_exists') {
          setDuplicateModal({
            code: (r.code ?? newLicenseCode).trim(),
            serverName: (r.serverName ?? '—').trim(),
            message: typeof r.message === 'string' ? r.message : undefined
          })
        } else {
          setCreateErr(r.message ?? 'Création impossible.')
        }
      }
    } finally {
      setCreating(false)
    }
  }, [creating, newName, newLicenseCode, refresh, showToast])

  const onConfirmAdminRequest = useCallback(async () => {
    if (!duplicateModal || adminNotifyBusy) return
    const name = newName.trim()
    if (!name) return
    setDuplicateModal(null)
    setAdminNotifyBusy(true)
    setCreateErr(null)
    try {
      const r = await window.caisse.createAssociation({
        displayName: name,
        licenseAssociationCode: newLicenseCode,
        adminRequest: true
      })
      if (r.ok && 'result' in r && r.result === 'admin_notified') {
        showToast({ message: r.message ?? 'Demande enregistrée.', variant: 'success' })
        await refresh()
      } else if (!r.ok) {
        setCreateErr(r.message ?? 'Envoi de la demande impossible.')
      }
    } finally {
      setAdminNotifyBusy(false)
    }
  }, [adminNotifyBusy, duplicateModal, newName, newLicenseCode, refresh, showToast])

  const onRemoveConfirm = useCallback(async () => {
    if (!removeTarget || removeBusy) return
    setRemoveBusy(true)
    setRemoveErr(null)
    try {
      const r = await window.caisse.removeAssociation({
        id: removeTarget.id,
        pin: removePin
      })
      if (r.ok) {
        setRemoveTarget(null)
        setRemovePin('')
        await refresh()
      } else if (r.error === 'wrong_pin') {
        setRemoveErr('Code PIN incorrect.')
      } else if (r.error === 'no_pin') {
        setRemoveErr('Définissez d’abord un code PIN dans cette association.')
      } else {
        setRemoveErr('Suppression impossible.')
      }
    } finally {
      setRemoveBusy(false)
    }
  }, [removeBusy, removePin, removeTarget, refresh])

  if (loading) {
    return (
      <BootChrome title="Chargement" subtitle="Préparation de la liste des associations…">
        <div className="pro-boot-loading">
          <div className="pro-boot-spinner" aria-hidden />
          <p className="pro-boot-loading-text">Un instant…</p>
        </div>
      </BootChrome>
    )
  }

  const last = lastSelectedId ? items.find((x) => x.id === lastSelectedId) : null

  const licenseBtn =
    onOpenLicense != null ? (
      <button type="button" className="btn btn-secondary pro-boot-btn-outline" onClick={onOpenLicense}>
        Licence & activation
      </button>
    ) : null

  return (
    <BootChrome
      title="Ouvrir une session"
      subtitle="Une licence valide est obligatoire. Ensuite, choisissez une association ou créez-en une nouvelle."
      actions={licenseBtn}
    >
      <div className="assoc-picker-layout">
        {licenseAssoMsg && (
          <div className="assoc-picker-license-banner" role="alert">
            <strong>Licence requise.</strong> {licenseAssoMsg}
          </div>
        )}
        <section className="assoc-picker-main" aria-labelledby="assoc-list-heading">
          <h2 id="assoc-list-heading" className="assoc-picker-section-title">
            Associations
          </h2>
          <p className="assoc-picker-hint">
            Après ouverture, le <strong>code PIN</strong> de l’association est demandé. « Supprimer » retire
            uniquement ce profil sur cette machine.
          </p>

          {last && (
            <div className="assoc-picker-continue pro-card-highlight">
              <div
                className={
                  last.logoDataUrl
                    ? 'assoc-picker-continue-top assoc-picker-continue-top--with-logo'
                    : 'assoc-picker-continue-top'
                }
              >
                {last.logoDataUrl ? (
                  <div className="assoc-picker-row-logo" aria-hidden>
                    <img src={last.logoDataUrl} alt="" />
                  </div>
                ) : null}
                <div className="assoc-picker-continue-top-text">
                  <div className="assoc-picker-continue-label">Dernière session</div>
                  <button
                    type="button"
                    className="btn btn-primary assoc-picker-continue-btn"
                    onClick={() => void onOpen(last.id)}
                  >
                    Reprendre « {last.displayName} »
                  </button>
                </div>
              </div>
            </div>
          )}

          {licenseOkForAsso && items.length === 0 && (
            <p className="page-desc assoc-picker-empty" role="status">
              Aucun profil local ne correspond à cette licence. Vérifiez les codes association (identiques au
              serveur) ou utilisez <strong>Mettre à jour les données de la licence</strong> depuis l’écran
              d’activation, puis recréez un profil si besoin.
            </p>
          )}

          <ul className="assoc-picker-list">
            {items.map((it) => (
              <li key={it.id} className="assoc-picker-row">
                {it.logoDataUrl ? (
                  <div className="assoc-picker-row-logo" aria-hidden>
                    <img src={it.logoDataUrl} alt="" />
                  </div>
                ) : null}
                <div className="assoc-picker-row-main">
                  <span className="assoc-picker-name">{it.displayName}</span>
                  {it.licenseAssociationCode ? (
                    <span className="assoc-picker-code mono">Code {it.licenseAssociationCode}</span>
                  ) : null}
                </div>
                <div className="assoc-picker-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void onOpen(it.id)}
                  >
                    Ouvrir
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setRemoveTarget(it)}>
                    Supprimer…
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="assoc-picker-side" aria-labelledby="assoc-create-heading">
          <div className="card form-card assoc-picker-create pro-card-elevated">
            <h3 id="assoc-create-heading" className="card-title">
              Nouvelle association
            </h3>
            <p className="page-desc assoc-picker-create-hint">
              Nom du club, buvette ou comité. Indiquez un <strong>code association</strong> unique (1 à 32 caractères :
              lettres, chiffres, tiret ou souligné). Il est enregistré sur le serveur de licences puis sur cette
              machine.
            </p>
            <label className="field">
              <span>Nom affiché</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="ex. Buvette — Club sportif des Lilas"
                autoComplete="organization"
              />
            </label>
            <label className="field">
              <span>Code association (licence)</span>
              <input
                type="text"
                value={newLicenseCode}
                onChange={(e) => {
                  const t = e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 32)
                  if (!/^[A-Z0-9_-]*$/.test(t)) return
                  setNewLicenseCode(t)
                }}
                placeholder="ex. CLUB-2026 ou AB12_CD"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {createErr && <p className="sub export-msg assoc-picker-create-err">{createErr}</p>}
            {adminNotifyBusy && (
              <p className="sub export-msg" role="status">
                Envoi de la demande à l’administrateur…
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !newName.trim() || !newLicenseCode.trim() || creating || adminNotifyBusy || !licenseOkForAsso
              }
              onClick={() => void onCreate()}
            >
              {creating ? 'Création…' : adminNotifyBusy ? 'Envoi…' : 'Créer l’association'}
            </button>
          </div>
        </aside>
      </div>

      {duplicateModal && (
        <div
          className="assoc-picker-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="assoc-dup-title"
        >
          <div className="assoc-picker-modal card form-card pro-card-elevated">
            <h3 id="assoc-dup-title" className="card-title">
              Code association déjà utilisé
            </h3>
            {duplicateModal.message ? (
              <p className="page-desc" style={{ whiteSpace: 'pre-wrap' }}>
                {duplicateModal.message}
              </p>
            ) : (
              <p className="page-desc">
                Le code <span className="mono">{duplicateModal.code}</span> est déjà enregistré sur le serveur de
                licences pour l’association <strong>« {duplicateModal.serverName} »</strong>.
              </p>
            )}
            <p className="page-desc sub">
              Souhaitez-vous envoyer une <strong>demande à l’administrateur</strong> de cette licence afin
              d’obtenir une prise en charge (nouvel emplacement, modification, etc.) ?
            </p>
            <div className="assoc-picker-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={adminNotifyBusy}
                onClick={() => setDuplicateModal(null)}
              >
                Non
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={adminNotifyBusy}
                onClick={() => void onConfirmAdminRequest()}
              >
                {adminNotifyBusy ? 'Envoi…' : 'Oui, envoyer la demande'}
              </button>
            </div>
          </div>
        </div>
      )}

      {removeTarget && (
        <div className="assoc-picker-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="assoc-del-title">
          <div className="assoc-picker-modal card form-card pro-card-elevated">
            <h3 id="assoc-del-title" className="card-title danger-title">
              Supprimer « {removeTarget.displayName} »
            </h3>
            <p className="page-desc">
              Saisissez le <strong>code PIN</strong> de cette association pour confirmer la suppression locale :
              fichiers de caisse et historique pour ce profil sur cette machine uniquement.
            </p>
            <label className="field">
              <span>Code PIN</span>
              <input
                type="password"
                autoComplete="off"
                value={removePin}
                onChange={(e) => setRemovePin(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onRemoveConfirm()
                }}
              />
            </label>
            {removeErr && <p className="sub export-msg">{removeErr}</p>}
            <div className="assoc-picker-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setRemoveTarget(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-danger-reset"
                disabled={removeBusy || removePin.length < 4}
                onClick={() => void onRemoveConfirm()}
              >
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}
    </BootChrome>
  )
}
