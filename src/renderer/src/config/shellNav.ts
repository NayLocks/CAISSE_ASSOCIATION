/** Vues principales (sidebar + routing interne). */
export type ShellViewId =
  | 'caisse'
  | 'association'
  | 'events'
  | 'categories'
  | 'articles'
  | 'stock'
  | 'sumup'
  | 'printing'
  | 'emailReceipt'
  | 'clientDisplay'
  | 'remoteCaisse'
  | 'history'
  | 'appearance'
  | 'settings'

export type ShellNavItem = { id: ShellViewId; label: string; icon: string }

export type ShellNavGroup = { title: string; items: ShellNavItem[] }

/** Menus regroupés façon terminal de paiement (caisse / catalogue / activité / matériel / admin). */
export const SHELL_NAV_GROUPS: ShellNavGroup[] = [
  {
    title: 'Caisse',
    items: [{ id: 'caisse', label: 'Encaissement', icon: '🧾' }]
  },
  {
    title: 'Catalogue',
    items: [
      { id: 'categories', label: 'Catégories', icon: '🎟️' },
      { id: 'articles', label: 'Articles', icon: '📦' },
      { id: 'stock', label: 'Stock', icon: '📊' }
    ]
  },
  {
    title: 'Activité',
    items: [
      { id: 'events', label: 'Événements', icon: '📅' },
      { id: 'history', label: 'Historique', icon: '📜' }
    ]
  },
  {
    title: 'Matériel & affichage',
    items: [
      { id: 'sumup', label: 'SumUp', icon: '💳' },
      { id: 'printing', label: 'Impression', icon: '🖨️' },
      { id: 'emailReceipt', label: 'E-mail tickets', icon: '📧' },
      { id: 'clientDisplay', label: 'Écran client', icon: '🖥️' },
      { id: 'remoteCaisse', label: 'Accès distant', icon: '📡' }
    ]
  },
  {
    title: 'Administration',
    items: [
      { id: 'association', label: 'Association', icon: '🏢' },
      { id: 'appearance', label: 'Apparence', icon: '🎨' },
      { id: 'settings', label: 'Paramètres', icon: '⚙️' }
    ]
  }
]
