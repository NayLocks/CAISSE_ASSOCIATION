import type { StoredHeldCart } from '@shared/heldCarts'
import { formatMoney } from '@renderer/utils/money'
import { repairStaleFocus } from '@renderer/utils/blurActiveElement'

type Props = {
  view: 'menu' | 'list'
  heldCarts: StoredHeldCart[]
  linesCount: number
  canSell: boolean
  onClose: () => void
  onViewChange: (view: 'menu' | 'list') => void
  onPutOnHold: () => void
  onRestore: (id: string) => void
  onDiscard: (id: string) => void
}

export default function HeldCartsModals({
  view,
  heldCarts,
  linesCount,
  canSell,
  onClose,
  onViewChange,
  onPutOnHold,
  onRestore,
  onDiscard
}: Props): JSX.Element {
  return (
    <div
      className="overlay held-list-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={view === 'menu' ? 'held-menu-title' : 'held-list-title'}
      onClick={() => {
        onClose()
        repairStaleFocus()
      }}
    >
      <div className="modal held-list-modal" onClick={(e) => e.stopPropagation()}>
        {view === 'menu' ? (
          <>
            <h3 id="held-menu-title">Attente</h3>
            <p className="sub">
              Mettez le panier actuel de côté (ticket imprimé) ou reprenez une commande déjà en attente.
            </p>
            <div className="held-menu-actions">
              <button
                type="button"
                className="btn btn-primary btn-block held-menu-action"
                onClick={() => onViewChange('list')}
              >
                Récupérer une vente
                {heldCarts.length > 0 ? (
                  <span className="held-menu-action-hint">
                    {heldCarts.length} panier{heldCarts.length > 1 ? 's' : ''} en attente
                  </span>
                ) : (
                  <span className="held-menu-action-hint muted">Aucun panier en attente</span>
                )}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-block held-menu-action"
                disabled={linesCount === 0}
                onClick={() => {
                  onClose()
                  onPutOnHold()
                }}
              >
                Mettre en attente celle-ci
                <span className="held-menu-action-hint muted">
                  {linesCount === 0
                    ? 'Panier vide'
                    : `Ticket NNN · ${linesCount} ligne${linesCount > 1 ? 's' : ''}`}
                </span>
              </button>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onClose()
                  repairStaleFocus()
                }}
              >
                Annuler
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id="held-list-title">Commandes en attente</h3>
            <p className="sub">
              Paniers mis de côté (ticket d’attente imprimé). Choisissez-en un pour le reprendre dans la
              caisse.
            </p>
            {heldCarts.length === 0 ? (
              <p className="held-list-empty muted">Aucune commande en attente pour cet événement.</p>
            ) : (
              <ul className="held-carts-list held-carts-list-modal">
                {heldCarts.map((h) => (
                  <li key={h.id} className="held-cart-row">
                    <div className="held-cart-row-meta">
                      <span className="held-cart-row-title">{h.displayName}</span>
                      <span className="held-cart-row-sub">
                        {formatMoney(h.totalCents)} · {h.lineCount} ligne{h.lineCount > 1 ? 's' : ''} ·{' '}
                        {new Date(h.savedAt).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className="held-cart-row-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-held-restore"
                        disabled={!canSell}
                        onClick={() => onRestore(h.id)}
                      >
                        Reprendre
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-held-discard"
                        onClick={() => onDiscard(h.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions held-list-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => onViewChange('menu')}>
                Retour
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onClose()
                  repairStaleFocus()
                }}
              >
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
