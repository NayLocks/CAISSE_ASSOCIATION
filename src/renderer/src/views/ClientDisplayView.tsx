import { useCallback, useEffect, useState } from 'react'

export default function ClientDisplayView(): JSX.Element {
  const [clientDisplay, setClientDisplay] = useState<{ port: number; urls: string[] } | null>(null)

  const reloadUrls = useCallback(() => {
    void window.caisse.getClientDisplayInfo().then(setClientDisplay)
  }, [])

  useEffect(() => {
    reloadUrls()
  }, [reloadUrls])

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <h2 className="page-title">Affichage client</h2>
        <p className="page-desc">
          Un <strong>écran public</strong> (deuxième écran, tablette ou TV) peut afficher le panier et le
          total en <strong>temps réel</strong> : ouvrez une des adresses ci-dessous dans Chrome, Edge ou
          Firefox sur un appareil du <strong>même réseau</strong> que ce PC. Le pare-feu Windows doit
          autoriser les connexions entrantes sur le port indiqué. Pour une <strong>caisse complète</strong>{' '}
          dans le navigateur, voir le menu <strong>Accès distant</strong>.
        </p>

        <div className="card form-card client-display-card">
          <h3 className="card-title">Adresses à ouvrir sur l’écran client</h3>
          {clientDisplay && clientDisplay.port > 0 ? (
            <ul className="client-display-urls">
              {clientDisplay.urls.map((u) => (
                <li key={u}>
                  <code className="mono client-display-url">{u}</code>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void navigator.clipboard.writeText(u)}
                  >
                    Copier
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Serveur d’affichage indisponible (redémarrez l’application).</p>
          )}
        </div>
      </div>
    </div>
  )
}
