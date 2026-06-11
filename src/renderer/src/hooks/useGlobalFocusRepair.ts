import { useEffect } from 'react'

import {
  isFocusDetached,
  isFormFieldFocused,
  repairStaleFocus
} from '@renderer/utils/blurActiveElement'

/**
 * Filet de sécurité global : répare le focus détaché après modales / `confirm()` / clics.
 */
export function useGlobalFocusRepair(): void {
  useEffect(() => {
    const onWindowFocus = (): void => {
      repairStaleFocus()
    }

    const onPointerDown = (): void => {
      if (isFocusDetached()) {
        repairStaleFocus()
      }
    }

    window.addEventListener('focus', onWindowFocus)
    document.addEventListener('pointerdown', onPointerDown, true)

    return () => {
      window.removeEventListener('focus', onWindowFocus)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [])
}

export { isFormFieldFocused }
