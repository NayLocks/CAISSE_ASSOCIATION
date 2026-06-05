export type CaisseDensity = 'comfortable' | 'compact'

const STORAGE_KEY = 'caisse-caisse-density-v1'

export const CAISSE_DENSITY_CHANGED = 'caisse-caisse-density-changed'

export function readCaisseDensity(): CaisseDensity {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

export function writeCaisseDensity(d: CaisseDensity): void {
  try {
    localStorage.setItem(STORAGE_KEY, d)
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(CAISSE_DENSITY_CHANGED))
  } catch {
    /* ignore */
  }
}

export function applyCaisseDensityToDocument(d: CaisseDensity): void {
  const root = document.documentElement
  if (d === 'compact') root.setAttribute('data-caisse-density', 'compact')
  else root.removeAttribute('data-caisse-density')
}
