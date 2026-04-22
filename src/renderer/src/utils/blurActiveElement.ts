/**
 * Retire le focus du contrôle actif avant qu’il soit démonté (ex. bouton « Supprimer » dans une ligne).
 * Sinon Chromium / Electron peut laisser l’UI dans un état où plus aucun champ ne reçoit la saisie.
 */
export function blurActiveElement(): void {
  const el = document.activeElement
  if (el instanceof HTMLElement) {
    el.blur()
  }
}

let focusSink: HTMLDivElement | null = null

function getFocusSink(): HTMLDivElement {
  if (!focusSink) {
    focusSink = document.createElement('div')
    focusSink.setAttribute('aria-hidden', 'true')
    focusSink.tabIndex = -1
    focusSink.style.cssText =
      'position:fixed;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;opacity:0;pointer-events:none;'
    document.body.appendChild(focusSink)
  }
  return focusSink
}

/**
 * Après `confirm()` + `setData` qui supprime la ligne au focus, Chromium / Electron (surtout Windows)
 * peut garder un état de focus incohérent : les champs texte ne reçoivent plus les frappes.
 * On réinitialise en déplaçant brièvement le focus sur un nœud stable hors arbre React.
 */
export function stabilizeFocusAfterDelete(): void {
  const cycle = (): void => {
    blurActiveElement()
    const sink = getFocusSink()
    sink.focus({ preventScroll: true })
    sink.blur()
  }

  blurActiveElement()
  queueMicrotask(cycle)
  requestAnimationFrame(() => {
    cycle()
    requestAnimationFrame(() => {
      cycle()
      window.setTimeout(cycle, 0)
      window.setTimeout(cycle, 50)
    })
  })
}
