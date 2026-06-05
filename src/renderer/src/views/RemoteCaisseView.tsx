import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppState } from '@renderer/state/AppStateContext'

function urlKind(url: string): 'local' | 'lan' {
  try {
    const h = new URL(url).hostname.toLowerCase()
    if (h === 'localhost' || h === '127.0.0.1') return 'local'
    return 'lan'
  } catch {
    return 'lan'
  }
}

export default function RemoteCaisseView(): JSX.Element {
  const { data, refreshData, patchData } = useAppState()
  const [remoteCaisse, setRemoteCaisse] = useState<{ port: number; urls: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const reloadUrls = useCallback(() => {
    void window.caisse.getRemoteCaisseInfo().then(setRemoteCaisse)
  }, [])

  useEffect(() => {
    reloadUrls()
  }, [reloadUrls])

  const enabled = data.remoteCaisseEnabled
  const tokenRequired = data.remoteCaisseTokenRequired !== false
  const token = data.remoteCaisseToken ?? ''

  const serverOk = Boolean(remoteCaisse && remoteCaisse.port > 0)

  const tabletRows = useMemo(() => {
    if (!remoteCaisse?.urls?.length) return []
    const base = remoteCaisse.urls.map((baseUrl) =>
      baseUrl.endsWith('/') ? `${baseUrl}tablet` : `${baseUrl}/tablet`
    )
    const withKind = base.map((u) => ({ u, kind: urlKind(u) }))
    return [...withKind.filter((x) => x.kind === 'lan'), ...withKind.filter((x) => x.kind === 'local')]
  }, [remoteCaisse])

  const setRemoteEnabled = useCallback(
    async (next: boolean) => {
      setBusy(true)
      try {
        const r = await window.caisse.remoteCaisseSetConfig({ enabled: next })
        patchData({
          remoteCaisseEnabled: r.enabled,
          remoteCaisseToken: r.token,
          remoteCaisseTokenRequired: r.tokenRequired
        })
        await refreshData()
        reloadUrls()
      } finally {
        setBusy(false)
      }
    },
    [refreshData, reloadUrls, patchData]
  )

  const setTokenRequired = useCallback(
    async (next: boolean) => {
      setBusy(true)
      try {
        const r = await window.caisse.remoteCaisseSetConfig({
          remoteCaisseRequireToken: next ? 1 : 0
        })
        patchData({
          remoteCaisseTokenRequired: r.tokenRequired,
          remoteCaisseToken: r.token
        })
        await refreshData()
      } finally {
        setBusy(false)
      }
    },
    [refreshData, patchData]
  )

  const regenerateToken = useCallback(async () => {
    setBusy(true)
    try {
      const r = await window.caisse.remoteCaisseSetConfig({ regenerateToken: true })
      patchData({
        remoteCaisseToken: r.token,
        remoteCaisseTokenRequired: r.tokenRequired
      })
      await refreshData()
    } finally {
      setBusy(false)
    }
  }, [refreshData, patchData])

  const statusKind: 'off' | 'error' | 'warn' | 'ok' = !enabled
    ? 'off'
    : !serverOk
      ? 'error'
      : !tokenRequired
        ? 'warn'
        : !token
          ? 'warn'
          : 'ok'

  const statusText = !enabled
    ? 'Pilotage web désactivé : aucune tablette ne peut piloter la caisse.'
    : !serverOk
      ? 'Serveur intégré indisponible — redémarrer l’application.'
      : !tokenRequired
        ? 'Accès ouvert sur le réseau local : toute personne avec l’URL peut utiliser la caisse tablette.'
        : !token
          ? 'Jeton manquant — générez-en un ou réactivez la sécurité puis enregistrez.'
          : 'Configuration opérationnelle : partagez une URL et le jeton si besoin.'

  const statusClass =
    statusKind === 'off'
      ? 'remote-caisse-status remote-caisse-status--off'
      : statusKind === 'error'
        ? 'remote-caisse-status remote-caisse-status--error'
        : statusKind === 'warn'
          ? 'remote-caisse-status remote-caisse-status--warn'
          : 'remote-caisse-status remote-caisse-status--ok'

  return (
    <div className="page page-scroll">
      <div className="page-inner remote-caisse-page">
        <header className="remote-caisse-head">
          <div className="remote-caisse-head__text">
            <h2 className="page-title">Accès distant — caisse tablette</h2>
            <p className="page-desc remote-caisse-head__lead">
              Caisse complète dans le navigateur (articles, panier, espèces, carte / SumUp, historique, fond de caisse),
              sur le même réseau local que ce PC.
            </p>
          </div>
          <button type="button" className="btn btn-secondary remote-caisse-refresh" onClick={() => reloadUrls()}>
            Actualiser
          </button>
        </header>

        <div className="card form-card" style={{ marginBottom: '1rem' }}>
          <h3 className="card-title">Deuxième caisse sur le même événement</h3>
          <p className="page-desc">
            Pour un <strong>second PC</strong> sur le même événement : utilisez la{' '}
            <strong>synchronisation serveur</strong> (menu Sauvegarde) après les ventes — chaque poste envoie sa copie,
            puis l’autre récupère avant de reprendre. Pour une tablette sur le même réseau, activez le pilotage web
            ci-dessous (même panier que ce PC). Les numéros de commande et le stock restent propres à chaque poste tant
            que les copies ne sont pas fusionnées via le serveur.
          </p>
        </div>

        <p className={statusClass} role="status">
          {statusText}
          {enabled && serverOk && remoteCaisse?.port ? (
            <span className="remote-caisse-port">
              {' '}
              Port <span className="mono">{remoteCaisse.port}</span>
            </span>
          ) : null}
        </p>

        <div className="remote-caisse-stack">
          <section className="card form-card remote-caisse-card" aria-labelledby="rc-intro-title">
            <h3 id="rc-intro-title" className="remote-caisse-card-title">
              Deux niveaux côté client
            </h3>
            <p className="remote-caisse-card-lead">
              Ne confondez pas l’<strong>écran client</strong> (lecture seule, menu Écran client) avec cette page, qui
              permet d’<strong>encaisser</strong> depuis une tablette.
            </p>
            <div className="remote-caisse-intro-grid">
              <div className="remote-caisse-intro-panel">
                <div className="remote-caisse-intro-panel__label">Usage typique</div>
                <ul className="remote-caisse-intro-panel__list">
                  <li>File d’attente : une tablette par opérateur, PC ou box TV en retrait.</li>
                  <li>Même Wi‑Fi / LAN que la caisse principale.</li>
                </ul>
              </div>
              <div className="remote-caisse-intro-panel remote-caisse-intro-panel--accent">
                <div className="remote-caisse-intro-panel__label">Risques réseau</div>
                <ul className="remote-caisse-intro-panel__list">
                  <li>Ouvrir le port sur le pare-feu Windows uniquement sur un réseau maîtrisé.</li>
                  <li>
                    Sans jeton, quiconque sur le LAN peut agir sur la caisse — réservez au test ou réseau très restreint.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="card form-card remote-caisse-card">
            <h3 className="remote-caisse-card-title">Activation</h3>
            <label className="check-label block-check remote-caisse-toggle">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                onChange={(e) => void setRemoteEnabled(e.target.checked)}
              />
              <span>Autoriser le pilotage depuis une page web (tablette)</span>
            </label>
            <p className="remote-caisse-lead-muted">
              Désactivé par défaut. La tablette se connecte au serveur intégré à cette application.
            </p>

            <div className="remote-caisse-subsection">
              <h4 className="remote-caisse-subtitle">Sécurité par jeton</h4>
              <p className="remote-caisse-field-hint">
                Recommandé en production : la tablette doit saisir une fois le secret affiché ici (stocké dans le
                navigateur). Désactiver le jeton simplifie les essais sur un réseau fermé. Réglable{' '}
                <strong>même si le pilotage est coupé</strong> ci-dessus.
              </p>
              <label className="check-label block-check">
                <input
                  type="checkbox"
                  checked={tokenRequired}
                  disabled={busy}
                  onChange={(e) => void setTokenRequired(e.target.checked)}
                />
                <span>Exiger un jeton secret pour chaque session tablette</span>
              </label>
            </div>

            {tokenRequired ? (
              <div className="remote-caisse-subsection">
                <h4 className="remote-caisse-subtitle">Jeton actuel</h4>
                {token ? (
                  <>
                    <div className="remote-caisse-token-strip">
                      <code className="mono remote-caisse-token-code">{token}</code>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => void navigator.clipboard.writeText(token)}
                      >
                        Copier
                      </button>
                    </div>
                    <div className="remote-caisse-token-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => void regenerateToken()}
                      >
                        Générer un nouveau jeton
                      </button>
                    </div>
                    <p className="remote-caisse-field-hint">
                      Après rotation, resaisir le jeton sur chaque tablette (ou effacer le jeton mémorisé sur la page de
                      connexion).
                    </p>
                  </>
                ) : (
                  <p className="muted">
                    {enabled
                      ? 'Jeton en cours de création — si le message reste bloqué, désactivez puis réactivez le pilotage.'
                      : 'Activez le pilotage pour générer automatiquement un jeton (ou désactivez l’obligation du jeton si vous préférez un accès ouvert sur le LAN).'}
                  </p>
                )}
              </div>
            ) : (
              <div className="remote-caisse-subsection">
                <p className="remote-caisse-insecure-note" role="note">
                  Accès <strong>sans authentification</strong> sur le LAN : quiconque connaît l’URL peut piloter la
                  caisse. Un jeton peut rester enregistré en base si vous réactivez la sécurité.
                  {!enabled ? ' Une fois le pilotage activé, la tablette s’ouvrira sans saisie de code.' : null}
                </p>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void regenerateToken()}>
                  Pré-générer / renouveler le jeton (pour plus tard)
                </button>
              </div>
            )}
          </section>

          <section className="card form-card remote-caisse-card">
            <h3 className="remote-caisse-card-title">Adresses finissant par /tablet</h3>
            <p className="remote-caisse-card-lead">
              Ouvrez l’URL sur la tablette (Chrome ou Edge conseillés). Privilégiez l’adresse « même réseau » ;{' '}
              <code className="mono">localhost</code> ne fonctionne que sur la machine caisse.
            </p>
            {!enabled ? (
              <p className="muted">Activez le pilotage web pour afficher les liens.</p>
            ) : !serverOk ? (
              <p className="muted">Serveur tablette indisponible (redémarrer l’application).</p>
            ) : (
              <ul className="remote-caisse-url-list">
                {tabletRows.map(({ u, kind }) => (
                  <li key={u} className="remote-caisse-url-item">
                    <span
                      className={
                        kind === 'lan'
                          ? 'remote-caisse-url-badge remote-caisse-url-badge--lan'
                          : 'remote-caisse-url-badge'
                      }
                    >
                      {kind === 'lan' ? 'Même réseau que le PC' : 'Ce PC uniquement'}
                    </span>
                    <div className="remote-caisse-url-strip">
                      <code className="mono remote-caisse-url-code">{u}</code>
                      <button
                        type="button"
                        className="btn btn-secondary remote-caisse-url-copy"
                        onClick={() => void navigator.clipboard.writeText(u)}
                      >
                        Copier
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card form-card remote-caisse-card" aria-labelledby="rc-check-title">
            <h3 id="rc-check-title" className="remote-caisse-card-title">
              Check-list
            </h3>
            <ul className="remote-caisse-checklist">
              <li>Pare-feu Windows : autoriser le port affiché plus haut en entrée.</li>
              <li>Pas d’exposition Internet directe — réseau local uniquement.</li>
              <li>SumUp : configurer la clé / terminal comme sur la caisse principale.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
