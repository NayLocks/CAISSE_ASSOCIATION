import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'

import type { WebLicenseCredentials } from './webLicenseClient.js'
import { normalizeWebLicenseKey, type WebLicenseLookupOk } from './webLicenseClient.js'
import {
  APP_WEB_LICENCES_PROJECT_CODE,
  WEB_LICENSE_API_PUBLIC_BASE
} from '../shared/webLicenseEndpoint.js'
import { normalizeProjectCode } from '../shared/projectCode.js'

const LICENSE_FILENAME = 'license.json'

/** Données enregistrées (l’URL d’API est fixe ; pas de secret API côté app). */
export interface WebLicensePersisted {
  projectCode: string
  licenseKey: string
}

/** Dernière vérification en ligne réussie (grâce hors connexion 48 h). */
export interface LicenseOnlineOkCache {
  lastOkAtMs: number
  projectCode: string
  licenseKeyNorm: string
  maxAssociations: number
  maxActivations: number
  activationCount: number
  associationMode: string
  expiresAt: string | null
}

export interface LicenseFileV2 {
  machineId: string | null
  web: WebLicensePersisted | null
  licenseOnlineOk?: LicenseOnlineOkCache | null
}

function licensePath(): string {
  return join(app.getPath('userData'), LICENSE_FILENAME)
}

function emptyFile(): LicenseFileV2 {
  return { machineId: null, web: null }
}

function parseLicenseOnlineOk(raw: unknown): LicenseOnlineOkCache | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const lastOkAtMs = typeof o.lastOkAtMs === 'number' ? o.lastOkAtMs : NaN
  const projectCode = typeof o.projectCode === 'string' ? o.projectCode.trim() : ''
  const licenseKeyNorm = typeof o.licenseKeyNorm === 'string' ? o.licenseKeyNorm.trim() : ''
  const maxAssociations = typeof o.maxAssociations === 'number' ? o.maxAssociations : NaN
  const maxActivations = typeof o.maxActivations === 'number' ? o.maxActivations : NaN
  const activationCount = typeof o.activationCount === 'number' ? o.activationCount : NaN
  const associationMode = typeof o.associationMode === 'string' ? o.associationMode : ''
  const expiresAt = o.expiresAt === null ? null : typeof o.expiresAt === 'string' ? o.expiresAt : null
  if (
    !Number.isFinite(lastOkAtMs) ||
    !projectCode ||
    !licenseKeyNorm ||
    !Number.isFinite(maxAssociations) ||
    !Number.isFinite(maxActivations) ||
    !Number.isFinite(activationCount) ||
    !associationMode
  ) {
    return null
  }
  return {
    lastOkAtMs,
    projectCode,
    licenseKeyNorm,
    maxAssociations,
    maxActivations,
    activationCount,
    associationMode,
    expiresAt
  }
}

function parseWebFromJson(w: Record<string, unknown>): WebLicensePersisted | null {
  const projectCode = typeof w.projectCode === 'string' ? w.projectCode.trim() : ''
  const licenseKey = typeof w.licenseKey === 'string' ? w.licenseKey.trim() : ''
  if (projectCode && licenseKey) {
    return { projectCode, licenseKey }
  }
  return null
}

export function loadLicense(): LicenseFileV2 {
  const p = licensePath()
  if (!existsSync(p)) return emptyFile()
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as Partial<LicenseFileV2> & { key?: unknown }
    const machineId = typeof j.machineId === 'string' && j.machineId.trim() ? j.machineId.trim() : null
    let web: WebLicensePersisted | null = null
    if (j.web && typeof j.web === 'object') {
      web = parseWebFromJson(j.web as Record<string, unknown>)
    }
    const licenseOnlineOk = parseLicenseOnlineOk(j.licenseOnlineOk)
    let outWeb = web
    if (outWeb && normalizeProjectCode(outWeb.projectCode) !== APP_WEB_LICENCES_PROJECT_CODE) {
      outWeb = { licenseKey: outWeb.licenseKey, projectCode: APP_WEB_LICENCES_PROJECT_CODE }
      writeLicense({ machineId, web: outWeb, licenseOnlineOk: undefined })
      return { machineId, web: outWeb, licenseOnlineOk: undefined }
    }
    return { machineId, web: outWeb, licenseOnlineOk: licenseOnlineOk ?? undefined }
  } catch {
    return emptyFile()
  }
}

function writeLicense(data: LicenseFileV2): void {
  writeFileSync(licensePath(), JSON.stringify(data, null, 2), 'utf8')
}

function sameWebCredentials(a: WebLicensePersisted, b: WebLicensePersisted): boolean {
  return (
    a.projectCode.trim().toUpperCase() === b.projectCode.trim().toUpperCase() &&
    normalizeWebLicenseKey(a.licenseKey) === normalizeWebLicenseKey(b.licenseKey)
  )
}

export function saveWebLicenseConfig(web: WebLicensePersisted | null): void {
  const cur = loadLicense()
  if (!web) {
    writeLicense({ ...cur, web: null, licenseOnlineOk: undefined })
    return
  }
  const prev = cur.web
  const keepGrace = prev !== null && sameWebCredentials(prev, web)
  writeLicense({
    ...cur,
    web,
    ...(keepGrace ? {} : { licenseOnlineOk: undefined })
  })
}

export function getLicenseOnlineOkCache(): LicenseOnlineOkCache | null {
  return parseLicenseOnlineOk(loadLicense().licenseOnlineOk) ?? null
}

export function clearLicenseOnlineOkCache(): void {
  const cur = loadLicense()
  if (!cur.licenseOnlineOk) return
  writeLicense({ ...cur, licenseOnlineOk: undefined })
}

export function credentialsMatchOnlineCache(
  cred: WebLicenseCredentials,
  cache: LicenseOnlineOkCache
): boolean {
  return (
    cred.projectCode.trim().toUpperCase() === cache.projectCode.trim().toUpperCase() &&
    normalizeWebLicenseKey(cred.licenseKey) === cache.licenseKeyNorm
  )
}

export function saveLicenseOnlineOkFromLicense(
  cred: WebLicenseCredentials,
  L: WebLicenseLookupOk['license']
): void {
  const cur = loadLicense()
  const licenseOnlineOk: LicenseOnlineOkCache = {
    lastOkAtMs: Date.now(),
    projectCode: cred.projectCode.trim(),
    licenseKeyNorm: normalizeWebLicenseKey(cred.licenseKey),
    maxAssociations: L.max_associations,
    maxActivations: L.max_activations,
    activationCount: L.activation_count,
    associationMode: L.association_mode,
    expiresAt: L.expires_at
  }
  writeLicense({ ...cur, licenseOnlineOk })
}

export function getOrCreateMachineId(): string {
  const cur = loadLicense()
  if (cur.machineId && cur.machineId.trim()) return cur.machineId.trim()
  const id = `CAISSE-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
  writeLicense({ ...cur, machineId: id })
  return id
}

export function maskLicenseKey(key: string | null): string {
  if (!key) return '—'
  if (key.length <= 4) return '••••'
  return `${'•'.repeat(Math.min(16, key.length - 4))}${key.slice(-4)}`
}

export function resolveWebLicenseCredentials(lic: LicenseFileV2): WebLicenseCredentials | null {
  const w = lic.web
  if (!w || !w.projectCode.trim() || !w.licenseKey.trim()) return null
  return {
    apiBaseUrl: WEB_LICENSE_API_PUBLIC_BASE,
    projectCode: w.projectCode.trim(),
    apiSecret: '',
    licenseKey: w.licenseKey.trim()
  }
}
