/**
 * Format d’affichage du numéro de commande :
 * - **Minimum 3 caractères** : zéros à gauche si besoin (`001`, `042`, `099`).
 * - **À partir de 1000** : affichage du nombre **en entier** (`1000`, `12045`), sans troncature.
 */
export function formatOrderDigits(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0'
  const s = String(Math.floor(n))
  return s.length >= 3 ? s : s.padStart(3, '0')
}

/** Texte avant le numéro partout (tickets, listes, e-mails). */
export const ORDER_NUMBER_PREFIX = 'Commande'

/** Libellé complet : « Commande » + numéro formaté (ex. `Commande 042`). */
export function formatOrderLabel(n: number): string {
  return `${ORDER_NUMBER_PREFIX} ${formatOrderDigits(n)}`
}
