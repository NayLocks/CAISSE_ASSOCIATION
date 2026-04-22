import { useCallback, useEffect, useState } from 'react'
import { useAppState } from '@renderer/state/AppStateContext'

export default function SettingsView(): JSX.Element {
  const { data, patchData, refreshData } = useAppState()
  const [paths, setPaths] = useState<Awaited<ReturnType<typeof window.caisse.getAppPaths>> | null>(null)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [importFile, setImportFile] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<'full' | 'replace' | 'new'>('replace')
  const [importPin, setImportPin] = useState('')

  useEffect(() => {
    void window.caisse.getAppPaths().then(setPaths)
  }, [])

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

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <h2 className="page-title">Paramètres</h2>
        <p className="page-desc">Emplacements des fichiers et sauvegardes. Le thème d’affichage est dans le menu Apparence.</p>

        {paths && (
          <div className="card form-card assoc-paths-card">
            <h3 className="card-title">Emplacements sur cet ordinateur</h3>
            <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
              Installation, données utilisateur et fichiers JSON de l’association active (pas de base SQL —
              tout est local dans ces fichiers).
            </p>
            <dl className="assoc-paths-dl">
              <div>
                <dt>Application (dossier)</dt>
                <dd className="path-dd">{paths.appPath}</dd>
              </div>
              <div>
                <dt>Exécutable</dt>
                <dd className="path-dd">{paths.exePath}</dd>
              </div>
              <div>
                <dt>Données utilisateur (racine)</dt>
                <dd className="path-dd">{paths.userDataRoot}</dd>
              </div>
              <div>
                <dt>Fichier de configuration (cette association)</dt>
                <dd className="path-dd">{paths.dataFile ?? '—'}</dd>
              </div>
              <div>
                <dt>Historique des ventes (cette association)</dt>
                <dd className="path-dd">{paths.salesHistoryFile ?? '—'}</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="card form-card">
          <h3 className="card-title">Dossier de sauvegarde (cette association)</h3>
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
        </div>

        <div className="card form-card">
          <h3 className="card-title">Export / import</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Exportez la base au format JSON (toutes les associations ou seulement l’active), ou importez une
            sauvegarde. L’import complet <strong>remplace</strong> toutes les associations — utilisez le code
            PIN pour confirmer.
          </p>
          <div className="export-import-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void exportFull()}>
              Exporter tout (toutes les associations)
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void exportCurrent()}>
              Exporter cette association uniquement
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void pickImportFile()}>
              Choisir un fichier à importer…
            </button>
          </div>

          {importFile && (
            <div className="import-panel">
              <p className="page-desc">
                Fichier : <code className="mono">{importFile}</code>
              </p>
              <div className="import-mode-row">
                <label className="check-label">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                  />
                  <span>Remplacer l’association active</span>
                </label>
                <label className="check-label">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'new'}
                    onChange={() => setImportMode('new')}
                  />
                  <span>Importer comme nouvelle association</span>
                </label>
                <label className="check-label">
                  <input
                    type="radio"
                    name="importMode"
                    checked={importMode === 'full'}
                    onChange={() => setImportMode('full')}
                  />
                  <span>Remplacer toute la base (toutes les associations)</span>
                </label>
              </div>
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

        {backupMsg && <p className="sub export-msg">{backupMsg}</p>}
      </div>
    </div>
  )
}
