import { useCallback, useEffect, useState } from 'react'
import BootChrome from '@renderer/components/BootChrome'

type Item = {
  id: string
  displayName: string
  licenseAssociationCode: string | null
  licenseAllowed: boolean
  licenseReason: string | null
}

export default function AssociationPicker({
  onOpen,
  onOpenLicense
}: {
  onOpen: (id: string) => void | Promise<void>
  /** Accès administration : écran licence (avant connexion à une association). */
  onOpenLicense?: () => void
}): JSX.Element {
  const [items, setItems] = useState<Item[]>([])
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newLicenseCode, setNewLicenseCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Item | null>(null)
  const [removePin, setRemovePin] = useState('')
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [removeBusy, setRemoveBusy] = useState(false)

  const refresh = useCallback(async () => {
    const r = await window.caisse.listAssociations()
    if (r.ok) {
      setItems(r.items)
      setLastSelectedId(r.lastSelectedId)
    }
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
        setNewName('')
        setNewLicenseCode('')
        await refresh()
      } else if (r.error === 'license') {
        setCreateErr(r.message)
      }
    } finally {
      setCreating(false)
    }
  }, [creating, newName, newLicenseCode, refresh])

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
      subtitle="Choisissez une association installée sur ce poste, ou créez-en une nouvelle."
      actions={licenseBtn}
    >
      <div className="assoc-picker-layout">
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
              <div className="assoc-picker-continue-label">Dernière session</div>
              <button
                type="button"
                className="btn btn-primary assoc-picker-continue-btn"
                disabled={!last.licenseAllowed}
                title={!last.licenseAllowed && last.licenseReason ? last.licenseReason : undefined}
                onClick={() => void onOpen(last.id)}
              >
                Reprendre « {last.displayName} »
              </button>
              {!last.licenseAllowed && last.licenseReason && (
                <p className="assoc-picker-license-block-msg">{last.licenseReason}</p>
              )}
            </div>
          )}

          <ul className="assoc-picker-list">
            {items.map((it) => (
              <li
                key={it.id}
                className={`assoc-picker-row${!it.licenseAllowed ? ' assoc-picker-row-blocked' : ''}`}
              >
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
                    disabled={!it.licenseAllowed}
                    title={!it.licenseAllowed && it.licenseReason ? it.licenseReason : undefined}
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
              Nom du club, buvette ou comité. Le <strong>code association</strong> est requis si la licence est
              une <strong>clé courte</strong> ; laisser vide pour un <strong>jeton long</strong>.
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
                  const t = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
                  setNewLicenseCode(t)
                }}
                placeholder="ex. AB12CD"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            {createErr && <p className="sub export-msg assoc-picker-create-err">{createErr}</p>}
            <button
              type="button"
              className="btn btn-primary"
              disabled={!newName.trim() || creating}
              onClick={() => void onCreate()}
            >
              {creating ? 'Création…' : 'Créer l’association'}
            </button>
          </div>
        </aside>
      </div>

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
