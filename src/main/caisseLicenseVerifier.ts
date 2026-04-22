import { createRequire } from 'node:module'

import { getActiveAssociationId } from './associationRegistry.js'

import { loadPersistedData } from './stateStore.js'

import { loadLicense, maskLicenseKey } from './licenseStore.js'

import { clockAnchorStorePath, loadMasterSecret32, loadPublicKeyPem } from './caisseLicenseKeys.js'



const require = createRequire(import.meta.url)

// Package local CAISSE_LICENCE (main npm = appli Electron ; on charge src/license.js)

const lic = require('caisse-licence/src/license.js') as {

  verifyLicenseToken: (

    token: string,

    pem: string,

    options?: { nowMs?: number }

  ) => { ok: true; payload: LicensePayload } | { ok: false; reason: string }

  caissePeutUtiliserLicence: (

    token: string,

    pem: string,

    associationId: string,

    options?: { nowMs?: number }

  ) => { ok: true; payload: LicensePayload } | { ok: false; reason: string }

}

const shortLic = require('caisse-licence/src/short-license.js') as {

  verifyShortLicense: (

    formattedKey: string,

    master32: Buffer,

    options?: { nowMs?: number }

  ) => { ok: true; payload: ShortPayload } | { ok: false; reason: string }

  caissePeutUtiliserCleCourte: (

    formattedKey: string,

    master32: Buffer,

    associationId: string,

    options?: { nowMs?: number }

  ) => { ok: true; payload: ShortPayload } | { ok: false; reason: string }

}

const clockTrust = require('caisse-licence/src/clock-trust.js') as {

  resolveTrustedNowMs: (opts: ClockTrustOpts) => Promise<TrustedNowResult>

  bumpWatermark: (

    anchor: ClockAnchor,

    localMs: number,

    remoteMs: number | null

  ) => ClockAnchor

  saveClockAnchorSync: (storePath: string, anchor: ClockAnchor) => void

}



type ClockAnchor = { v?: number; watermarkMs: number }



type ClockTrustOpts = {

  storePath: string

  networkUrl?: string | null

  fetchTimeoutMs?: number

  maxClockBackMs?: number

}



type TrustedNowResult =

  | {

      ok: true

      nowMs: number

      anchor: ClockAnchor

      remoteMs: number | null

      localMs: number

    }

  | { ok: false; reason: string }



type LicensePayload = {

  type: string

  associations: string[]

  expiresAt?: string | null

}



type ShortPayload = {

  type: string

  associations: string[]

  expiresAt: string | null

}



export type LicenseDisplayStatus = 'inactive' | 'valid' | 'invalid' | 'unconfigured'



export type LicenseGetResult = {

  hasKey: boolean

  maskedKey: string

  status: 'active' | 'inactive'

  displayStatus: LicenseDisplayStatus

  mode: 'none' | 'long' | 'short'

  reason?: string

  detail?: string

  payloadSummary?: {

    type: string

    expiresAt: string | null

    associationsLabel: string

  }

  keysHint?: string

}



function clockTrustOpts(): ClockTrustOpts {

  return { storePath: clockAnchorStorePath() }

}



function infrastructureConfigured(): boolean {

  return Boolean(loadPublicKeyPem() || loadMasterSecret32())

}



function classifyKey(raw: string): 'long' | 'short' {

  const oneLine = raw.trim().replace(/\s+/g, '')

  if (oneLine.includes('.') && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(oneLine)) {

    return 'long'

  }

  return 'short'

}



function getStoredKeyTrimmed(): string | null {

  const k = loadLicense().key

  return k && k.trim() ? k.trim() : null

}



function persistWatermarkOnLicenseOk(tr: Extract<TrustedNowResult, { ok: true }>): void {

  const next = clockTrust.bumpWatermark(tr.anchor, tr.localMs, tr.remoteMs)

  clockTrust.saveClockAnchorSync(clockTrustOpts().storePath, next)

}



