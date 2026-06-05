import { useEffect, useState } from 'react'

export default function SettingsView(): JSX.Element {
  const [paths, setPaths] = useState<Awaited<ReturnType<typeof window.caisse.getAppPaths>> | null>(null)

  useEffect(() => {
    void window.caisse.getAppPaths().then(setPaths)
  }, [])

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h2 className="page-title">Paramètres</h2>
            <p className="page-desc">
              Emplacements des fichiers sur cet ordinateur. Le thème d’affichage est dans <strong>Apparence</strong>
              ; les sauvegardes et restaurations sont dans <strong>Sauvegarde</strong>.
            </p>
          </div>
        </div>

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
      </div>
    </div>
  )
}
