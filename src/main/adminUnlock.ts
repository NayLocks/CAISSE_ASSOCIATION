import { createHash } from 'crypto'

import { getOrCreateMachineId } from './licenseStore.js'
import { webLicenseVerifyAdminPassword } from './webLicenseClient.js'
import {
  resolveWebLicencesPublicProjectCode,
  WEB_LICENSE_API_PUBLIC_BASE
} from '../shared/webLicenseEndpoint.js'

/** Cache session : évite de re-interroger le serveur à chaque action sensible. */
const ADMIN_SESSION_MS = 30 * 60 * 1000
let cachedAdminPinDigest: string | null = null
let cachedAdminUntilMs = 0

export type LicenseServerAdminPinResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'network' | 'timeout' }

function adminPinDigest(pin: string): string {
  return createHash('sha256').update(pin, 'utf8').digest('hex')
}

/**
 * Code maître = code administrateur WEB_LICENCES (`admin_password` côté serveur).
 * Remplace le PIN association pour déverrouiller la caisse et les opérations sensibles.
 * Nécessite une connexion Internet au moment de la saisie (sauf cache session récent).
 */
export async function verifyLicenseServerAdminPin(
  pin: string | undefined | null
): Promise<LicenseServerAdminPinResult> {
  if (typeof pin !== 'string') return { ok: false, reason: 'wrong' }
  const trimmed = pin.trim()
  if (!trimmed) return { ok: false, reason: 'wrong' }

  const digest = adminPinDigest(trimmed)
  const now = Date.now()
  if (cachedAdminPinDigest === digest && now < cachedAdminUntilMs) {
    return { ok: true }
  }

  const r = await webLicenseVerifyAdminPassword({
    apiBaseUrl: WEB_LICENSE_API_PUBLIC_BASE,
    projectCode: resolveWebLicencesPublicProjectCode(),
    adminPassword: trimmed,
    machineId: getOrCreateMachineId()
  })
  if (r.ok) {
    cachedAdminPinDigest = digest
    cachedAdminUntilMs = now + ADMIN_SESSION_MS
    return { ok: true }
  }
  return { ok: false, reason: r.reason }
}

/** Raccourci booléen pour les chemins qui n’ont pas besoin du détail réseau. */
export async function isLicenseServerAdminPin(pin: string | undefined | null): Promise<boolean> {
  const r = await verifyLicenseServerAdminPin(pin)
  return r.ok
}
