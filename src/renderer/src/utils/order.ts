import { formatOrderDigits, formatOrderLabel } from '@shared/orderDigits'

export { formatOrderDigits }

/** Affichage du numéro de commande (liste, modales, écran client). */
export function formatOrderDisplay(n: number | undefined | null): string {
  if (n == null || n <= 0) return '—'
  return formatOrderLabel(n)
}
