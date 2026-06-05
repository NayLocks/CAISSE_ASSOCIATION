/**
 * Client des API JSON WEB_LICENCES (license-lookup.php, license-activate.php, license-association-create.php).
 * POST JSON, CORS côté serveur : appels depuis le processus principal Electron.
 */

import { normalizeLicenseAssociationCode, orderedAssociationCodes } from '../shared/associationCode.js'

export type WebLicenseAssociationRow = {
  id?: number | string
  name: string
  code: string
  sort_order?: number
  activation_count?: number
}

export type WebLicenseLookupOk = {
  ok: true
  license: {
    license_key: string
    status: string
    expires_at: string | null
    max_activations: number
    activation_count: number
    association_mode: string
    max_associations: number
    notes: string | null
    associations?: WebLicenseAssociationRow[]
    association_slots_used?: number
    association_slots_total?: number
  }
}

export type WebLicenseLookupFail = {
  ok: false
  error?: string
  message?: string
}

export type WebLicenseLookupResult = WebLicenseLookupOk | WebLicenseLookupFail

export type WebLicenseActivateOk = {
  ok: true
  message?: string
  activation_count: number
  max_activations: number
  license_status: string
}

export type WebLicenseActivateFail = {
  ok: false
  error?: string
  message?: string
}

export function isWebLicenseLookupNetworkFailure(r: WebLicenseLookupFail): boolean {
  return r.error === 'network' || r.error === 'timeout'
}

export function isWebLicenseActivateNetworkFailure(r: WebLicenseActivateFail): boolean {
  return r.error === 'network' || r.error === 'timeout'
}

export type WebLicenseActivateResult = WebLicenseActivateOk | WebLicenseActivateFail

/**
 * Réponse « erreur » qui n’est en fait pas un blocage : ce poste (machine_label) est déjà enregistré
 * pour l’activation / cette association. La réactivation avec la même licence est alors possible,
 * y compris lorsque le quota de postes (max_activations) serait atteint pour d’autres machines.
 * Variantes de noms d’erreur côté WEB_LICENCES selon les versions d’API.
 */
export function isWebLicenseMachineAlreadyActiveFailure(act: WebLicenseActivateResult): boolean {
  if (act.ok) return false
  const e = String((act as WebLicenseActivateFail).error ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (!e) return false
  return new Set([
    'machine_already_registered',
    'machine_already_activated',
    'already_activated',
    'already_registered',
    'device_already_registered',
    'duplicate_machine',
    'duplicate_activation',
    'activation_exists',
    'poste_deja_enregistre',
    'deja_activ',
    'deja_enregistre',
    'reactivation',
    'same_machine',
    'not_new_activation',
    'activation_already_exists'
  ]).has(e)
}

export type WebLicenseCredentials = {
  apiBaseUrl: string
  projectCode: string
  apiSecret: string
  licenseKey: string
}

const DEFAULT_TIMEOUT_MS = 18_000

function trimBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export function licenseLookupEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/license-lookup.php`
}

export function licenseActivateEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/license-activate.php`
}

export function licenseAssociationCreateEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/license-association-create.php`
}

export function associationCodeRequestStatusEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/association-code-request-status.php`
}

export function associationCodeLookupEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/association-code-lookup.php`
}

export function machineLicenseInventoryEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/machine-license-inventory.php`
}

/** Ligne normalisée issue de machine-license-inventory.php. */
export type MachineInventoryLicenseApiRow = {
  license_key: string
  status: string
  expires_at: string | null
}

export type WebLicenseMachineInventoryOk = {
  ok: true
  project_code?: string
  available_licenses: MachineInventoryLicenseApiRow[]
  used_on_this_machine: MachineInventoryLicenseApiRow[]
}

export type WebLicenseMachineInventoryResult =
  | WebLicenseMachineInventoryOk
  | { ok: false; error?: string; message?: string }

function parseMachineInventoryRows(raw: unknown): MachineInventoryLicenseApiRow[] {
  if (!Array.isArray(raw)) return []
  const out: MachineInventoryLicenseApiRow[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const lk =
      typeof o.license_key === 'string' ? normalizeWebLicenseKey(o.license_key) : normalizeWebLicenseKey(String(o.licenseKey ?? ''))
    if (!lk) continue
    const exp = o.expires_at
    let expires_at: string | null = null
    if (exp != null && String(exp).trim() !== '') {
      expires_at = String(exp).trim()
    }
    out.push({
      license_key: lk,
      status: typeof o.status === 'string' ? o.status.trim() : '',
      expires_at
    })
  }
  return out
}

