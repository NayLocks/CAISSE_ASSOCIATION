import type { ReactNode } from 'react'

type Props = {
  /** Titre principal de l’écran (hors session). */
  title: string
  /** Sous-titre court sous le titre. */
  subtitle?: string
  /** Zone droite : ex. bouton Licence ou Retour. */
  actions?: ReactNode
  children: ReactNode
}

/**
 * En-tête et fond communs pour l’écran d’accueil (associations) et la licence,
 * style terminal de paiement (clair, structuré).
 */
export default function BootChrome({ title, subtitle, actions, children }: Props): JSX.Element {
  return (
    <div className="pro-boot">
      <header className="pro-boot-header">
        <div className="pro-boot-brand">
          <div className="pro-boot-mark" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="6" width="28" height="20" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M6 14h8M6 18h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="pro-boot-app">Caisse · Association · Buvette</div>
            <h1 className="pro-boot-title">{title}</h1>
            {subtitle ? <p className="pro-boot-sub">{subtitle}</p> : null}
          </div>
        </div>
        {actions ? <div className="pro-boot-actions">{actions}</div> : null}
      </header>
      <div className="pro-boot-body">{children}</div>
    </div>
  )
}
