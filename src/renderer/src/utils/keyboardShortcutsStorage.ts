/** Identifiants des raccourcis configurables (caisse + shell). */
export type ShortcutId =
  | 'help'
  | 'gotoCaisse'
  | 'holdCart'
  | 'focusSearch'
  | 'clearCart'
  | 'toggleRefund'
  | 'payCash'
  | 'payCard'

export const SHORTCUT_IDS: ShortcutId[] = [
  'help',
  'gotoCaisse',
  'holdCart',
  'focusSearch',
  'clearCart',
  'toggleRefund',
  'payCash',
  'payCard'
]

export const SHORTCUT_LABELS: Record<ShortcutId, string> = {
  help: 'Aide',
  gotoCaisse: 'Encaissement',
  holdCart: 'En attente',
  focusSearch: 'Recherche',
  clearCart: 'Vider panier',
  toggleRefund: 'Remboursement',
  payCash: 'Espèces',
  payCard: 'Carte'
}

const STORAGE_KEY = 'caisse-keyboard-shortcuts-v1'

/** Émis sur `window` après `writeKeyboardShortcuts` (même onglet). */
export const KEYBOARD_SHORTCUTS_CHANGED = 'caisse-keyboard-shortcuts-changed'

/** Valeurs par défaut (touche seule, sans modificateurs). */
export const DEFAULT_SHORTCUTS: Record<ShortcutId, string> = {
  help: 'F1',
  gotoCaisse: 'F2',
  holdCart: 'F3',
  focusSearch: '/',
  clearCart: 'F4',
  toggleRefund: 'F5',
  payCash: 'F6',
  payCard: 'F7'
}

const FN_RE = /^F([1-9]|1[0-2])$/i

/** Valeurs proposées dans l’écran de configuration des raccourcis. */
export const CHOOSEABLE_SHORTCUT_TOKENS: string[] = [
  '/',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12'
]

export function normalizeShortcutToken(raw: string): string {
  const t = raw.trim()
  if (t === '/') return '/'
  const u = t.toUpperCase()
  const m = FN_RE.exec(u)
  if (m) return `F${m[1]}`
  return ''
}

export function isValidShortcutToken(t: string): boolean {
  if (t === '/') return true
  return FN_RE.test(t.trim().toUpperCase())
}

/** Vérifie que chaque raccourci a une touche distincte (F1–F12 ou /). */
export function validateUniqueShortcuts(map: Record<ShortcutId, string>): string | null {
  const seen = new Set<string>()
  for (const id of SHORTCUT_IDS) {
    const n = normalizeShortcutToken(map[id] ?? '')
    if (!n || !isValidShortcutToken(n)) {
      return `Raccourci invalide pour « ${SHORTCUT_LABELS[id]} ».`
    }
    if (seen.has(n)) return 'Chaque raccourci doit utiliser une touche différente.'
    seen.add(n)
  }
  return null
}

export function readKeyboardShortcuts(): Record<ShortcutId, string> {
  const out = { ...DEFAULT_SHORTCUTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return out
    const p = JSON.parse(raw) as unknown
    if (typeof p !== 'object' || p === null || Array.isArray(p)) return out
    for (const id of SHORTCUT_IDS) {
      const v = (p as Record<string, unknown>)[id]
      if (typeof v !== 'string') continue
      const n = normalizeShortcutToken(v)
      if (n && isValidShortcutToken(n)) out[id] = n
    }
  } catch {
    /* ignore */
  }
  return out
}

export function writeKeyboardShortcuts(partial: Partial<Record<ShortcutId, string>>): void {
  const cur = readKeyboardShortcuts()
  const next = { ...cur }
  for (const [k, v] of Object.entries(partial)) {
    const id = k as ShortcutId
    if (!SHORTCUT_IDS.includes(id)) continue
    const n = normalizeShortcutToken(v ?? '')
    if (n && isValidShortcutToken(n)) next[id] = n
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(KEYBOARD_SHORTCUTS_CHANGED))
  } catch {
    /* ignore (tests sans window) */
  }
}

/** Compare un KeyboardEvent à une spécification (F3, /, …). */
export function eventMatchesShortcut(e: KeyboardEvent, spec: string): boolean {
  if (e.repeat) return false
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  const s = normalizeShortcutToken(spec)
  if (!s) return false
  if (s === '/') return e.key === '/'
  return e.key.toUpperCase() === s.toUpperCase()
}
