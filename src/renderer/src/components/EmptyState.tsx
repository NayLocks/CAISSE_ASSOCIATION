import type { ReactNode } from 'react'

export type EmptyStateProps = {
  /** Emoji ou caractère décoratif (facultatif). */
  icon?: string
  title: string
  description?: string
  actions?: ReactNode
  /** `compact` pour cellule de tableau ou zone étroite. */
  density?: 'default' | 'compact'
  className?: string
}

/**
 * Bloc vide réutilisable (panier, listes, historique filtré).
 */
export default function EmptyState({
  icon,
  title,
  description,
  actions,
  density = 'default',
  className = ''
}: EmptyStateProps): JSX.Element {
  const dens = density === 'compact' ? ' empty-state--compact' : ''
  return (
    <div className={`empty-state${dens}${className ? ` ${className}` : ''}`} role="status">
      {icon ? (
        <div className="empty-state__icon" aria-hidden>
          {icon}
        </div>
      ) : null}
      <p className="empty-state__title">{title}</p>
      {description ? <p className="empty-state__desc">{description}</p> : null}
      {actions ? <div className="empty-state__actions">{actions}</div> : null}
    </div>
  )
}
