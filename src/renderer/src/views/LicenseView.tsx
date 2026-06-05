import { useCallback, useEffect, useState } from 'react'
import BootChrome from '@renderer/components/BootChrome'

type Props = {
  onBack: () => void
}

/** Même règle que le serveur : majuscules, sans espaces. */
function normalizeLicenseKeyInput(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '')
}

type TestModalState = { ok: boolean; message: string; context?: 'test' | 'save' }

type InventoryRow = Extract<
  Awaited<ReturnType<typeof window.caisse.licenseMachineInventory>>,
  { ok: true }
>['rows'][number]

type UpdateCheckOk = Extract<Awaited<ReturnType<typeof window.caisse.updateCheck>>, { ok: true }>

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function LicenseView({ onBack }: Props): JSX.Element {
  const [lic, setLic] = useState<Awaited<ReturnType<typeof window.caisse.getLicense>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [testModal, setTestModal] = useState<TestModalState | null>(null)
  const [userDataRoot, setUserDataRoot] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState<string>(() => window.caisse.version)

  const [webKey, setWebKey] = useState('')

  const [updateInfo, setUpdateInfo] = useState<UpdateCheckOk | null>(null)
  const [updateErr, setUpdateErr] = useState<string | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [licenseSyncBusy, setLicenseSyncBusy] = useState(false)
  const [licenseSyncMsg, setLicenseSyncMsg] = useState<string | null>(null)
  const [licenseSyncErr, setLicenseSyncErr] = useState<string | null>(null)

  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [inventoryAdminPass, setInventoryAdminPass] = useState('')
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  const [inventoryErr, setInventoryErr] = useState<string | null>(null)
  const [inventoryMachineId, setInventoryMachineId] = useState<string | null>(null)
  const [inventoryFetchedOk, setInventoryFetchedOk] = useState(false)
  const [applyBusyKey, setApplyBusyKey] = useState<string | null>(null)

  useEffect(() => {
    if (!testModal && !inventoryOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTestModal(null)
        setInventoryOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [testModal, inventoryOpen])

  const refresh = useCallback(async () => {
    const [l, paths] = await Promise.all([window.caisse.getLicense(), window.caisse.getAppPaths()])
    setLic(l)
    setUserDataRoot(paths.userDataRoot)
    setAppVersion(paths.appVersion || window.caisse.version)
    if (l.webSettings) {
      setWebKey('')
    } else {
      setWebKey('')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onSaveWeb = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    setTestModal(null)
    try {
      // Même forme que `testLicenseApi` (champs à la racine) pour éviter tout souci de sérialisation IPC.
      const r = await window.caisse.setLicense({
        licenseKey: normalizeLicenseKeyInput(webKey)
      })
      if (!r.ok) {
        setTestModal({
          ok: false,
          message: r.message ?? 'Enregistrement refusé.',
          context: 'save'
        })
        return
      }
      setMsg('Licence enregistrée et poste activé sur le serveur.')
      await refresh()
    } catch (e) {
      setTestModal({
        ok: false,
        message: e instanceof Error ? e.message : 'Erreur lors de l’enregistrement (processus principal).',
        context: 'save'
      })
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, webKey])

  const onTestApi = useCallback(async () => {
    if (testBusy) return
    setTestBusy(true)
    setTestModal(null)
    try {
      const r = await window.caisse.testLicenseApi({
        licenseKey: normalizeLicenseKeyInput(webKey)
      })
      setTestModal({
        ok: r.ok,
        message: r.message || (r.ok ? 'OK' : 'Erreur inconnue.'),
        context: 'test'
      })
    } catch (e) {
      setTestModal({
        ok: false,
        message: e instanceof Error ? e.message : 'Erreur lors de l’appel au processus principal.',
        context: 'test'
      })
    } finally {
      setTestBusy(false)
    }
  }, [testBusy, webKey])

  const onUpdateCheck = useCallback(async () => {
    if (updateBusy) return
    setUpdateBusy(true)
    setUpdateErr(null)
    setUpdateInfo(null)
    try {
      const r = await window.caisse.updateCheck({
        currentVersion: appVersion
      })
      if (!r.ok) {
        setUpdateErr(r.message)
        return
      }
      setUpdateInfo(r)
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : 'Erreur lors de la vérification.')
    } finally {
      setUpdateBusy(false)
    }
  }, [updateBusy, appVersion])

  const onUpdateDownload = useCallback(async () => {
    if (downloadBusy || !updateInfo?.latest) return
    setDownloadBusy(true)
    setUpdateErr(null)
    try {
      const safeName = updateInfo.latest.filename.replace(/[/\\]/g, '_')
      const r = await window.caisse.updateDownload({
        releaseId: updateInfo.latest.release_id,
        suggestedFilename: safeName || `mise-a-jour-${updateInfo.latest.release_id}.msi`
      })
      if (!r.ok) {
        if (!r.cancelled) setUpdateErr(r.message)
        return
      }
      await window.caisse.showAlert({
        title: 'Mise à jour',
        message: `Installateur enregistré. L’explorateur de fichiers a été ouvert à l’emplacement du fichier :\n${r.filePath}`,
        type: 'info'
      })
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : 'Erreur lors du téléchargement.')
    } finally {
      setDownloadBusy(false)
    }
  }, [downloadBusy, updateInfo])

  const onRefreshLicenseData = useCallback(async () => {
    if (licenseSyncBusy || busy) return
    setLicenseSyncBusy(true)
    setLicenseSyncMsg(null)
    setLicenseSyncErr(null)
    try {
      const r = await window.caisse.refreshLicenseData()
      if (!r.ok) {
        setLicenseSyncErr(r.message)
        return
      }
      setLicenseSyncMsg(r.message)
      await refresh()
    } catch (e) {
      setLicenseSyncErr(e instanceof Error ? e.message : 'Erreur lors de la synchronisation.')
    } finally {
      setLicenseSyncBusy(false)
    }
  }, [licenseSyncBusy, busy, refresh])

  const openLicenseInventoryModal = useCallback(() => {
    setInventoryErr(null)
    setInventoryRows([])
    setInventoryMachineId(null)
    setInventoryFetchedOk(false)
    setInventoryOpen(true)
  }, [])

  const onFetchLicenseInventory = useCallback(async () => {
    if (inventoryLoading) return
    const pass = inventoryAdminPass.trim()
    if (!pass) {
      setInventoryErr('Saisissez le code administrateur du serveur (même valeur que purge / licences côté admin WEB_LICENCES).')
      return
    }
    setInventoryLoading(true)
    setInventoryErr(null)
    setInventoryFetchedOk(false)
    try {
      const r = await window.caisse.licenseMachineInventory({ adminPassword: pass })
      if (!r.ok) {
        setInventoryRows([])
        setInventoryMachineId(null)
        setInventoryErr(r.message)
        return
      }
      setInventoryRows(r.rows)
      setInventoryMachineId(r.machineId)
      setInventoryFetchedOk(true)
    } catch (e) {
      setInventoryRows([])
      setInventoryMachineId(null)
      setInventoryErr(e instanceof Error ? e.message : 'Erreur lors de l’appel au processus principal.')
    } finally {
      setInventoryLoading(false)
    }
  }, [inventoryAdminPass, inventoryLoading])

  const onApplyInventoryLicense = useCallback(
    async (licenseKey: string) => {
      if (busy || applyBusyKey) return
      setApplyBusyKey(licenseKey)
      setInventoryErr(null)
      try {
        const r = await window.caisse.setLicense({ licenseKey })
        if (!r.ok) {
          setInventoryErr(r.message ?? 'Enregistrement de la licence refusé.')
          return
        }
        setInventoryOpen(false)
        setInventoryAdminPass('')
        setInventoryRows([])
        setInventoryMachineId(null)
        setMsg('Licence enregistrée et poste activé sur le serveur.')
        await refresh()
      } catch (e) {
        setInventoryErr(
          e instanceof Error ? e.message : 'Erreur lors de l’enregistrement (processus principal).'
        )
      } finally {
        setApplyBusyKey(null)
      }
    },
    [applyBusyKey, busy, refresh]
  )

  const onClearWeb = useCallback(async () => {
    if (busy) return
    if (!window.confirm('Retirer la licence enregistrée sur cet ordinateur ?')) return
    setBusy(true)
    setMsg(null)
    try {
      await window.caisse.setLicense({ web: null })
      setMsg('Licence supprimée de cette installation.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, refresh])

  const badgeLabel = (() => {
    if (!lic) return '…'
    switch (lic.displayStatus) {
      case 'valid':
        return lic.verificationSource === 'offline_grace' ? 'Valide (hors ligne)' : 'Valide'
      case 'invalid':
        return 'Refusée'
      case 'unconfigured':
        return '—'
      default:
        return 'Non configurée'
    }
  })()

  const maskedKey = lic?.maskedKey ?? '—'

  return (
    <BootChrome
      title="Licence & activation"
      subtitle="Vérification en ligne"
      actions={
        <button type="button" className="btn btn-secondary pro-boot-btn-outline" onClick={onBack}>
          ← Associations
        </button>
      }
    >
      <div className="license-stack">
        <p className="license-lead pro-lead">
          Indiquez la clé de licence fournie pour votre projet. Utilisez «&nbsp;Tester l’API&nbsp;» pour vérifier la
          connexion avant d’enregistrer.
        </p>

        <div className="card form-card license-status-card pro-card-elevated">
          <h3 className="card-title">État</h3>
          <p className="license-version">
            Version installée <strong className="mono">{appVersion}</strong>
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
                    : 'inactive'
              }`}
            >
              {badgeLabel}
            </span>
          </p>
          {lic?.mode === 'web' && (
            <p className="license-line">
              <span className="license-label">Mode</span>
              <span className="mono">Licence en ligne</span>
            </p>
          )}
          {lic?.reason && <p className="page-desc license-msg">{lic.reason}</p>}
          {lic?.detail && <p className="page-desc license-msg">{lic.detail}</p>}
          {lic?.payloadSummary && lic.displayStatus === 'valid' && (
            <div className="license-payload">
              <p>
                <span className="license-label">Type :</span> {lic.payloadSummary.type}
              </p>
              <p>
                <span className="license-label">Expire :</span>{' '}
                {lic.payloadSummary.expiresAt
                  ? new Date(lic.payloadSummary.expiresAt).toLocaleString('fr-FR')
                  : 'sans date'}
              </p>
              <p>
                <span className="license-label">Détail :</span> {lic.payloadSummary.associationsLabel}
              </p>
            </div>
          )}
          {lic?.mode === 'web' && lic.hasKey && (
            <div className="license-actions license-status-sync">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={licenseSyncBusy || busy}
                onClick={() => void onRefreshLicenseData()}
              >
                {licenseSyncBusy ? 'Synchronisation…' : 'Mettre à jour les données de la licence'}
              </button>
              <p className="page-desc license-key-hint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                Interroge le serveur : statut, dates, postes, liste d’associations. Crée les profils locaux manquants,
                retire le code licence des profils dont le code n’existe plus sur le serveur (sans effacer la caisse),
                et renouvelle l’activation de ce poste.
              </p>
              {licenseSyncErr && (
                <p className="page-desc license-msg license-msg--err" style={{ marginTop: '0.5rem' }}>
                  {licenseSyncErr}
                </p>
              )}
              {licenseSyncMsg && !licenseSyncErr && (
                <p className="page-desc license-msg license-msg--ok" style={{ marginTop: '0.5rem' }}>
                  {licenseSyncMsg}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card form-card license-update-card pro-card-elevated">
          <h3 className="card-title">Mise à jour du logiciel</h3>
          <p className="license-key-hint license-update-lead">
            Même serveur que pour l’activation. Le code produit est fixe dans l’application ; aucune licence n’est
            requise pour cette vérification.
          </p>
          <div className="license-actions license-update-actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={updateBusy || busy}
              onClick={() => void onUpdateCheck()}
            >
              {updateBusy ? 'Vérification…' : 'Rechercher une mise à jour'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                downloadBusy ||
                busy ||
                !updateInfo?.latest ||
                updateInfo.update_available !== true
              }
              onClick={() => void onUpdateDownload()}
            >
              {downloadBusy ? 'Téléchargement…' : 'Télécharger l’installateur'}
            </button>
          </div>
          {updateErr && <p className="page-desc license-msg license-msg--err">{updateErr}</p>}
          {updateInfo && (
            <div className="license-update-result">
              {updateInfo.latest ? (
                <>
                  <p className="license-line">
                    <span className="license-label">Dernière version sur le serveur</span>
                    <span className="mono">{updateInfo.latest.version}</span>
                  </p>
                  <p className="license-line">
                    <span className="license-label">Fichier</span>
                    <span className="mono">{updateInfo.latest.filename}</span>
                  </p>
                  <p className="license-line">
                    <span className="license-label">Taille</span>
                    <span>{formatFileSize(updateInfo.latest.file_size)}</span>
                  </p>
                </>
              ) : (
                <p className="page-desc license-msg">Aucun installateur publié pour ce logiciel sur le serveur.</p>
              )}
              {updateInfo.version_compare_failed && (
                <p className="page-desc license-msg">
                  La comparaison automatique des numéros de version a échoué (formats non reconnus). Vérifiez manuellement
                  la version affichée ci-dessus.
                </p>
              )}
              {updateInfo.update_available === true && (
                <p className="page-desc license-msg license-msg--ok">
                  Une version plus récente est disponible. Vous pouvez télécharger l’installateur.
                </p>
              )}
              {updateInfo.update_available === false && (
                <p className="page-desc license-msg">Vous utilisez la dernière version connue sur le serveur.</p>
              )}
              {updateInfo.update_available === null && !updateInfo.version_compare_failed && (
                <p className="page-desc license-msg">État de mise à jour indéterminé.</p>
              )}
            </div>
          )}
        </div>

        <div className="card form-card pro-card-elevated">
          <h3 className="card-title">Enregistrer la licence</h3>
          <label className="field">
            <span>Clé de licence</span>
            <input
              type="text"
              className="mono license-key-field"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="characters"
              inputMode="text"
              aria-describedby="license-key-hint"
              value={webKey}
              onChange={(e) => setWebKey(normalizeLicenseKeyInput(e.target.value))}
              placeholder={
                lic?.webSettings?.licenseKeyMasked
                  ? `Ex. ${lic.webSettings.licenseKeyMasked} (nouvelle clé pour remplacer)`
                  : 'Lettres et chiffres, espaces ignorés'
              }
            />
            <p id="license-key-hint" className="license-key-hint">
              Majuscules et espaces normalisés automatiquement. La clé est celle affichée dans l’administration des
              licences.
            </p>
          </label>
          <div className="license-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSaveWeb()}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={testBusy || busy}
              onClick={() => void onTestApi()}
            >
              {testBusy ? 'Test…' : 'Tester l’API'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || lic?.mode !== 'web'}
              onClick={() => void onClearWeb()}
            >
              Supprimer la licence locale
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || inventoryLoading}
              onClick={openLicenseInventoryModal}
            >
              Inventaire licences (serveur)
            </button>
          </div>
          {msg && <p className="sub export-msg license-msg">{msg}</p>}
        </div>

        {userDataRoot && (
          <details className="license-details">
            <summary>Dossier données applicatives</summary>
            <p className="mono license-path">{userDataRoot}</p>
          </details>
        )}
      </div>

      {inventoryOpen && (
        <div
          className="license-test-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="license-inv-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setInventoryOpen(false)
          }}
        >
          <div className="license-inv-modal license-test-modal">
            <h3 id="license-inv-modal-title">Licences sur ce serveur pour ce poste</h3>
            <p className="license-key-hint" style={{ marginTop: 0 }}>
              Liste les licences encore activables sur le projet et celles déjà reliées à l’identifiant machine de cette
              installation. Le serveur exige le code administrateur configuré dans WEB_LICENCES (purge / licences).
            </p>
            {inventoryMachineId && (
              <p className="license-line" style={{ marginBottom: '0.75rem', fontSize: '0.88rem' }}>
                <span className="license-label">Identifiant poste envoyé au serveur</span>
                <span className="mono">{inventoryMachineId}</span>
              </p>
            )}
            <label className="field" style={{ marginBottom: '0.5rem' }}>
              <span>Code administrateur serveur</span>
              <input
                type="password"
                className="mono license-key-field"
                autoComplete="off"
                spellCheck={false}
                value={inventoryAdminPass}
                onChange={(e) => setInventoryAdminPass(e.target.value)}
                placeholder="Mot de passe / code purge licences"
              />
            </label>
            <div className="license-actions" style={{ marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={inventoryLoading}
                onClick={() => void onFetchLicenseInventory()}
              >
                {inventoryLoading ? 'Chargement…' : 'Récupérer la liste'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setInventoryOpen(false)}>
                Fermer
              </button>
            </div>
            {inventoryErr && (
              <p className="page-desc license-msg license-msg--err" style={{ marginTop: '0.75rem' }}>
                {inventoryErr}
              </p>
            )}
            {inventoryRows.length > 0 && (
              <div className="license-inv-table-wrap">
                <table className="license-inv-table">
                  <thead>
                    <tr>
                      <th>Clé</th>
                      <th>Statut</th>
                      <th>Expire</th>
                      <th>Détail</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRows.map((row) => (
                      <tr key={row.licenseKey}>
                        <td className="mono">{row.maskedKey}</td>
                        <td>{row.status || '—'}</td>
                        <td>{row.expiresAt ? row.expiresAt.slice(0, 10) : '—'}</td>
                        <td>
                          <div className="license-inv-badges">
                            {row.linkedOnMachine && (
                              <span className="license-inv-badge license-inv-badge--on">Ce poste</span>
                            )}
                            {row.hasFreeActivationSlots && (
                              <span className="license-inv-badge license-inv-badge--avail">Places libres (serveur)</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={busy || applyBusyKey === row.licenseKey}
                            onClick={() => void onApplyInventoryLicense(row.licenseKey)}
                          >
                            {applyBusyKey === row.licenseKey ? 'Enregistrement…' : 'Appliquer'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!inventoryLoading && inventoryRows.length === 0 && !inventoryErr && !inventoryFetchedOk && (
              <p className="page-desc license-key-hint" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Saisissez le code puis « Récupérer la liste ».
              </p>
            )}
            {!inventoryLoading && inventoryRows.length === 0 && !inventoryErr && inventoryFetchedOk && (
              <p className="page-desc license-msg" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Le serveur ne renvoie aucune licence correspondant aux critères (projet, poste, filtres disponibles /
                utilisées sur ce poste).
              </p>
            )}
          </div>
        </div>
      )}

      {testModal && (
        <div
          className="license-test-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="license-test-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setTestModal(null)
          }}
        >
          <div className="license-test-modal">
            <h3 id="license-test-modal-title" className={testModal.ok ? 'license-test-modal-title--ok' : ''}>
              {testModal.ok
                ? testModal.context === 'save'
                  ? 'Licence enregistrée'
                  : 'Test de l’API réussi'
                : testModal.context === 'save'
                  ? 'Enregistrement impossible'
                  : 'Test de l’API échoué'}
            </h3>
            <p className="license-test-modal-body">{testModal.message}</p>
            <div className="license-test-modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setTestModal(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </BootChrome>
  )
}
