export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(cents / 100)
}

export function parseEurosToCents(value: string): number | null {
  const n = Number.parseFloat(value.replace(',', '.'))
  if (Number.isNaN(n) || n < 0) return null
  return Math.round(n * 100)
}

export function centsToEurosInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}
