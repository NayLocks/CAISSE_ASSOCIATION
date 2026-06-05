import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Piège le focus Tab/Shift+Tab dans le conteneur tant que `active` est vrai
 * (modales paiement, remises, etc.).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  const prevActive = useRef(false)

  useEffect(() => {
    if (!active) {
      prevActive.current = false
      return
    }
    const root = containerRef.current
    if (!root) return

    if (!prevActive.current) {
      prevActive.current = true
      const first = root.querySelector<HTMLElement>(FOCUSABLE)
      window.setTimeout(() => first?.focus(), 0)
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !root) return
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
      } else {
        if (i === -1 || i >= nodes.length - 1) {
          e.preventDefault()
          nodes[0]?.focus()
        }
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [active, containerRef])
}
