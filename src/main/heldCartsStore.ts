import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { HeldCartPersistedState, StoredHeldCart } from '../shared/heldCarts.js'
import { MAX_HELD_CARTS } from '../shared/heldCarts.js'
import type { RemoteCaisseMirror } from '../shared/remoteCaisseMirror.js'
import { formatOrderDigits } from '../shared/orderDigits.js'
import { associationDataDir, getActiveAssociationIdRequired } from './associationRegistry.js'
import { bumpRemoteStateRev } from './remoteCaisseState.js'
import { executeRemoteHoldSlipPrint } from './remoteCaissePrint.js'
import { loadPersistedData } from './stateStore.js'

const FILENAME = 'held-carts-by-event.json'

type FileShape = { version: 1; events: Record<string, HeldCartPersistedState> }

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isMirror(x: unknown): x is RemoteCaisseMirror {
  if (!isRecord(x)) return false
  if (!isRecord(x.quantities)) return false
  return typeof x.refundMode === 'boolean'
}

function sanitizeEntry(x: unknown): StoredHeldCart | null {
  if (!isRecord(x)) return null
  if (typeof x.id !== 'string' || !x.id) return null
  if (typeof x.displayName !== 'string') return null
  if (typeof x.totalCents !== 'number' || !Number.isFinite(x.totalCents)) return null
  if (typeof x.lineCount !== 'number' || !Number.isFinite(x.lineCount)) return null
  if (typeof x.savedAt !== 'number' || !Number.isFinite(x.savedAt)) return null
  if (!isMirror(x.mirror)) return null
  return {
    id: x.id,
    displayName: x.displayName.trim(),
    totalCents: Math.round(x.totalCents),
    lineCount: Math.max(0, Math.floor(x.lineCount)),
    savedAt: Math.floor(x.savedAt),
    mirror: x.mirror
  }
}

function inferNextTicketNum(entries: StoredHeldCart[]): number {
  let max = 0
  const re = /^Ticket\s+(\d+)$/i
  for (const e of entries) {
    const m = re.exec(e.displayName.trim())
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

function sanitizeState(raw: unknown): HeldCartPersistedState {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    return { entries: [], nextHoldTicketNum: 1 }
  }
  const entries = raw.entries.map(sanitizeEntry).filter((e): e is StoredHeldCart => e != null)
  const n = raw.nextHoldTicketNum
  const nextHoldTicketNum =
    typeof n === 'number' && Number.isFinite(n) && n >= 1
      ? Math.floor(n)
      : inferNextTicketNum(entries)
  return { entries, nextHoldTicketNum }
}

function readFile(): FileShape {
  const p = join(associationDataDir(getActiveAssociationIdRequired()), FILENAME)
  if (!existsSync(p)) return { version: 1, events: {} }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as unknown
    if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.events)) {
      return { version: 1, events: {} }
    }
    const events: Record<string, HeldCartPersistedState> = {}
    for (const [eid, st] of Object.entries(raw.events)) {
      events[eid] = sanitizeState(st)
    }
    return { version: 1, events }
  } catch {
    return { version: 1, events: {} }
  }
}

function writeFile(f: FileShape): void {
  const p = join(associationDataDir(getActiveAssociationIdRequired()), FILENAME)
  writeFileSync(p, JSON.stringify(f, null, 2), 'utf-8')
  bumpRemoteStateRev()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('held-carts:updated')
    w.webContents.send('remote-caisse:refresh-data')
  }
}

function selectedEventId(): string | null {
  return loadPersistedData().selectedEventId
}

function emptyState(): HeldCartPersistedState {
  return { entries: [], nextHoldTicketNum: 1 }
}

export function getHeldCartsForSelectedEvent(): HeldCartPersistedState {
  const eid = selectedEventId()
  if (!eid) return emptyState()
  const f = readFile()
  return f.events[eid] ?? emptyState()
}

export function setHeldCartsForSelectedEvent(state: HeldCartPersistedState): HeldCartPersistedState {
  const eid = selectedEventId()
  if (!eid) throw new Error('Aucun événement sélectionné.')
  const f = readFile()
  f.events[eid] = sanitizeState(state)
  writeFile(f)
  return f.events[eid]
}

export function addHeldCartForSelectedEvent(payload: {
  displayName?: string
  totalCents: number
  lineCount: number
  mirror: RemoteCaisseMirror
}): { ok: true; entry: StoredHeldCart; state: HeldCartPersistedState } | { ok: false; error: string } {
  const eid = selectedEventId()
  if (!eid) return { ok: false, error: 'Aucun événement sélectionné.' }
  const f = readFile()
  const cur = f.events[eid] ?? emptyState()
  if (cur.entries.length >= MAX_HELD_CARTS) {
    return {
      ok: false,
      error: `Maximum ${MAX_HELD_CARTS} paniers en attente. Reprenez ou supprimez-en un.`
    }
  }
  if (!isMirror(payload.mirror)) return { ok: false, error: 'Panier invalide.' }
  const displayName =
    typeof payload.displayName === 'string' && payload.displayName.trim()
      ? payload.displayName.trim()
      : `Ticket ${formatOrderDigits(cur.nextHoldTicketNum)}`
  const entry: StoredHeldCart = {
    id: randomUUID(),
    displayName,
    totalCents: Math.round(payload.totalCents),
    lineCount: Math.max(0, Math.floor(payload.lineCount)),
    savedAt: Date.now(),
    mirror: payload.mirror
  }
  const next: HeldCartPersistedState = {
    entries: [...cur.entries, entry],
    nextHoldTicketNum: cur.nextHoldTicketNum + 1
  }
  f.events[eid] = next
  writeFile(f)
  return { ok: true, entry, state: next }
}

export function removeHeldCartForSelectedEvent(id: string): HeldCartPersistedState {
  const eid = selectedEventId()
  if (!eid) throw new Error('Aucun événement sélectionné.')
  const f = readFile()
  const cur = f.events[eid] ?? emptyState()
  const next: HeldCartPersistedState = {
    ...cur,
    entries: cur.entries.filter((e) => e.id !== id)
  }
  f.events[eid] = next
  writeFile(f)
  return next
}

/** Impression du ticket d’attente puis enregistrement atomique (pas de ticket sans panier sauvegardé). */
export async function placeHeldCartForSelectedEvent(payload: {
  displayName?: string
  totalCents: number
  lineCount: number
  mirror: RemoteCaisseMirror
}): Promise<
  { ok: true; entry: StoredHeldCart; state: HeldCartPersistedState } | { ok: false; error: string }
> {
  const eid = selectedEventId()
  if (!eid) return { ok: false, error: 'Aucun événement sélectionné.' }
  const f = readFile()
  const cur = f.events[eid] ?? emptyState()
  if (cur.entries.length >= MAX_HELD_CARTS) {
    return {
      ok: false,
      error: `Maximum ${MAX_HELD_CARTS} paniers en attente. Reprenez ou supprimez-en un.`
    }
  }
  if (!isMirror(payload.mirror)) return { ok: false, error: 'Panier invalide.' }
  const displayName =
    typeof payload.displayName === 'string' && payload.displayName.trim()
      ? payload.displayName.trim()
      : `Ticket ${formatOrderDigits(cur.nextHoldTicketNum)}`
  const printResult = await executeRemoteHoldSlipPrint(displayName)
  if (!printResult.ok) return printResult
  return addHeldCartForSelectedEvent({ ...payload, displayName })
}