/**
 * Inventaire des licences encore activables et/ou déjà utilisées sur ce poste (API admin serveur).
 * POST JSON : machine-license-inventory.php
 */
export async function webLicenseFetchMachineInventory(
  args: {
    apiBaseUrl: string
    projectCode: string
    adminPassword: string
    machineId: string
    includeAvailable?: boolean
    includeUsed?: boolean
  },
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebLicenseMachineInventoryResult> {
  const url = machineLicenseInventoryEndpoint(args.apiBaseUrl.trim())
  const machine_id = args.machineId.trim()
  try {
    const data = await postJson<Record<string, unknown>>(url,
      {
        project_code: args.projectCode.trim(),
        admin_password: args.adminPassword.trim(),
        machine_id,
        include_available: args.includeAvailable !== false,
        include_used_on_machine: args.includeUsed !== false
      },
      timeoutMs
    )
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'bad_response', message: 'Réponse inventaire invalide.' }
    }
    const ok = data.ok === true
    if (!ok) {
      const msg = typeof data.message === 'string' ? data.message : 'Requête refusée par le serveur.'
      const err = typeof data.error === 'string' ? data.error : 'error'
      return { ok: false, error: err, message: msg }
    }
    return {
      ok: true,
      project_code: typeof data.project_code === 'string' ? data.project_code : undefined,
      available_licenses: parseMachineInventoryRows(data.available_licenses),
      used_on_this_machine: parseMachineInventoryRows(data.used_on_this_machine)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé.' }
    }
    return { ok: false, error: 'network', message: msg }
  }
}

export type WebLicenseAssociationCodeLookupOk = {
  ok: true
  /** Fiche `association_records` existante pour ce logiciel. */
  exists: boolean
  association?: { id?: number; name?: string; code?: string } | null
  association_code?: string
}

export type WebLicenseAssociationCodeLookupResult =
  | WebLicenseAssociationCodeLookupOk
  | { ok: false; error?: string; message?: string }

/**
 * Fiche association au catalogue logiciel (indépendamment des liaisons sur une clé).
 * API : association-code-lookup.php
 */
export async function webLicenseAssociationCodeLookup(
  cred: WebLicenseCredentials,
  associationCodeNorm: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebLicenseAssociationCodeLookupResult> {
  const url = associationCodeLookupEndpoint(cred.apiBaseUrl)
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  const code = associationCodeNorm.trim().slice(0, 32)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_code: cred.projectCode.trim(),
        api_secret: cred.apiSecret.trim(),
        association_code: code
      }),
      signal: ac.signal
    })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      return { ok: false, error: 'bad_response', message: `Réponse non JSON (HTTP ${res.status}).` }
    }
    return data as WebLicenseAssociationCodeLookupResult
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé.' }
    }
    return { ok: false, error: 'network', message: msg }
  } finally {
    clearTimeout(t)
  }
}

export function updateCheckEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/update-check.php`
}

export function updateDownloadEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/update-download.php`
}

export function normalizeWebLicenseKey(raw: string): string {
  return raw.toUpperCase().trim().replace(/\s+/g, '')
}

