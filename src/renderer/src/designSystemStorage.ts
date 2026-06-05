/** Variante de design global (persistée sur l’appareil). */
export const UI_DESIGN_STORAGE_KEY = 'caisse-ui-design'

export type UiDesign = 'classic' | 'next'

export function readStoredUiDesign(): UiDesign {
  try {
    const v = localStorage.getItem(UI_DESIGN_STORAGE_KEY)
    if (v === 'next' || v === 'classic') return v
  } catch {
    /* private mode */
  }
  return 'classic'
}

export function writeStoredUiDesign(design: UiDesign): void {
  try {
    localStorage.setItem(UI_DESIGN_STORAGE_KEY, design)
  } catch {
    /* ignore */
  }
}

/** Applique l’attribut sur `<html>` : `next` = refonte ; absent = classique. */
export function applyUiDesignToDocument(design: UiDesign): void {
  if (design === 'next') {
    document.documentElement.setAttribute('data-ui-design', 'next')
  } else {
    document.documentElement.removeAttribute('data-ui-design')
  }
}
