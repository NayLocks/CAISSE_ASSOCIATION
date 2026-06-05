import {
  getActiveAssociationId,
  getEffectiveLicenseAssociationCode,
  readRegistry
} from './associationRegistry.js'
import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'
import { loadPersistedData } from './stateStore.js'
import {
  loadLicense,
  maskLicenseKey,
  resolveWebLicenseCredentials,
  getOrCreateMachineId,
  saveLicenseOnlineOkFromLicense,
  getLicenseOnlineOkCache,
  clearLicenseOnlineOkCache,
  credentialsMatchOnlineCache,
  type LicenseOnlineOkCache
} from './licenseStore.js'
import {
  licenseExpiredByDate,
  normalizeWebLicenseKey,
  webLicenseLookup,
  webLicenseActivateAssociationsIfNeeded,
  isWebLicenseLookupNetworkFailure,
  isWebLicenseActivateAssociationsNetworkFailure,
  type WebLicenseCredentials,
  type WebLicenseLookupOk,
  type WebLicenseLookupFail
} from './webLicenseClient.js'

export type LicenseDisplayStatus = 'inactive' | 'valid' | 'invalid' | 'unconfigured'

export type LicenseGetResult = {
  hasKey: boolean
  maskedKey: string
  status: 'active' | 'inactive'
  displayStatus: LicenseDisplayStatus
  mode: 'none' | 'web'
  reason?: string
  detail?: string
  /** Origine de l’état « valide » affiché (ligne Vérification / détail). */
  verificationSource?: 'online' | 'offline_grace'
  offlineGrace?: {
    lastVerifiedAtMs: number
    validUntilMs: number
  }
  payloadSummary?: {
    type: string
    expiresAt: string | null
    associationsLabel: string
  }
  webSettings?: {
    projectCode: string
    licenseKeyMasked: string
  }
}

const OFFLINE_LICENSE_GRACE_MS = 2 * 24 * 60 * 60 * 1000

