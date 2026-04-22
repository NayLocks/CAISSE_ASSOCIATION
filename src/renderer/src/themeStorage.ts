/** Clé localStorage pour le thème interface (persiste entre les sessions). */
export const UI_THEME_STORAGE_KEY = 'caisse-ui-theme'

export type UiTheme = 'dark' | 'light'

export function readStoredUiTheme(): UiTheme {
  try {
    const v = localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* private mode / indisponible */
  }
  return 'light'
}

export function writeStoredUiTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function applyUiThemeToDocument(theme: UiTheme): void {
  document.documentElement.setAttribute('data-theme', theme)
}
