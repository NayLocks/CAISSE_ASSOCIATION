import {
  clearLicenseOnlineOkCache,
  getOrCreateMachineId,
  loadLicense,
  resolveWebLicenseCredentials,
  saveLicenseOnlineOkFromLicense
} from './licenseStore.js'
import { licenseExpiredByDate, webLicenseActivateAssociationsIfNeeded, webLicenseLookup } from './webLicenseClient.js'
import { pruneLocalAssociationsNotOnServer, syncLocalAssociationsFromLicense } from './syncAssociationsFromLicense.js'
import { WEB_LICENSE_API_PUBLIC_BASE } from '../shared/webLicenseEndpoint.js'

export type LicenseDataRefreshResult = { ok: true; message: string } | { ok: false; message: string }

/**
 * Vérifie l’accès réseau au même hôte que les API de licence (hors requête métier).
 * Évite d’enchaîner license-lookup / activation sans connexion.
 */
export async function isNetworkReachableForWebLicenses(): Promise<boolean> {
  const base = WEB_LICENSE_API_PUBLIC_BASE.replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000)
    })
    void res.body?.cancel?.()
    return true
  } catch {
    return false
  }
}

/**
 * Même logique que l’IPC `license:refresh-data` (sync assos, activation, cache hors ligne).
 */
export async function runLicenseDataRefresh(): Promise<LicenseDataRefreshResult> {
  try {
    const cred = resolveWebLicenseCredentials(loadLicense())
    if (!cred) {
      return { ok: false, message: 'Aucune clé de licence enregistrée sur cet ordinateur.' }
    }
    const look = await webLicenseLookup(cred)
    if (!look.ok) {
      return {
        ok: false,
        message: look.message ?? look.error ?? 'Le serveur a refusé la vérification (license-lookup).'
      }
    }
    const L = look.license
    if (String(L.status).toLowerCase() === 'revoked') {
      clearLicenseOnlineOkCache()
      return { ok: false, message: 'Licence révoquée sur le serveur.' }
    }
    if (licenseExpiredByDate(L.expires_at)) {
      clearLicenseOnlineOkCache()
      return { ok: false, message: 'Licence expirée.' }
    }
    const sync = syncLocalAssociationsFromLicense(L)
    const pruned = pruneLocalAssociationsNotOnServer(L)
    const machine = getOrCreateMachineId()
    const batch = await webLicenseActivateAssociationsIfNeeded(cred, machine, L)
    if (!batch.ok) {
      return { ok: false, message: batch.message ?? 'Activation sur le serveur refusée.' }
    }
    const look2 = await webLicenseLookup(cred)
    if (!look2.ok) {
      return {
        ok: false,
        message: look2.message ?? look2.error ?? 'Seconde vérification (license-lookup) impossible.'
      }
    }
    const L2 = look2.license
    if (licenseExpiredByDate(L2.expires_at)) {
      clearLicenseOnlineOkCache()
      return { ok: false, message: 'Licence expirée.' }
    }
    const st2 = String(L2.status).toLowerCase()
    if (st2 !== 'active') {
      clearLicenseOnlineOkCache()
      return {
        ok: false,
        message:
          st2 === 'inactive'
            ? 'La licence reste « inactive » après tentative d’activation. Vérifiez la liste des associations côté serveur ou contactez l’éditeur.'
            : `Statut serveur : « ${L2.status} » — la licence n’est pas utilisable.`
      }
    }
    saveLicenseOnlineOkFromLicense(cred, L2)
    const exp = L2.expires_at
      ? new Date(String(L2.expires_at).slice(0, 10)).toLocaleDateString('fr-FR')
      : 'sans date'
    const parts = [
      `Statut serveur : ${L2.status}.`,
      `Expiration : ${exp}.`,
      `Postes : ${L2.activation_count}/${L2.max_activations}.`,
      `Associations (plafond) : ${L2.max_associations}.`
    ]
    if (sync.created > 0) parts.push(`Associations locales créées : ${sync.created}.`)
    if (sync.renamed > 0) parts.push(`Noms mis à jour depuis le serveur : ${sync.renamed}.`)
    if (pruned > 0) {
      parts.push(
        `Profils déliés (code absent de la liste serveur, données conservées) : ${pruned}. Ouvrez « Associations » pour vérifier.`
      )
    }
    return { ok: true, message: parts.join(' ') }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Erreur : ${msg}` }
  }
}

/**
 * Au lancement : uniquement si le réseau atteint le serveur de licences, et qu’une clé est enregistrée.
 * Résultat non affiché (silencieux).
 */
export async function runStartupLicenseDataRefreshIfOnline(): Promise<void> {
  if (!(await isNetworkReachableForWebLicenses())) {
    return
  }
  if (!resolveWebLicenseCredentials(loadLicense())) {
    return
  }
  await runLicenseDataRefresh()
}
