import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const FNAME = 'association-code-request-tracker.json'

type Store = {
  /** Identifiants de demandes côté WEB_LICENCES qu’on suit (ex. notify_admin enregistré). */
  trackedRequestIds: number[]
  /** Demande(s) pour lesquelles l’utilisateur a déjà vu la réponse (modale Fermer). */
  dismissedResponseModalIds: number[]
}

function path(): string {
  return join(app.getPath('userData'), FNAME)
}

function emptyStore(): Store {
  return { trackedRequestIds: [], dismissedResponseModalIds: [] }
}

function loadStore(): Store {
  const p = path()
  if (!existsSync(p)) return emptyStore()
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as unknown
    if (!raw || typeof raw !== 'object') return emptyStore()
    const o = raw as Record<string, unknown>
    const tracked = o['trackedRequestIds']
    const dismissed = o['dismissedResponseModalIds']
    const t = Array.isArray(tracked) ? tracked.filter((x) => typeof x === 'number' && x > 0) : []
    const d = Array.isArray(dismissed) ? dismissed.filter((x) => typeof x === 'number' && x > 0) : []
    return {
      trackedRequestIds: [...new Set(t)],
      dismissedResponseModalIds: [...new Set(d)]
    }
  } catch {
    return emptyStore()
  }
}

function saveStore(s: Store): void {
  writeFileSync(path(), JSON.stringify(s, null, 2), 'utf-8')
}

export function trackAssociationRequestId(requestId: number): void {
  if (!Number.isFinite(requestId) || requestId <= 0) return
  const s = loadStore()
  if (!s.trackedRequestIds.includes(requestId)) {
    s.trackedRequestIds.push(requestId)
    saveStore(s)
  }
}

export function markAssociationRequestResponseDismissed(requestId: number): void {
  if (!Number.isFinite(requestId) || requestId <= 0) return
  const s = loadStore()
  if (!s.dismissedResponseModalIds.includes(requestId)) {
    s.dismissedResponseModalIds.push(requestId)
  }
  saveStore(s)
}

export function getIdsToPollForRequestStatus(): number[] {
  const s = loadStore()
  return s.trackedRequestIds.filter((id) => !s.dismissedResponseModalIds.includes(id))
}