export async function getLicenseStatusForIpc(): Promise<LicenseGetResult> {

  const key = getStoredKeyTrimmed()

  const maskedKey = maskLicenseKey(key)

  const pem = loadPublicKeyPem()

  const master = loadMasterSecret32()



  const keysHint = !pem && !master

    ? `Pour activer la vérification CAISSE_LICENCE : copiez public.pem et/ou master.secret (64 caractères hex) dans le sous-dossier « caisse-license » du dossier données de l’application.`

    : undefined



  if (!key) {

    return {

      hasKey: false,

      maskedKey: '—',

      status: 'inactive',

      displayStatus: 'inactive',

      mode: 'none',

      keysHint,

      reason: 'Aucune clé enregistrée sur ce poste.'

    }

  }



  const mode = classifyKey(key)

  if (mode === 'long') {

    if (!pem) {

      return {

        hasKey: true,

        maskedKey,

        status: 'inactive',

        displayStatus: 'unconfigured',

        mode: 'long',

        reason: 'Fichier public.pem introuvable (requis pour les jetons longs).',

        keysHint

      }

    }

    const tr = await clockTrust.resolveTrustedNowMs(clockTrustOpts())

    if (!tr.ok) {

      return {

        hasKey: true,

        maskedKey,

        status: 'inactive',

        displayStatus: 'invalid',

        mode: 'long',

        reason: tr.reason,

        keysHint

      }

    }

    const v = lic.verifyLicenseToken(key, pem, { nowMs: tr.nowMs })

    if (!v.ok) {

      return {

        hasKey: true,

        maskedKey,

        status: 'inactive',

        displayStatus: 'invalid',

        mode: 'long',

        reason: v.reason,

        keysHint

      }

    }

    persistWatermarkOnLicenseOk(tr)

    const p = v.payload

    return {

      hasKey: true,

      maskedKey,

      status: 'active',

      displayStatus: 'valid',

      mode: 'long',

      detail: 'Jeton cryptographiquement valide (signature, échéance et horloge).',

      payloadSummary: {

        type: p.type,

        expiresAt: p.expiresAt ?? null,

        associationsLabel: p.associations.join(', ')

      },

      keysHint

    }

  }



  if (!master) {

    return {

      hasKey: true,

      maskedKey,

      status: 'inactive',

      displayStatus: 'unconfigured',

      mode: 'short',

      reason: 'Fichier master.secret introuvable (requis pour les clés courtes XXXX-XXXX).',

      keysHint

    }

  }

  const tr = await clockTrust.resolveTrustedNowMs(clockTrustOpts())

  if (!tr.ok) {

    return {

      hasKey: true,

      maskedKey,

      status: 'inactive',

      displayStatus: 'invalid',

      mode: 'short',

      reason: tr.reason,

      keysHint

    }

  }

  const v = shortLic.verifyShortLicense(key, master, { nowMs: tr.nowMs })

  if (!v.ok) {

    return {

      hasKey: true,

      maskedKey,

      status: 'inactive',

      displayStatus: 'invalid',

      mode: 'short',

      reason: v.reason,

      keysHint

    }

  }

  persistWatermarkOnLicenseOk(tr)

  const p = v.payload

  return {

    hasKey: true,

    maskedKey,

    status: 'active',

    displayStatus: 'valid',

    mode: 'short',

    detail: 'Clé courte valide (signature, échéance et horloge).',

    payloadSummary: {

      type: p.type,

      expiresAt: p.expiresAt,

      associationsLabel: p.associations.join(', ')

    },

    keysHint

  }

}



/**

 * À appeler lorsque l’association est ouverte : la clé doit couvrir l’UUID (jeton long)

 * ou le code association (clé courte).

 */

function normalizeShortCode(raw: string | null | undefined): string | null {

  if (!raw) return null

  const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)

  return t.length >= 2 ? t : null

}



export type AssociationLicenseGate = { allowed: true } | { allowed: false; reason: string }



/**

 * Indique si l’utilisateur peut ouvrir cette association avec la clé actuellement enregistrée.

 * Jeton long : vérifie l’UUID. Clé courte : vérifie le code association (registre ou ficher caisse-data).

 */

