import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHORTCUTS,
  validateUniqueShortcuts,
  normalizeShortcutToken,
  type ShortcutId
} from './keyboardShortcutsStorage'

describe('keyboardShortcutsStorage', () => {
  it('normalise F minuscules et espaces', () => {
    expect(normalizeShortcutToken(' f10 ')).toBe('F10')
  })

  it('accepte une combinaison de touches toutes distinctes', () => {
    expect(validateUniqueShortcuts({ ...DEFAULT_SHORTCUTS })).toBeNull()
  })

  it('refuse deux fois la même touche', () => {
    const bad: Record<ShortcutId, string> = {
      ...DEFAULT_SHORTCUTS,
      holdCart: 'F1'
    }
    expect(validateUniqueShortcuts(bad)).toMatch(/différente/)
  })
})
