import { formatOrderLabel } from '../../shared/orderDigits.js'

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Texte affiché en HTML avec retours ligne → `<br />`. */
export function escHtmlMultiline(s: string): string {
  return escHtml(s).replace(/\r\n|\r|\n/g, '<br />')
}

export function formatMoneyEur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/** Libellé commande sur tickets et PDF (voir `formatOrderLabel`). */
export function formatOrderNo(n: number): string {
  return formatOrderLabel(n)
}