export async function getAssociationAccessGate(

  associationId: string,

  licenseAssociationCode: string | null | undefined

): Promise<AssociationLicenseGate> {

  if (!infrastructureConfigured()) {

    return { allowed: true }

  }



  const key = getStoredKeyTrimmed()

  if (!key) {

    return {

      allowed: false,

      reason:

        'Aucune clé de licence enregistrée. Utilisez « Licence & activation » pour saisir la clé fournie.'

    }

  }



  const mode = classifyKey(key)

  const pem = loadPublicKeyPem()

  const master = loadMasterSecret32()



  if (mode === 'long') {

    if (!pem) {

      return { allowed: false, reason: 'Fichier public.pem introuvable (requis pour les jetons longs).' }

    }

    const tr = await clockTrust.resolveTrustedNowMs(clockTrustOpts())

    if (!tr.ok) {

      return { allowed: false, reason: tr.reason }

    }

    const v = lic.caissePeutUtiliserLicence(key, pem, associationId, { nowMs: tr.nowMs })

    if (v.ok) {

      persistWatermarkOnLicenseOk(tr)

    }

    if (!v.ok) return { allowed: false, reason: v.reason }

    return { allowed: true }

  }



  if (!master) {

    return { allowed: false, reason: 'Fichier master.secret introuvable (requis pour les clés courtes).' }

  }

  const tr = await clockTrust.resolveTrustedNowMs(clockTrustOpts())

  if (!tr.ok) {

    return { allowed: false, reason: tr.reason }

  }

  const sv = shortLic.verifyShortLicense(key, master, { nowMs: tr.nowMs })

  if (!sv.ok) {

    return { allowed: false, reason: sv.reason }

  }

  const code = normalizeShortCode(licenseAssociationCode)

  if (!code) {

    return {

      allowed: false,

      reason:

        'Pour une clé courte, renseignez le code association (menu Association) — le même que dans la licence.'

    }

  }

  const r = shortLic.caissePeutUtiliserCleCourte(key, master, code, { nowMs: tr.nowMs })

  if (r.ok) {

    persistWatermarkOnLicenseOk(tr)

  }

  if (!r.ok) return { allowed: false, reason: r.reason }

  return { allowed: true }

}



/**

 * Contrôle à la création d’association : clé courte obligatoire + cohérence licence ; jeton long si la clé est valide.

 */

export async function validateNewAssociationLicense(

  _proposedAssociationId: string,

  licenseAssociationCode: string | null | undefined

): Promise<{ ok: true } | { ok: false; reason: string }> {

  if (!infrastructureConfigured()) {

    return { ok: true }

  }



  const key = getStoredKeyTrimmed()

  if (!key) {

    return {

      ok: false,

      reason:

        'Aucune clé de licence enregistrée. Saisissez d’abord la clé dans « Licence & activation ».'

    }

  }



  const mode = classifyKey(key)

  const pem = loadPublicKeyPem()

  const master = loadMasterSecret32()



  if (mode === 'long') {

    if (!pem) {

      return { ok: false, reason: 'Fichier public.pem introuvable (requis pour les jetons longs).' }

    }

    const tr = await clockTrust.resolveTrustedNowMs(clockTrustOpts())

    if (!tr.ok) return { ok: false, reason: tr.reason }

    const v = lic.verifyLicenseToken(key, pem, { nowMs: tr.nowMs })

    if (!v.ok) return { ok: false, reason: v.reason }

    persistWatermarkOnLicenseOk(tr)

    return { ok: true }

  }



  if (!master) {

    return { ok: false, reason: 'Fichier master.secret introuvable (requis pour les clés courtes).' }

  }

  const tr = await clockTrust.resolveTrustedNowMs(clockTrustOpts())

  if (!tr.ok) return { ok: false, reason: tr.reason }

  const sv = shortLic.verifyShortLicense(key, master, { nowMs: tr.nowMs })

  if (!sv.ok) return { ok: false, reason: sv.reason }



  const code = normalizeShortCode(licenseAssociationCode)

  if (!code) {

    return {

      ok: false,

      reason: 'Saisissez le code association (le même que sur la licence, ex. AB12CD).'

    }

  }

  const r = shortLic.caissePeutUtiliserCleCourte(key, master, code, { nowMs: tr.nowMs })

  if (!r.ok) return { ok: false, reason: r.reason }

  persistWatermarkOnLicenseOk(tr)

  return { ok: true }

}



export async function checkLicenseMatchesActiveAssociation(): Promise<

  { ok: true } | { ok: false; reason: string }

> {

  if (!infrastructureConfigured()) {

    return { ok: true }

  }



  const assocId = getActiveAssociationId()

  if (!assocId) return { ok: true }



  const data = loadPersistedData()

  const gate = await getAssociationAccessGate(assocId, data.association.licenseAssociationCode)

  if (!gate.allowed) return { ok: false, reason: gate.reason }

  return { ok: true }

}


