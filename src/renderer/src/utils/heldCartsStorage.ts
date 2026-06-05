import type { AssociationConfig } from '@shared/catalog'
import type { RemoteCaisseMirror } from '@shared/remoteCaisseMirror'

const PREFIX = 'caisse-held-carts-v1:'
const FILE_VERSION = 2 as const

export type StoredHeldCart = {
  id: string
  displayName: string
  totalCents: number
  lineCount: number
  savedAt: number
  mirror: RemoteCaisseMirror
}

export type HeldCartPersistedState = {
  entries: StoredHeldCart[]
  /** Prochain numéro pour le libellé « Ticket NNN » (incrémenté après chaque mise en attente). */
  nextHoldTicketNum: number
}

type StoredFileV2 = { v: typeof FILE_VERSION; nextHoldTicketNum: number; entries: StoredHeldCart[] }
type StoredFileV1 = { v: 1; entries: StoredHeldCart[] }

function associationFingerprint(a: AssociationConfig): string {
  const lic = (a.licenseAssociationCode ?? '').trim().toUpperCase()
  const num = (a.numero ?? '').trim()
  const name = (a.name ?? '').trim().slice(0, 64)
  return `${lic}|${num}|${name}`
}

export function heldCartsStorageKey(association: AssociationConfig, eventId: string | null): string {
  return `${PREFIX}${encodeURIComponent(associationFingerprint(association))}:${eventId ?? '_no_event_'}`
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isMirror(x: unknown): x is RemoteCaisseMirror {
  if (!isRecord(x)) return false
  if (!isRecord(x.quantities)) return false
  if (typeof x.refundMode !== 'boolean') return false
  return true
}

function isEntry(x: unknown): x is StoredHeldCart {
  if (!isRecord(x)) return false
  if (typeof x.id !== 'string' || !x.id) return false
  if (typeof x.displayName !== 'string') return false
  if (typeof x.totalCents !== 'number' || !Number.isFinite(x.totalCents)) return false
  if (typeof x.lineCount !== 'number' || !Number.isFinite(x.lineCount)) return false
  if (typeof x.savedAt !== 'number' || !Number.isFinite(x.savedAt)) return false
  return isMirror(x.mirror)
}

function inferNextTicketNumFromEntries(entries: StoredHeldCart[]): number {
  let max = 0
  const re = /^Ticket\s+(\d+)$/i
  for (const e of entries) {
    const m = re.exec(e.displayName.trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

export function readHeldCartState(storageKey: string): HeldCartPersistedState {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return { entries: [], nextHoldTicketNum: 1 }
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
      return { entries: [], nextHoldTicketNum: 1 }
    }
    const entries = parsed.entries.filter(isEntry)
    if (parsed.v === FILE_VERSION) {
      const n = parsed.nextHoldTicketNum
      const nextHoldTicketNum =
        typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : inferNextTicketNumFromEntries(entries)
      return { entries, nextHoldTicketNum }
    }
    if (parsed.v === 1) {
      const v1 = parsed as StoredFileV1
      return {
        entries,
        nextHoldTicketNum: inferNextTicketNumFromEntries(entries)
      }
    }
    return { entries: [], nextHoldTicketNum: 1 }
  } catch {
    return { entries: [], nextHoldTicketNum: 1 }
  }
}

export function writeHeldCartState(storageKey: string, state: HeldCartPersistedState): void {
  try {
    const payload: StoredFileV2 = {
      v: FILE_VERSION,
      nextHoldTicketNum: state.nextHoldTicketNum,
      entries: state.entries
    }
    localStorage.setItem(storageKey, JSON.stringify(payload))
  } catch {
    /* quota ou navigation privée */
  }
}