function formatFrDateTime(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

function lookupFailureReason(r: WebLicenseLookupFail): string {
  if (r.message && r.message.trim()) return r.message.trim()
  const err = typeof r.error === 'string' ? r.error : ''
  if (err === 'unknown_license') return 'Clé inconnue pour ce logiciel.'
  if (err === 'unauthorized') return 'Code logiciel inconnu ou invalide.'
  return 'Le serveur de licences a refusé la vérification.'
}

function messageForRefusedOrDisabledStatus(status: string): string {
  const s = String(status).toLowerCase()
  if (s === 'disabled') return 'Licence désactivée sur le serveur.'
  if (s === 'blocked') return 'Licence bloquée sur le serveur.'
  if (s === 'refused' || s === 'rejected') return 'Licence refusée sur le serveur.'
  if (s === 'suspended') return 'Licence suspendue sur le serveur.'
  if (s === 'inactive') return 'Licence non activable (statut encore « inactive » après tentative d’activation). Contactez l’éditeur.'
  return `Statut sur le serveur : « ${status} ». Contactez l’éditeur.`
}

function cacheToLicenseShape(cache: LicenseOnlineOkCache): WebLicenseLookupOk['license'] {
  return {
    license_key: cache.licenseKeyNorm,
    status: 'active',
    expires_at: cache.expiresAt,
    max_activations: cache.maxActivations,
    activation_count: cache.activationCount,
    association_mode: cache.associationMode,
    max_associations: cache.maxAssociations,
    notes: null
  }
}

function tryOfflineGrace(
  cred: WebLicenseCredentials
): { ok: true; offline: true; license: WebLicenseLookupOk['license'] } | null {
  const cache = getLicenseOnlineOkCache()
  if (!cache || !credentialsMatchOnlineCache(cred, cache)) return null
  const elapsed = Date.now() - cache.lastOkAtMs
  if (elapsed > OFFLINE_LICENSE_GRACE_MS) return null
  if (licenseExpiredByDate(cache.expiresAt)) return null
  return { ok: true, offline: true, license: cacheToLicenseShape(cache) }
}

type EvaluateOk = { ok: true; offline: boolean; license: WebLicenseLookupOk['license'] }
type EvaluateFail = { ok: false; reason: string }
type EvaluateResult = EvaluateOk | EvaluateFail

async function evaluateWebLicenseOnline(cred: WebLicenseCredentials): Promise<EvaluateResult> {
  const r = await webLicenseLookup(cred)
  if (!r.ok) {
    if (isWebLicenseLookupNetworkFailure(r)) {
      const g = tryOfflineGrace(cred)
      if (g) return g
      return {
        ok: false,
        reason:
          'Pas de connexion au serveur de licences et aucune vérification en ligne réussie au cours des 2 derniers jours. Connectez l’appareil à Internet pour renouveler la vérification.'
      }
    }
    clearLicenseOnlineOkCache()
    return { ok: false, reason: lookupFailureReason(r) }
  }

  let L = r.license

  if (String(L.status).toLowerCase() === 'revoked') {
    clearLicenseOnlineOkCache()
    return { ok: false, reason: 'Licence révoquée sur le serveur.' }
  }
  if (licenseExpiredByDate(L.expires_at)) {
    clearLicenseOnlineOkCache()
    return { ok: false, reason: 'Licence expirée.' }
  }

  if (String(L.status).toLowerCase() === 'inactive') {
    const machine = getOrCreateMachineId()
    const batch = await webLicenseActivateAssociationsIfNeeded(cred, machine, L)
    if (!batch.ok) {
      if (isWebLicenseActivateAssociationsNetworkFailure(batch)) {
        const g = tryOfflineGrace(cred)
        if (g) return g
        return {
          ok: false,
          reason: batch.message ?? 'Impossible de joindre le serveur de licences pour l’activation.'
        }
      }
      clearLicenseOnlineOkCache()
      return { ok: false, reason: batch.message }
    }
    const r2 = await webLicenseLookup(cred)
    if (!r2.ok) {
      if (isWebLicenseLookupNetworkFailure(r2)) {
        const g = tryOfflineGrace(cred)
        if (g) return g
        const merged: WebLicenseLookupOk['license'] = { ...L, status: 'active' }
        saveLicenseOnlineOkFromLicense(cred, merged)
        return { ok: true, offline: false, license: merged }
      }
      return { ok: false, reason: lookupFailureReason(r2) }
    }
    L = r2.license
  }

  const st = String(L.status).toLowerCase()
  if (st !== 'active') {
    clearLicenseOnlineOkCache()
    return { ok: false, reason: messageForRefusedOrDisabledStatus(L.status) }
  }

  saveLicenseOnlineOkFromLicense(cred, L)
  return { ok: true, offline: false, license: L }
}

function withStoredWebFormFields<T extends LicenseGetResult>(r: T): T {
  const f = loadLicense().web
  if (!f) return r
  return {
    ...r,
    webSettings: {
      projectCode: f.projectCode,
      licenseKeyMasked: maskLicenseKey(normalizeWebLicenseKey(f.licenseKey))
    }
  }
}

async function buildWebLicenseStatusForIpc(cred: WebLicenseCredentials): Promise<LicenseGetResult> {
  const maskedKey = maskLicenseKey(normalizeWebLicenseKey(cred.licenseKey))
  const e = await evaluateWebLicenseOnline(cred)
  if (!e.ok) {
    return withStoredWebFormFields({
      hasKey: true,
      maskedKey,
      status: 'inactive',
      displayStatus: 'invalid',
      mode: 'web',
      reason: e.reason,
      detail: 'Vérification en ligne (license-lookup / activation).'
    })
  }
  const L = e.license
  const cache = getLicenseOnlineOkCache()
  const graceWindow =
    e.offline && cache && credentialsMatchOnlineCache(cred, cache)
      ? { lastVerifiedAtMs: cache.lastOkAtMs, validUntilMs: cache.lastOkAtMs + OFFLINE_LICENSE_GRACE_MS }
      : undefined
  const offlineDetail =
    graceWindow != null
      ? `Hors connexion : dernière vérification en ligne réussie le ${formatFrDateTime(graceWindow.lastVerifiedAtMs)}. Utilisation autorisée sans réseau jusqu’au ${formatFrDateTime(graceWindow.validUntilMs)} (2 jours après cette vérification).`
      : 'Hors connexion : utilisation autorisée dans la limite de 2 jours après la dernière vérification en ligne réussie.'

  return withStoredWebFormFields({
    hasKey: true,
    maskedKey,
    status: 'active',
    displayStatus: 'valid',
    mode: 'web',
    verificationSource: e.offline ? 'offline_grace' : 'online',
    offlineGrace: graceWindow,
    detail: e.offline ? offlineDetail : 'Licence vérifiée sur le serveur.',
    payloadSummary: {
      type: `Serveur (${L.association_mode === 'multi' ? 'multi' : 'mono'} asso.)`,
      expiresAt: L.expires_at ? `${String(L.expires_at).slice(0, 10)}T00:00:00.000Z` : null,
      associationsLabel: `Postes : ${L.activation_count}/${L.max_activations} — Associations max : ${L.max_associations}`
    }
  })
}

export async function getLicenseStatusForIpc(): Promise<LicenseGetResult> {
  const cred = resolveWebLicenseCredentials(loadLicense())
  if (cred) {
    return buildWebLicenseStatusForIpc(cred)
  }
  return {
    hasKey: false,
    maskedKey: '—',
    status: 'inactive',
    displayStatus: 'inactive',
    mode: 'none',
    reason: 'Aucune licence enregistrée. Renseignez la clé ci-dessous.'
  }
}

export type AssociationLicenseGate = { allowed: true } | { allowed: false; reason: string }

/** Codes d’association renvoyés par license-lookup ; null si liste absente ou vide. */
function licenseServerAssociationCodeSet(license: WebLicenseLookupOk['license']): Set<string> | null {
  const rows = license.associations
  if (!Array.isArray(rows) || rows.length === 0) return null
  const s = new Set<string>()
  for (const row of rows) {
    const c = normalizeLicenseAssociationCode(typeof row.code === 'string' ? row.code : '')
    if (c) s.add(c)
  }
  return s.size > 0 ? s : null
}

export async function getAssociationAccessGate(
  associationId: string,
  licenseAssociationCode: string | null | undefined
): Promise<AssociationLicenseGate> {
  const credWeb = resolveWebLicenseCredentials(loadLicense())
  if (!credWeb) {
    return {
      allowed: false,
      reason: 'Aucune licence enregistrée. Utilisez « Licence & activation » sur l’écran d’accueil.'
    }
  }
  const e = await evaluateWebLicenseOnline(credWeb)
  if (!e.ok) {
    return { allowed: false, reason: e.reason }
  }

  const effective = getEffectiveLicenseAssociationCode(associationId)
  const localNorm = normalizeLicenseAssociationCode(licenseAssociationCode ?? effective ?? null)

  const serverCodes = licenseServerAssociationCodeSet(e.license)
  if (serverCodes !== null) {
    if (!localNorm || !serverCodes.has(localNorm)) {
      return {
        allowed: false,
        reason:
          'Ce profil ne correspond pas à une association couverte par cette licence. Vérifiez le code association (identique à celui défini sur le serveur pour cette clé) ou supprimez les profils locaux inutiles.'
      }
    }
    return { allowed: true }
  }

  const reg = readRegistry()
  if (reg.items.length > e.license.max_associations) {
    return {
      allowed: false,
      reason: `Cette licence autorise au plus ${e.license.max_associations} association(s). Réduisez le nombre d’associations ou étendez la licence.`
    }
  }
  return { allowed: true }
}

export async function validateNewAssociationLicense(
  _proposedAssociationId: string,
  _licenseAssociationCode: string | null | undefined,
  opts?: { requireRemoteNewAssociation?: boolean; adminNotifyForExistingCode?: boolean }
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const credWebNew = resolveWebLicenseCredentials(loadLicense())
  if (!credWebNew) {
    return {
      ok: false,
      reason: 'Aucune licence enregistrée. Complétez « Licence & activation » avant de créer une association.'
    }
  }
  const e = await evaluateWebLicenseOnline(credWebNew)
  if (!e.ok) {
    return { ok: false, reason: e.reason }
  }
  const maxA = e.license.max_associations
  const nLocal = readRegistry().items.length

  if (opts?.adminNotifyForExistingCode) {
    if (e.offline) {
      return {
        ok: false,
        reason:
          'Connexion Internet requise pour envoyer une demande à l’administrateur via le serveur de licences.'
      }
    }
    const mode = String(e.license.association_mode).toLowerCase()
    if (mode !== 'multi') {
      return {
        ok: false,
        reason:
          'Cette licence est en mode « solo » : seul l’éditeur gère les associations. Vous ne pouvez pas solliciter de création depuis l’application.'
      }
    }
    return { ok: true }
  }

  if (opts?.requireRemoteNewAssociation) {
    if (e.offline) {
      return {
        ok: false,
        reason:
          'Connexion Internet requise pour créer une association sur le serveur de licences. Réessayez une fois en ligne.'
      }
    }
    const mode = String(e.license.association_mode).toLowerCase()
    if (mode !== 'multi') {
      return {
        ok: false,
        reason:
          'Cette licence est en mode « solo » : les associations sont définies sur le serveur uniquement. Vous ne pouvez pas en ajouter depuis l’application.'
      }
    }
    // Plafond = nombre de lignes d’associations côté serveur (license-lookup), pas le nombre de profils locaux.
    const serverRows = e.license.associations
    if (Array.isArray(serverRows)) {
      if (serverRows.length >= maxA) {
        return {
          ok: false,
          reason: `Le nombre d’associations sur le serveur (${serverRows.length}) atteint le plafond (${maxA}).`
        }
      }
    } else {
      const slots =
        typeof e.license.association_slots_total === 'number' ? e.license.association_slots_total : null
      if (slots !== null && Number.isFinite(slots) && slots >= maxA) {
        return {
          ok: false,
          reason: `Le serveur indique ${slots} association(s) liées à cette clé, plafond ${maxA}. Utilisez « Mettre à jour les données de la licence ».`
        }
      }
      if (nLocal >= maxA) {
        return {
          ok: false,
          reason: `Nombre maximum d’associations pour cette licence (${maxA}) (profils locaux). Réduisez-les ou synchronisez la licence pour voir l’état serveur.`
        }
      }
    }
    return { ok: true }
  }

  if (nLocal >= maxA) {
    return {
      ok: false,
      reason: `Nombre maximum d’associations pour cette licence (${maxA}).`
    }
  }
  return { ok: true }
}

export async function checkLicenseMatchesActiveAssociation(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const assocId = getActiveAssociationId()
  if (!assocId) return { ok: true }
  const data = loadPersistedData()
  const gate = await getAssociationAccessGate(assocId, data.association.licenseAssociationCode)
  if (!gate.allowed) return { ok: false, reason: gate.reason }
  return { ok: true }
}

/**
 * Teste l’API (license-lookup) sans enregistrer — pour le bouton « Tester l’API ».
 */
export async function testWebLicenseLookupFromForm(cred: WebLicenseCredentials): Promise<
  { ok: true; message: string } | { ok: false; message: string }
> {
  const r = await webLicenseLookup(cred)
  if (!r.ok) {
    return { ok: false, message: r.message ?? lookupFailureReason(r) }
  }
  const L = r.license
  const parts = [
    'Réponse OK : le serveur de licences a renvoyé les informations de la clé.',
    `Statut licence : ${L.status}.`,
    L.expires_at ? `Expire le : ${String(L.expires_at).slice(0, 10)}.` : 'Sans date d’expiration.',
    `Postes : ${L.activation_count}/${L.max_activations}.`,
    `Associations max : ${L.max_associations}.`
  ]
  const assoN = Array.isArray(L.associations) ? L.associations.length : 0
  if (assoN > 0) {
    parts.push(`Associations renvoyées par le serveur : ${assoN}.`)
  }
  if (String(L.status).toLowerCase() === 'inactive') {
    parts.push('Cette clé est « inactive » : enregistrez-la dans l’application pour lancer l’activation sur ce poste.')
  }
  return { ok: true, message: parts.join(' ') }
}
