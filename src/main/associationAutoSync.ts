import type { AppPersistedData } from '../shared/catalog.js'
import { sanitizeAssociationSyncAutoCheckIntervalSec } from '../shared/catalog.js'
import { loadPersistedData } from './stateStore.js'
import {
  associationSyncPerformCheck,
  associationSyncPerformDownloadApply,
  associationSyncPerformUpload
} from './associationSyncOps.js'
import {
  broadcastAssociationAutoSyncStatus,
  broadcastAssociationDataApplied
} from './associationSyncEvents.js'

export {
  ASSOCIATION_AUTO_SYNC_STATUS_EVENT,
  ASSOCIATION_AUTO_SYNC_DATA_APPLIED_EVENT,
  type AssociationAutoSyncStatusPayload
} from './associationSyncEvents.js'

type CartGate = {
  hasCartLines: boolean
  paymentOpen: boolean
}

let cartGate: CartGate = { hasCartLines: false, paymentOpen: false }
let cycleRunning = false
let pendingServerDownload = false
let loopTimer: ReturnType<typeof setTimeout> | null = null

export function resolveAssociationAutoSyncPin(data: AppPersistedData): string | null {
  if (data.security.pinHash === null) return ''
  const p = (data.associationSyncAutoPin ?? '').trim()
  if (!p) return null
  return p
}

export function setAssociationAutoSyncCartGate(gate: CartGate): void {
  const prev = cartGate
  cartGate = {
    hasCartLines: Boolean(gate.hasCartLines),
    paymentOpen: Boolean(gate.paymentOpen)
  }
  const wasBlocked = prev.hasCartLines || prev.paymentOpen
  const nowClear = !cartGate.hasCartLines && !cartGate.paymentOpen
  if (pendingServerDownload && wasBlocked && nowClear) {
    void runAssociationAutoSyncCycle()
  }
}

function cartBlocksAutoApply(): boolean {
  return cartGate.hasCartLines || cartGate.paymentOpen
}

export async function associationAutoSyncUploadAfterSale(): Promise<void> {
  const data = loadPersistedData()
  if (!data.associationSyncAutoCheckEnabled) return
  const pin = resolveAssociationAutoSyncPin(data)
  if (pin === null) return
  const up = await associationSyncPerformUpload(pin)
  if (up.ok) {
    broadcastAssociationDataApplied()
  }
}

export async function runAssociationAutoSyncCycle(): Promise<void> {
  if (cycleRunning) return
  cycleRunning = true
  try {
    const data = loadPersistedData()
    if (!data.associationSyncAutoCheckEnabled) {
      pendingServerDownload = false
      broadcastAssociationAutoSyncStatus(null)
      return
    }

    const check = await associationSyncPerformCheck()
    if (!check.ok) {
      pendingServerDownload = false
      broadcastAssociationAutoSyncStatus(null)
      return
    }

    const c = check.check
    const pin = resolveAssociationAutoSyncPin(data)

    if (c.needs_download === true) {
      if (cartBlocksAutoApply()) {
        pendingServerDownload = true
        broadcastAssociationAutoSyncStatus(
          'Système de synchro auto : copie serveur plus récente — application dès que le panier est vide et le paiement fermé.'
        )
        return
      }
      pendingServerDownload = false
      if (pin === null) {
        broadcastAssociationAutoSyncStatus(
          'Système de synchro auto : copie serveur plus récente — renseignez le PIN synchro dans Sauvegarde pour l’application automatique.'
        )
        return
      }
      const dl = await associationSyncPerformDownloadApply(pin)
      if (dl.ok) {
        broadcastAssociationDataApplied()
        broadcastAssociationAutoSyncStatus(null)
        return
      }
      broadcastAssociationAutoSyncStatus(`Synchro auto : ${dl.message}`)
      return
    }

    pendingServerDownload = false

    if (c.has_server_snapshot && c.client_is_aligned_with_server === false) {
      if (!cartBlocksAutoApply() && pin !== null) {
        const up = await associationSyncPerformUpload(pin)
        if (up.ok) {
          broadcastAssociationDataApplied()
          broadcastAssociationAutoSyncStatus(null)
          return
        }
        broadcastAssociationAutoSyncStatus(`Synchro auto : ${up.message}`)
        return
      }
      broadcastAssociationAutoSyncStatus(
        'Cette caisse n’est pas alignée avec le serveur — la synchro auto enverra la copie après chaque vente ou dès que le panier est libre.'
      )
      return
    }

    broadcastAssociationAutoSyncStatus(null)
  } finally {
    cycleRunning = false
  }
}

function scheduleNextCycle(): void {
  if (loopTimer) clearTimeout(loopTimer)
  const data = loadPersistedData()
  if (!data.associationSyncAutoCheckEnabled) {
    loopTimer = null
    return
  }
  const sec = sanitizeAssociationSyncAutoCheckIntervalSec(data.associationSyncAutoCheckIntervalSec)
  loopTimer = setTimeout(() => {
    void runAssociationAutoSyncCycle().finally(scheduleNextCycle)
  }, sec * 1000)
}

/** Boucle de synchro auto (vérif. serveur, téléchargement si plus récent). */
export function startAssociationAutoSync(): void {
  void runAssociationAutoSyncCycle().finally(scheduleNextCycle)
}

export function restartAssociationAutoSyncLoop(): void {
  if (loopTimer) clearTimeout(loopTimer)
  loopTimer = null
  void runAssociationAutoSyncCycle().finally(scheduleNextCycle)
}
