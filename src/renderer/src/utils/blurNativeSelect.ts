/**
 * Après un choix dans un `<select>` natif (surtout avec emojis), Chromium / Electron sous
 * Windows peut laisser une couche qui intercepte les clics. On blur puis on déplace le
 * focus sur le champ texte voisin si besoin.
 */
export function blurNativeSelectSoon(selectEl: HTMLSelectElement): void {
  window.setTimeout(() => {
    selectEl.blur()
    if (document.activeElement === selectEl) {
      const next = selectEl.closest('.emoji-pick')?.querySelector<HTMLInputElement>('.input-emoji')
      next?.focus()
    }
  }, 50)
}
