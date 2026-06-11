import { useCallback, useState } from 'react'
import {
  ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MAX_SEC,
  ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MIN_SEC,
  sanitizeAssociationSyncAutoCheckIntervalSec
} from '@shared/catalog'
import { useAppState } from '@renderer/state/AppStateContext'
import { useAssociationSession } from '@renderer/state/AssociationSessionContext'
import { useToast } from '@renderer/state/ToastContext'

type AssocSyncBusy = false | 'check' | 'upload' | 'download'

function formatAssocSyncBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function DataBackupView(): JSX.Element {
  const { data, patchData, refreshData } = useAppState()
  const { switchAssociation } = useAssociationSession()
  const { showToast } = useToast()
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [importFile, setImportFile] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<'full' | 'replace' | 'new'>('replace')
  const [importPin, setImportPin] = useState('')
  const [assocSyncPin, setAssocSyncPin] = useState('')
  const [assocSyncBusy, setAssocSyncBusy] = useState<AssocSyncBusy>(false)
  const [assocSyncMsg, setAssocSyncMsg] = useState<string | null>(null)
  const [assocSyncReport, setAssocSyncReport] = useState<Awaited<
    ReturnType<typeof window.caisse.associationSyncCheck>
  > | null>(null)

  const setBackupPath = useCallback(
    (associationBackupPath: string | null) => {
      patchData({ associationBackupPath })
    },
    [patchData]
  )

  const pickBackupFolder = useCallback(async () => {
    setBackupMsg(null)
    const r = await window.caisse.backupPickFolder()
    if (r.ok) setBackupPath(r.path)
  }, [setBackupPath])

  const exportQuick = useCallback(async () => {
    setBackupMsg(null)
    const p = data.associationBackupPath?.trim()
    if (!p) {
      setBackupMsg('Choisissez d’abord un dossier de sauvegarde.')
      return
    }
    const r = await window.caisse.backupExportToFolder(p)
    if (r.ok) setBackupMsg(`Fichier enregistré : ${r.path}`)
    else setBackupMsg(`Échec : ${r.error === 'bad_folder' ? 'dossier invalide' : 'écriture impossible'}`)
  }, [data.associationBackupPath])

  const exportFull = useCallback(async () => {
    setBackupMsg(null)
    const r = await window.caisse.backupExportFull()
    if (r.ok) setBackupMsg(`Sauvegarde complète : ${r.path}`)
    else if ('canceled' in r && r.canceled) setBackupMsg(null)
    else setBackupMsg(`Échec export : ${'error' in r ? r.error : ''}`)
  }, [])

  const exportCurrent = useCallback(async () => {
    setBackupMsg(null)
    const r = await window.caisse.backupExportCurrent()
    if (r.ok) setBackupMsg(`Association exportée : ${r.path}`)
    else if ('canceled' in r && r.canceled) setBackupMsg(null)
    else setBackupMsg(`Échec export : ${'error' in r ? r.error : ''}`)
  }, [])

  const pickImportFile = useCallback(async () => {
    setBackupMsg(null)
    const r = await window.caisse.backupPickImportFile()
    if (r.ok) {
      setImportFile(r.filePath)
      setImportPin('')
    }
  }, [])

  const applyImport = useCallback(async () => {
    if (!importFile) return
    if (importMode === 'full') {
      if (
        !confirm(
          'Attention : l’import complet remplace toutes les associations sur cet ordinateur par le contenu du fichier. Continuer ?'
        )
      ) {
        return
      }
    } else if (importMode === 'replace') {
      if (
        !confirm(
          "Remplacer toutes les données de l’association active (fichiers sur le disque) par la sauvegarde ? Cette opération ne peut pas être annulée."
        )
      ) {
        return
      }
    } else if (
      !confirm(
        'Créer une nouvelle association à partir de ce fichier ? Les données actuelles des autres associations ne sont pas modifiées.'
      )
    ) {
      return
    }
    setBackupMsg(null)
    const r = await window.caisse.backupApplyImport({
      filePath: importFile,
      mode: importMode,
      pin: importPin
    })
    if (!r.ok) {
      const code = r.error
      const err =
        code === 'wrong_pin'
          ? 'Code PIN incorrect.'
          : code === 'invalid_file'
            ? 'Fichier de sauvegarde invalide.'
            : code === 'read_failed'
              ? 'Lecture impossible.'
              : code === 'not_full_backup' || code === 'registry_mismatch'
                ? 'Ce fichier ne correspond pas à une sauvegarde complète valide.'
                : code || 'Import impossible.'
      setBackupMsg(err)
      return
    }
    setImportFile(null)
    setImportPin('')
    if (r.reload) {
      window.location.reload()
    } else {
      await refreshData()
      setBackupMsg('Import terminé. Les données ont été mises à jour.')
    }
  }, [importFile, importMode, importPin, refreshData])

  const runAssocSyncCheck = useCallback(async () => {
    if (assocSyncBusy) return
    setAssocSyncBusy('check')
    setAssocSyncMsg(null)
    try {
      const r = await window.caisse.associationSyncCheck()
      setAssocSyncReport(r)
      if (!r.ok) {
        setAssocSyncMsg(r.message)
        return
      }
      const { check, localRevision } = r
      if (!check.has_server_snapshot) {
        setAssocSyncMsg(
          check.hint?.trim()
            ? check.hint
            : 'Aucune copie sur le serveur pour ce code association : vous pouvez en envoyer une.'
        )
      } else if (check.needs_download === true) {
        setAssocSyncMsg(
          `Le serveur a une copie plus récente (révision ${check.server_revision ?? '—'}, la vôtre indiquée : ${localRevision ?? 'non suivie'}). Pensez à récupérer la copie.`
        )
      } else if (check.needs_download === false) {
        setAssocSyncMsg(
          `Ce poste est à jour par rapport au serveur (révision serveur : ${check.server_revision ?? '—'}).`
        )
      } else {
        setAssocSyncMsg(
          'Sur le serveur : révision ' +
            (check.server_revision ?? '—') +
            '. Suivez une révision locale (après envoi ou réception) pour activer la comparaison automatique.'
        )
      }
    } catch (e) {
      setAssocSyncReport(null)
      setAssocSyncMsg(e instanceof Error ? e.message : 'Erreur lors de la vérification.')
    } finally {
      setAssocSyncBusy(false)
    }
  }, [assocSyncBusy])

  const runAssocSyncUpload = useCallback(async () => {
    if (assocSyncBusy) return
    if (!assocSyncPin.trim()) {
      setAssocSyncMsg('Saisissez le code PIN pour confirmer l’envoi.')
      return
    }
    setAssocSyncBusy('upload')
    setAssocSyncMsg(null)
    try {
      const r = await window.caisse.associationSyncUpload({ pin: assocSyncPin })
      if (!r.ok) {
        setAssocSyncMsg(r.message)
        return
      }
      setAssocSyncMsg(r.message)
      setAssocSyncPin('')
      setAssocSyncReport(null)
      await refreshData()
    } catch (e) {
      setAssocSyncMsg(e instanceof Error ? e.message : 'Erreur lors de l’envoi.')
    } finally {
      setAssocSyncBusy(false)
    }
  }, [assocSyncBusy, assocSyncPin, refreshData])

  const runAssocSyncDownload = useCallback(async () => {
    if (assocSyncBusy) return
    if (!assocSyncPin.trim()) {
      setAssocSyncMsg('Saisissez le code PIN pour confirmer le remplacement des données locales.')
      return
    }
    if (
      !window.confirm(
        'Remplacer toutes les données de cette association sur cet ordinateur par la copie stockée sur le serveur ? Cette opération ne peut pas être annulée.'
      )
    ) {
      return
    }
    setAssocSyncBusy('download')
    setAssocSyncMsg(null)
    try {
      const r = await window.caisse.associationSyncDownloadApply({ pin: assocSyncPin })
      if (!r.ok) {
        setAssocSyncMsg(r.message)
        return
      }
      setAssocSyncMsg(r.message)
      setAssocSyncPin('')
      setAssocSyncReport(null)
      await refreshData()
    } catch (e) {
      setAssocSyncMsg(e instanceof Error ? e.message : 'Erreur lors de la récupération.')
    } finally {
      setAssocSyncBusy(false)
    }
  }, [assocSyncBusy, assocSyncPin, refreshData])

  const factoryResetAll = useCallback(async () => {
    const msg1 =
      'Première confirmation :\n\n' +
      'Remettre le logiciel à zéro supprime TOUTES les associations et données locales sur cet ordinateur : caisses, événements, articles, stock, sessions, historique des ventes, paramètres et codes PIN.\n\n' +
      'Continuer ?'
    if (!window.confirm(msg1)) return
    const msg2 =
      'Seconde confirmation :\n\n' +
      'Cette action est DÉFINITIVE et ne peut pas être annulée.\n\n' +
      'Confirmer la remise à zéro ?'
    if (!window.confirm(msg2)) return
    const pin =
      data.security.pinHash === null
        ? ''
        : window.prompt('Saisissez le code PIN pour confirmer la remise à zéro :')
    if (pin === null) return
    const r = await window.caisse.factoryReset(pin)
    if (!r.ok) {
      showToast({ variant: 'error', message: r.message })
      return
    }
    switchAssociation()
    showToast({
      variant: 'success',
      message:
        'Remise à zéro effectuée. Aucune association ne subsiste sur ce poste ; créez-en une nouvelle ou importez une sauvegarde depuis l’écran de choix.',
      durationMs: 12000
    })
  }, [data.security.pinHash, switchAssociation, showToast])

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h2 className="page-title">Sauvegarde et restauration</h2>
            <p className="page-desc">
              Exportez ou importez les données JSON, définissez un dossier de copie rapide, synchronisez avec le
              serveur lié à la licence. Les chemins des fichiers sur le disque sont dans{' '}
              <strong>Paramètres</strong>.
            </p>
          </div>
        </div>

        {backupMsg && (
          <div className="settings-flash" role="status">
            {backupMsg}
          </div>
        )}

        <div className="card form-card">
          <h3 className="card-title">Dossier de sauvegarde rapide</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Indiquez un dossier (clé USB, disque réseau, etc.) pour y enregistrer rapidement une copie de{' '}
            <strong>cette association</strong> sans parcourir la boîte de dialogue à chaque fois.
          </p>
          <div className="backup-path-row">
            <code className="mono backup-path-display">
              {data.associationBackupPath?.trim() || '— Aucun dossier défini —'}
            </code>
            <div className="backup-path-actions">
              <button type="button" className="btn btn-secondary" onClick={() => void pickBackupFolder()}>
                Parcourir…
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!data.associationBackupPath?.trim()}
                onClick={() => setBackupPath(null)}
              >
                Effacer
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!data.associationBackupPath?.trim()}
                onClick={() => void exportQuick()}
              >
                Sauvegarder dans ce dossier
              </button>
            </div>
          </div>
          <label className="check-label" style={{ marginTop: '0.75rem' }}>
            <input
              type="checkbox"
              checked={data.autoBackupEnabled}
              onChange={(e) => patchData({ autoBackupEnabled: e.target.checked })}
            />
            <span>
              Sauvegarde automatique quotidienne dans ce dossier (vérif. toutes les 15 min, une fois par jour)
            </span>
          </label>
          {data.autoBackupLastRunDate ? (
            <p className="sub" style={{ marginTop: '0.35rem' }}>
              Dernière sauvegarde auto : {data.autoBackupLastRunDate}
            </p>
          ) : null}
        </div>

        <div className="card form-card">
          <h3 className="card-title">Exporter ou importer un fichier</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Fichiers au format JSON : sauvegarde complète (toutes les associations), export de l’association
            active uniquement, ou restauration depuis un fichier. L’import complet{' '}
            <strong>remplace</strong> toutes les associations — le code PIN confirme l’opération.
          </p>
          <div className="export-import-grid">
            <button type="button" className="btn btn-secondary" onClick={() => void exportFull()}>
              Exporter tout (toutes les associations)
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void exportCurrent()}>
              Exporter cette association uniquement
            </button>
            <button type="button" className="btn btn-secondary export-import-span-2" onClick={() => void pickImportFile()}>
              Choisir un fichier à importer…
            </button>
          </div>

          {importFile && (
            <div className="import-panel">
              <div className="import-file-banner">
                <span className="import-file-label">Fichier sélectionné</span>
                <code className="mono import-file-path">{importFile}</code>
              </div>
              <fieldset className="import-mode-fieldset">
                <legend className="import-mode-legend">Mode d’import</legend>
                <div className="radio-card-group" role="radiogroup" aria-label="Mode d’import">
                  <label
                    className={`radio-card${importMode === 'replace' ? ' radio-card--active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span className="radio-card-text">
                      <span className="radio-card-title">Remplacer l’association active</span>
                      <span className="radio-card-hint">Écrase les fichiers de l’association ouverte.</span>
                    </span>
                  </label>
                  <label className={`radio-card${importMode === 'new' ? ' radio-card--active' : ''}`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'new'}
                      onChange={() => setImportMode('new')}
                    />
                    <span className="radio-card-text">
                      <span className="radio-card-title">Importer comme nouvelle association</span>
                      <span className="radio-card-hint">Les autres associations ne sont pas modifiées.</span>
                    </span>
                  </label>
                  <label className={`radio-card${importMode === 'full' ? ' radio-card--active' : ''}`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'full'}
                      onChange={() => setImportMode('full')}
                    />
                    <span className="radio-card-text">
                      <span className="radio-card-title">Remplacer toute la base</span>
                      <span className="radio-card-hint">Toutes les associations sur cet ordinateur.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
              <label className="field">
                <span>Code PIN (pour confirmer)</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={importPin}
                  onChange={(e) => setImportPin(e.target.value)}
                  placeholder="Votre code PIN"
                />
              </label>
              <div className="form-card-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setImportFile(null)}>
                  Annuler
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void applyImport()}>
                  Lancer l’import
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card form-card">
          <h3 className="card-title">Copie sur le serveur (licence)</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Même projet logiciel que la licence en ligne : enregistrer ou récupérer une copie (export JSON interne)
            pour partager cette association entre plusieurs postes. Une <strong>révision</strong> côté serveur
            indique si votre copie locale est à jour.
          </p>
          <label className="check-label" style={{ display: 'block', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              checked={data.associationSyncAutoCheckEnabled}
              onChange={(e) => {
                patchData({ associationSyncAutoCheckEnabled: e.target.checked })
                void window.caisse.associationSyncRestartLoop()
              }}
            />
            <span>
              Système de synchro auto (vérifie le serveur, applique une copie plus récente si le panier est vide,
              envoie la copie après chaque vente)
            </span>
          </label>
          <label
            className="field"
            style={{
              marginBottom: '0.75rem',
              opacity: data.associationSyncAutoCheckEnabled ? 1 : 0.55
            }}
          >
            <span>Intervalle entre deux vérifications (secondes)</span>
            <input
              type="number"
              min={ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MIN_SEC}
              max={ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MAX_SEC}
              step={5}
              disabled={!data.associationSyncAutoCheckEnabled}
              value={data.associationSyncAutoCheckIntervalSec}
              onChange={(e) => {
                patchData({
                  associationSyncAutoCheckIntervalSec: sanitizeAssociationSyncAutoCheckIntervalSec(
                    e.target.value
                  )
                })
                void window.caisse.associationSyncRestartLoop()
              }}
            />
            <span className="sub">
              Entre {ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MIN_SEC} et {ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MAX_SEC}{' '}
              s — défaut 30. Un panier en cours ou un paiement ouvert retarde l’application d’une copie serveur (le
              panier en mémoire est conservé).
            </span>
          </label>
          {data.associationSyncAutoCheckEnabled && data.security.pinHash !== null ? (
            <label className="field" style={{ marginBottom: '0.75rem' }}>
              <span>PIN pour la synchro auto (enregistré sur ce poste)</span>
              <input
                type="password"
                autoComplete="off"
                value={data.associationSyncAutoPin ?? ''}
                onChange={(e) =>
                  patchData({
                    associationSyncAutoPin: e.target.value.trim() ? e.target.value : null
                  })
                }
                placeholder="Même PIN que pour l’import / envoi manuel"
              />
            </label>
          ) : null}
          <dl className="assoc-paths-dl assoc-sync-meta">
            <div>
              <dt>Révision suivie sur ce poste</dt>
              <dd className="path-dd">
                {data.associationServerSnapshotRevision ?? '— (aucune synchro enregistrée encore)'}
              </dd>
            </div>
            <div>
              <dt>Code association (profil actif)</dt>
              <dd className="path-dd mono">
                {data.association.licenseAssociationCode?.trim()
                  ? data.association.licenseAssociationCode
                  : '— Non renseigné —'}
              </dd>
            </div>
          </dl>
          <div className="license-actions" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={assocSyncBusy !== false}
              onClick={() => void runAssocSyncCheck()}
            >
              {assocSyncBusy === 'check' ? 'Vérification…' : 'Vérifier (serveur)'}
            </button>
          </div>
          {assocSyncReport && assocSyncReport.ok && assocSyncReport.check.has_server_snapshot && (
            <div className="sync-report-box">
              <p className="sync-report-line">
                <strong>Révision sur le serveur :</strong> {assocSyncReport.check.server_revision ?? '—'}{' '}
                {assocSyncReport.check.updated_at ? (
                  <span className="sync-report-muted">
                    (mise à jour :{' '}
                    {new Date(assocSyncReport.check.updated_at).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short'
                    })}
                    )
                  </span>
                ) : null}
              </p>
              <p className="sync-report-line sync-report-line--tight">
                <strong>Taille :</strong> {formatAssocSyncBytes(assocSyncReport.check.file_size)}
                {' · '}
                <strong>Empreinte :</strong>{' '}
                <span className="mono sync-report-hash">
                  {assocSyncReport.check.sha256_hex
                    ? `${assocSyncReport.check.sha256_hex.slice(0, 12)}…`
                    : '—'}
                </span>
              </p>
              {assocSyncReport.check.needs_download === true && (
                <p className="license-msg license-msg--err sync-report-msg">
                  Le serveur a une révision plus récente que celle suivie localement — récupérez la copie si vous
                  voulez aligner ce poste.
                </p>
              )}
              {assocSyncReport.check.needs_download === false && (
                <p className="license-msg license-msg--ok sync-report-msg">
                  Vous êtes aligné avec le serveur (révision locale ≥ révision serveur).
                </p>
              )}
            </div>
          )}
          <label className="field">
            <span>Code PIN (pour envoyer ou appliquer la copie)</span>
            <input
              type="password"
              autoComplete="off"
              value={assocSyncPin}
              onChange={(e) => setAssocSyncPin(e.target.value)}
              placeholder="Même PIN que pour l’import fichier"
              disabled={assocSyncBusy !== false}
            />
          </label>
          <div className="backup-path-actions" style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={assocSyncBusy !== false}
              onClick={() => void runAssocSyncUpload()}
            >
              {assocSyncBusy === 'upload' ? 'Envoi…' : 'Envoyer cette association vers le serveur'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={assocSyncBusy !== false}
              onClick={() => void runAssocSyncDownload()}
            >
              {assocSyncBusy === 'download' ? 'Récupération…' : 'Récupérer la copie serveur et l’appliquer'}
            </button>
          </div>
          {assocSyncMsg && (
            <p className="sub export-msg assoc-sync-footer-msg">
              {assocSyncMsg}
            </p>
          )}
        </div>

        <div className="card form-card factory-reset-card">
          <h3 className="card-title danger-title">Remise à zéro complète</h3>
          <p className="page-desc factory-reset-desc">
            Efface <strong>toutes les associations</strong> et leurs données sur cet ordinateur (historique des
            ventes, articles, événements, PIN, etc.). Après remise à zéro, la liste des associations est vide.
            Deux confirmations sont demandées. Pensez à une <strong>exportation complète</strong> (ci-dessus)
            avant si vous devez conserver une copie.
          </p>
          <button type="button" className="btn btn-danger-reset" onClick={() => void factoryResetAll()}>
            Remettre tout le logiciel à zéro…
          </button>
        </div>
      </div>
    </div>
  )
}