async function postJson<T>(url: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal
    })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Réponse non JSON (${res.status})`)
    }
    return data as T
  } finally {
    clearTimeout(t)
  }
}

/** Indique si un code d’association est déjà présent sur la réponse `license-lookup` (casse / espaces normalisés). */
export function findLicenseAssociationRowByCode(
  license: WebLicenseLookupOk['license'],
  normalizedCode: string
): WebLicenseAssociationRow | null {
  const rows = license.associations
  if (!Array.isArray(rows) || !normalizedCode) return null
  for (const r of rows) {
    const c = normalizeLicenseAssociationCode(String(r?.code ?? ''))
    if (c === normalizedCode) return r
  }
  return null
}

export async function webLicenseLookup(
  cred: WebLicenseCredentials,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebLicenseLookupResult> {
  const url = licenseLookupEndpoint(cred.apiBaseUrl)
  const license_key = normalizeWebLicenseKey(cred.licenseKey)
  try {
    const data = await postJson<WebLicenseLookupResult>(
      url,
      {
        project_code: cred.projectCode.trim(),
        api_secret: cred.apiSecret.trim(),
        license_key
      },
      timeoutMs
    )
    return data
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé lors de la vérification de licence.' }
    }
    return {
      ok: false,
      error: 'network',
      message: `Impossible de joindre le serveur de licences (${msg}).`
    }
  }
}

export async function webLicenseActivate(
  cred: WebLicenseCredentials,
  machineLabel: string,
  associationCode: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebLicenseActivateResult> {
  const url = licenseActivateEndpoint(cred.apiBaseUrl)
  const license_key = normalizeWebLicenseKey(cred.licenseKey)
  const machine = machineLabel.trim().slice(0, 120)
  try {
    const data = await postJson<WebLicenseActivateResult>(
      url,
      {
        project_code: cred.projectCode.trim(),
        api_secret: cred.apiSecret.trim(),
        license_key,
        machine_label: machine,
        /** Même valeur que l’id poste côté app (WEB_LICENCES compare machine_id / machine_label). */
        machine_id: machine,
        association_code: associationCode.trim().slice(0, 32)
      },
      timeoutMs
    )
    return data
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé lors de l’activation.' }
    }
    return {
      ok: false,
      error: 'network',
      message: `Impossible de joindre le serveur de licences (${msg}).`
    }
  }
}

export type WebLicenseActivateAssociationsResult =
  | { ok: true }
  | { ok: false; error?: string; message: string }

export function isWebLicenseActivateAssociationsNetworkFailure(
  r: WebLicenseActivateAssociationsResult
): boolean {
  return r.ok === false && (r.error === 'network' || r.error === 'timeout')
}

/**
 * Active ce poste pour chaque code d’association renvoyé par license-lookup (ordre sort_order).
 * Traite comme succès le cas « poste déjà enregistré » (voir isWebLicenseMachineAlreadyActiveFailure)
 * et ignore les erreurs « association inconnue » pour un code donné.
 */
export async function webLicenseActivateForEachAssociation(
  cred: WebLicenseCredentials,
  machineLabel: string,
  license: WebLicenseLookupOk['license'],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebLicenseActivateAssociationsResult> {
  const codes = orderedAssociationCodes(license.associations)
  if (codes.length === 0) {
    return {
      ok: false,
      error: 'no_associations',
      message:
        'Le serveur de licences n’a renvoyé aucune ligne d’association pour cette clé. Mettez à jour WEB_LICENCES ou contactez l’éditeur.'
    }
  }
  for (const associationCode of codes) {
    const act = await webLicenseActivate(cred, machineLabel, associationCode, timeoutMs)
    if (act.ok) continue
    if (isWebLicenseMachineAlreadyActiveFailure(act)) continue
    if (isWebLicenseActivateNetworkFailure(act)) {
      return { ok: false, error: act.error, message: act.message ?? 'Erreur réseau lors de l’activation.' }
    }
    const err = String(act.error ?? '').toLowerCase()
    if (
      err === 'unknown_association' ||
      err === 'invalid_association' ||
      err === 'association_unknown' ||
      err === 'bad_association'
    ) {
      continue
    }
    return {
      ok: false,
      error: act.error,
      message: formatWebLicenseActivateRejection(act)
    }
  }
  return { ok: true }
}

/** Message lisible pour l’écran (le serveur envoie souvent `ok: false` avec seulement `error` ou `message` vide). */
function formatWebLicenseActivateRejection(act: WebLicenseActivateFail): string {
  if (act.message && String(act.message).trim()) return String(act.message).trim()
  if (act.error && String(act.error).trim()) {
    return `Activation refusée par le serveur (code : ${String(act.error).trim()}). Vérifiez la clé, le code d’association et le nombre de postes autorisés, ou testez l’API depuis l’écran licence.`
  }
  return 'Activation refusée (license-activate) : le serveur n’a pas indiqué de détail. Vérifiez les journaux côté WEB_LICENCES ou l’onglet réseau de l’app.'
}

/**
 * Si la licence est « inactive », l’activation par association est obligatoire (codes serveur).
 * Si la licence est déjà active et qu’aucune association n’est listée (ancien serveur), on n’appelle pas license-activate.
 */
export async function webLicenseActivateAssociationsIfNeeded(
  cred: WebLicenseCredentials,
  machineLabel: string,
  license: WebLicenseLookupOk['license'],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebLicenseActivateAssociationsResult> {
  const st = String(license.status).toLowerCase()
  const codes = orderedAssociationCodes(license.associations)
  if (codes.length === 0) {
    if (st === 'inactive') {
      return {
        ok: false,
        error: 'no_associations',
        message:
          'Licence « inactive » : le serveur doit renvoyer la liste des associations pour activer cette clé. Mettez à jour WEB_LICENCES.'
      }
    }
    return { ok: true }
  }
  return webLicenseActivateForEachAssociation(cred, machineLabel, license, timeoutMs)
}

export type WebLicenseAssociationCreateOk = {
  ok: true
  association?: { id?: number | string; name: string; code: string; sort_order?: number }
  result?: string
  message?: string
  /** Renvoyé quand `notify_admin` a enregistré une demande (WEB_LICENCES). */
  request_id?: number
}

export type WebLicenseAssociationCreateFail = {
  ok: false
  error?: string
  message?: string
}

export type WebLicenseAssociationCreateResult =
  | WebLicenseAssociationCreateOk
  | WebLicenseAssociationCreateFail

export async function webLicenseAssociationCreate(
  cred: WebLicenseCredentials,
  body: { name: string; code: string; notifyAdmin?: boolean },
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<WebLicenseAssociationCreateResult> {
  const url = licenseAssociationCreateEndpoint(cred.apiBaseUrl)
  const license_key = normalizeWebLicenseKey(cred.licenseKey)
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const payload: Record<string, unknown> = {
      project_code: cred.projectCode.trim(),
      api_secret: cred.apiSecret.trim(),
      license_key,
      name: body.name.trim().slice(0, 200),
      code: body.code.trim().slice(0, 32)
    }
    if (body.notifyAdmin) {
      /** Côté WEB_LICENCES : enregistrement / e-mail d’une demande à l’administrateur sans créer de doublon. */
      payload['notify_admin'] = true
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal
    })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      const hint =
        res.status === 404
          ? 'Le serveur répond 404 : le script license-association-create.php est introuvable à l’URL d’API. Déployez ce fichier sur WEB_LICENCES (dossier api/v1) ou mettez à jour le serveur, puis utilisez « Mettre à jour les données de la licence ».'
          : `Le serveur a renvoyé une réponse non JSON (HTTP ${res.status}). Vérifiez l’URL d’API et la configuration du serveur.`
      return { ok: false, error: 'bad_response', message: hint }
    }
    return data as WebLicenseAssociationCreateResult
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé lors de la création d’association.' }
    }
    return {
      ok: false,
      error: 'network',
      message: `Impossible de joindre le serveur de licences (${msg}).`
    }
  } finally {
    clearTimeout(t)
  }
}

export type AssociationCodeRequestStatusRow = {
  id: number
  status: string
  association_code: string
  proposed_name: string
  admin_note: string | null
  client_message: string | null
  client_note: string | null
  resolved_code: string | null
  resolved_name: string | null
  created_at: string
  reviewed_at: string | null
}

export type AssociationCodeRequestStatusResult =
  | { ok: true; results: AssociationCodeRequestStatusRow[] }
  | { ok: false; error?: string; message?: string }

/**
 * Vérifie l’état d’enregistrement d’une ou plusieurs demandes (réponse admin).
 * API WEB_LICENCES : association-code-request-status.php
 */
export async function webLicenseAssociationRequestStatus(
  cred: WebLicenseCredentials,
  requestIds: number[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<AssociationCodeRequestStatusResult> {
  if (!requestIds.length) {
    return { ok: true, results: [] }
  }
  const url = associationCodeRequestStatusEndpoint(cred.apiBaseUrl)
  const license_key = normalizeWebLicenseKey(cred.licenseKey)
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_code: cred.projectCode.trim(),
        api_secret: cred.apiSecret.trim(),
        license_key,
        request_ids: requestIds
      }),
      signal: ac.signal
    })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      return { ok: false, error: 'bad_response', message: `Réponse non JSON (HTTP ${res.status}).` }
    }
    const o = data as { ok?: boolean; results?: AssociationCodeRequestStatusRow[]; message?: string; error?: string }
    if (!o.ok) {
      return { ok: false, error: typeof o.error === 'string' ? o.error : 'error', message: o.message }
    }
    const raw = Array.isArray(o.results) ? o.results : []
    const results: AssociationCodeRequestStatusRow[] = raw.map((row) => {
      const r = row as AssociationCodeRequestStatusRow
      return {
        ...r,
        id: typeof r.id === 'number' && Number.isFinite(r.id) ? r.id : Number(r.id) || 0
      }
    })
    return { ok: true, results }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé.' }
    }
    return { ok: false, error: 'network', message: msg }
  } finally {
    clearTimeout(t)
  }
}

export function licenseExpiredByDate(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  const d = String(expiresAt).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const today = new Date().toISOString().slice(0, 10)
  return d < today
}
