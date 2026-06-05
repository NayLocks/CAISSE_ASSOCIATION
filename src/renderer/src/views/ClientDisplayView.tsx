import { useCallback, useEffect, useMemo, useState } from 'react'

type ClientDispInfo = { port: number; urls: string[] }
type ClientDispFlags = { remoteEnabled: boolean; sessionOpen: boolean }

function urlKind(url: string): 'local' | 'lan' {
  try {
    const h = new URL(url).hostname.toLowerCase()
    if (h === 'localhost' || h === '127.0.0.1') return 'local'
    return 'lan'
  } catch {
    return 'lan'
  }
}

export default function ClientDisplayView(): JSX.Element {
  const [info, setInfo] = useState<ClientDispInfo | null>(null)
  const [flags, setFlags] = useState<ClientDispFlags | null>(null)

  const reload = useCallback(() => {
    void Promise.all([window.caisse.getClientDisplayInfo(), window.caisse.getClientDisplayFlags()]).then(
      ([nextInfo, nextFlags]) => {
        setInfo(nextInfo)
        setFlags(nextFlags)
      }
    )
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const serverOk = Boolean(info && info.port > 0)
  const remoteOn = Boolean(flags?.remoteEnabled)

  const urlRows = useMemo(() => {
    if (!info?.urls?.length) return []
    const withKind = info.urls.map((u) => ({ u, kind: urlKind(u) }))
    const lanFirst = [...withKind.filter((x) => x.kind === 'lan'), ...withKind.filter((x) => x.kind === 'local')]
    return lanFirst
  }, [info])

  const statusKind: 'error' | 'warn' | 'ok' =
    !serverOk ? 'error' : remoteOn ? 'ok' : 'warn'

  const statusText = !serverOk
    ? 'Serveur intégré arrêté — impossible d’afficher la page ; redémarrer l’application.'
    : !remoteOn
      ? 'Serveur OK : depuis le panier, activez « Affichage client » pour envoyer le panier vers l’écran public.'
      : 'Panier envoyé vers l’affichage client : actif. Ouvrir une URL ci‑dessous sur la TV ou la tablette.'

  const statusClass =
    statusKind === 'error'
      ? 'client-disp-status client-disp-status--error'
      : statusKind === 'warn'
        ? 'client-disp-status client-disp-status--warn'
        : 'client-disp-status client-disp-status--ok'

  return (
    <div className="page page-scroll">
      <div className="page-inner client-disp-page">
        <header className="client-disp-head">
          <div className="client-disp-head__text">
            <h2 className="page-title">Écran affichage client</h2>
            <p className="page-desc client-disp-head__lead">
              Page lecture seule : panier et total en direct pour le client (2ᵉ écran, téléviseur ou tablette dans le même
              local).
            </p>
          </div>
          <button type="button" className="btn btn-secondary client-disp-refresh" onClick={() => reload()}>
            Actualiser
          </button>
        </header>

        <p className={statusClass} role="status">
          {statusText}
          {serverOk && info?.port ? (
            <span className="client-disp-port">
              {' '}
              Port <span className="mono">{info.port}</span>
            </span>
          ) : null}
        </p>

        <div className="client-disp-stack">
          <section className="card form-card client-disp-card" aria-labelledby="client-disp-intro-title">
            <h3 id="client-disp-intro-title" className="client-disp-card-title">
              À quoi sert cet écran
            </h3>
            <p className="client-disp-card-lead">
              Ce menu donne uniquement une <strong>adresse à ouvrir dans un navigateur</strong>. La caisse bouge sur cet
              ordinateur ; l’affiche montre au client ce qui correspond au panier.
            </p>
            <div className="client-disp-intro-grid">
              <div className="client-disp-intro-panel">
                <div className="client-disp-intro-panel__label">Vue client</div>
                <ul className="client-disp-intro-panel__list">
                  <li>Prix et lignes comme sur le ticket, mise à jour en temps réel.</li>
                  <li>Adapté au comptoir : TV murale ou tablette côté file.</li>
                </ul>
              </div>
              <div className="client-disp-intro-panel client-disp-intro-panel--accent">
                <div className="client-disp-intro-panel__label">Pas une caisse web</div>
                <ul className="client-disp-intro-panel__list">
                  <li>Pas de saisie des articles sur cette page.</li>
                  <li>
                    Pour encaisser dans le navigateur (tablette opérateur), utilisez{' '}
                    <strong>Accès distant — caisse tablette</strong>.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="card form-card client-disp-card">
            <h3 className="client-disp-card-title">Liens à ouvrir sur l&apos;écran public</h3>
            <p className="client-disp-card-lead">
              Choisissez <strong>l’URL « même réseau »</strong> pour un appareil sur
              le Wi‑Fi ou le câble du PC caisse ; les adresses{' '}
              <code className="mono">localhost</code> / <code className="mono">127.0.0.1</code> ne fonctionnent que sur
              la machine où tourne la caisse.
            </p>
            {!serverOk ? (
              <p className="muted">Serveur d’affichage indisponible (redémarrer l’application).</p>
            ) : (
              <ul className="client-disp-url-list">
                {urlRows.map(({ u, kind }) => (
                  <li key={u} className="client-disp-url-item">
                    <span
                      className={
                        kind === 'lan' ? 'client-disp-url-badge client-disp-url-badge--lan' : 'client-disp-url-badge'
                      }
                    >
                      {kind === 'lan' ? 'Même réseau que le PC' : 'Ce PC uniquement'}
                    </span>
                    <div className="client-disp-url-strip">
                      <code className="mono client-disp-url-code">{u}</code>
                      <button
                        type="button"
                        className="btn btn-secondary client-disp-url-copy"
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

          <section className="card form-card client-disp-card" aria-labelledby="client-disp-check-title">
            <h3 id="client-disp-check-title" className="client-disp-card-title">
              À vérifier une fois sur place
            </h3>
            <ul className="client-disp-checklist">
              <li>L’affichage est sur le <strong>même réseau</strong> que le PC (pas en 4G isolé).</li>
              <li>
                Le pare-feu Windows autorise une <strong>connexion entrante</strong> vers le port indiqué plus haut.
              </li>
              <li>
                Navigateur récent&nbsp;: Chrome, Edge ou Firefox (plein écran recommandé sur la TV{' '}
                <kbd>F11</kbd>).
              </li>
              <li>
                Thème clair / sombre de la page cliente&nbsp;: réglage <strong>Apparence</strong> dans le menu principal.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
