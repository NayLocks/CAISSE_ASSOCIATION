import { useCallback, useEffect, useState } from 'react'
import { useAppState } from '@renderer/state/AppStateContext'

export default function RemoteCaisseView(): JSX.Element {
  const { data, refreshData } = useAppState()
  const [remoteCaisse, setRemoteCaisse] = useState<{ port: number; urls: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const reloadUrls = useCallback(() => {
    void window.caisse.getRemoteCaisseInfo().then(setRemoteCaisse)
  }, [])

  useEffect(() => {
    reloadUrls()
  }, [reloadUrls])

  const setRemoteEnabled = useCallback(
    async (enabled: boolean) => {
      setBusy(true)
      try {
        await window.caisse.remoteCaisseSetConfig({ enabled })
        await refreshData()
        reloadUrls()
      } finally {
        setBusy(false)
      }
    },
    [refreshData, reloadUrls]
  )

  const regenerateToken = useCallback(async () => {
    setBusy(true)
    try {
      await window.caisse.remoteCaisseSetConfig({ regenerateToken: true })
      await refreshData()
    } finally {
      setBusy(false)
    }
  }, [refreshData])

  const tabletUrls =
    remoteCaisse && remoteCaisse.port > 0
      ? remoteCaisse.urls.map((u) => (u.endsWith('/') ? u + 'tablet' : u + '/tablet'))
      : []

  const token = data.remoteCaisseToken ?? ''

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <h2 className="page-title">Accès distant — caisse tablette</h2>
        <p className="page-desc">
          Une <strong>caisse complète</strong> dans le navigateur (grille, panier, espèces, carte / SumUp,
          remboursement, événement, fond de caisse). Même réseau Wi‑Fi que ce PC, protégé par un{' '}
          <strong>jeton secret</strong>. Le pare-feu Windows doit autoriser le port du serveur intégré.
        </p>

        <div className="card form-card client-display-card">
          <label className="checkbox-row" style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={data.remoteCaisseEnabled}
              disabled={busy}
              onChange={(e) => void setRemoteEnabled(e.target.checked)}
            />
            <span>Activer le pilotage depuis une page web</span>
          </label>
          <div style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !data.remoteCaisseEnabled}
              onClick={() => void regenerateToken()}
            >
              Générer un nouveau jeton
            </button>
          </div>
          {data.remoteCaisseEnabled && token ? (
            <p className="page-desc" style={{ marginBottom: '0.5rem' }}>
              <strong>Jeton</strong> (à saisir sur la tablette, une fois) :{' '}
              <code className="mono" style={{ wordBreak: 'break-all' }}>
                {token}
              </code>{' '}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void navigator.clipboard.writeText(token)}
              >
                Copier le jeton
              </button>
            </p>
          ) : data.remoteCaisseEnabled ? (
            <p className="muted">Activez puis enregistrez — un jeton sera créé automatiquement.</p>
          ) : null}
          {data.remoteCaisseEnabled && remoteCaisse && remoteCaisse.port > 0 ? (
            <>
              <p className="page-desc" style={{ marginBottom: '0.5rem' }}>
                Ouvrez sur la tablette (le chemin se termine par <code className="mono">/tablet</code>) :
              </p>
              <ul className="client-display-urls">
                {tabletUrls.map((u) => (
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
            </>
          ) : data.remoteCaisseEnabled ? (
            <p className="muted">Serveur tablette indisponible (redémarrez l’application).</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
