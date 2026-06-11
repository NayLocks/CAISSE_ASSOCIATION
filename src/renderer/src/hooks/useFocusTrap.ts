import { useEffect, type RefObject } from 'react'

import { isFocusDetached, repairStaleFocus } from '@renderer/utils/blurActiveElement'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Piège le focus Tab/Shift+Tab dans le conteneur tant que `active` est vrai.
 * À la fermeture, restaure le focus précédent ou répare un focus détaché (bug Electron).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return

    let cancelled = false
    let removeKeyListener: (() => void) | null = null
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const attach = (): void => {
      if (cancelled) return
      const root = containerRef.current
      if (!root) {
        requestAnimationFrame(attach)
        return
      }

      const first = root.querySelector<HTMLElement>(FOCUSABLE)
      if (first && document.activeElement !== first) {
        first.focus({ preventScroll: true })
      }

      const onKey = (e: KeyboardEvent): void => {
        if (e.key !== 'Tab') return
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
        )
        if (nodes.length === 0) return
        const i = nodes.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey) {
          if (i <= 0) {
            e.preventDefault()
            nodes[nodes.length - 1]?.focus()
          }
        } else if (i === -1 || i >= nodes.length - 1) {
          e.preventDefault()
          nodes[0]?.focus()
        }
      }

      document.addEventListener('keydown', onKey, true)
      removeKeyListener = () => document.removeEventListener('keydown', onKey, true)
    }

    attach()

    return () => {
      cancelled = true
      removeKeyListener?.()
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        window.setTimeout(() => {
          previouslyFocused.focus({ preventScroll: true })
        }, 0)
      } else if (isFocusDetached()) {
        repairStaleFocus()
      }
    }
  }, [active, containerRef])
}
