/** Affichage du numéro de commande (liste, modales) */
export function formatOrderDisplay(n: number | undefined | null): string {
  if (n == null || n <= 0) return '—'
  return `N° ${String(n).padStart(6, '0')}`
}
