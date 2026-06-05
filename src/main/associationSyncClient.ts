/**
 * Client HTTP des API WEB_LICENCES association-sync-{check,upload,download}.php
 */

import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'

function trimBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

export function associationSyncCheckEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/association-sync-check.php`
}

export function associationSyncUploadEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/association-sync-upload.php`
}

export function associationSyncDownloadEndpoint(baseUrl: string): string {
  return `${trimBaseUrl(baseUrl)}/association-sync-download.php`
}

const CHECK_TIMEOUT_MS = 25_000
const UPLOAD_TIMEOUT_MS = 180_000
const DOWNLOAD_TIMEOUT_MS = 180_000

export type AssociationSyncCheckOk = {
  ok: true
  has_server_snapshot: boolean
  server_revision: number | null
  client_current_revision: number | null
  needs_download: boolean | null
  client_is_aligned_with_server: boolean | null
  file_size: number | null
  sha256_hex: string | null
  updated_at: string | null
  download_endpoint?: string | null
  hint?: string | null
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v)
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : null
}

function boolOrNull(v: unknown): boolean | null {
  if (v === true) return true
  if (v === false) return false
  return null
}

function parseAssociationSyncJsonError(text: string, status: number): { error: string; message: string } {
  try {
    const o = text ? JSON.parse(text) : {}
    const obj = typeof o === 'object' && o ? (o as Record<string, unknown>) : {}
    return {
      error: typeof obj.error === 'string' ? obj.error : 'error',
      message: typeof obj.message === 'string' ? obj.message : `HTTP ${status}`
    }
  } catch {
    return { error: 'bad_response', message: `Réponse non JSON (HTTP ${status}).` }
  }
}

export async function associationSyncFetchCheck(
  apiBaseUrl: string,
  projectCode: string,
  associationCodeRaw: string,
  currentRevision?: number | null,
  timeoutMs = CHECK_TIMEOUT_MS
): Promise<
  AssociationSyncCheckOk | { ok: false; error: string; message: string; httpStatus?: number }
> {
  const association_code = normalizeLicenseAssociationCode(associationCodeRaw)
  if (!association_code) {
    return { ok: false, error: 'invalid_association_code', message: 'Code association invalide.' }
  }
  const body: Record<string, unknown> = {
    project_code: projectCode.trim(),
    association_code
  }
  if (typeof currentRevision === 'number' && Number.isFinite(currentRevision) && currentRevision >= 1) {
    body.current_revision = Math.floor(currentRevision)
  }
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(associationSyncCheckEndpoint(apiBaseUrl), {
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
      return {
        ok: false,
        error: 'bad_response',
        message: `Réponse non JSON (HTTP ${res.status}).`,
        httpStatus: res.status
      }
    }
    const o = data as Record<string, unknown>
    if (!res.ok || o.ok === false) {
      const e = parseAssociationSyncJsonError(text, res.status)
      return {
        ok: false,
        error: e.error,
        message: e.message,
        httpStatus: res.status
      }
    }
    return {
      ok: true,
      has_server_snapshot: o.has_server_snapshot === true,
      server_revision: numOrNull(o.server_revision),
      client_current_revision: numOrNull(o.client_current_revision),
      needs_download: boolOrNull(o.needs_download),
      client_is_aligned_with_server: boolOrNull(o.client_is_aligned_with_server),
      file_size: numOrNull(o.file_size),
      sha256_hex: typeof o.sha256_hex === 'string' ? o.sha256_hex : null,
      updated_at: typeof o.updated_at === 'string' ? o.updated_at : null,
      download_endpoint: typeof o.download_endpoint === 'string' ? o.download_endpoint : null,
      hint: typeof o.hint === 'string' ? o.hint : null
    }
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

export type AssociationSyncUploadOk = {
  ok: true
  revision: number
  file_size: number
  sha256_hex: string
}

export async function associationSyncFetchUpload(
  args: {
    apiBaseUrl: string
    projectCode: string
    associationCodeRaw: string
    revision: number
    payloadUtf8: Buffer
    clientMachineId?: string
  },
  timeoutMs = UPLOAD_TIMEOUT_MS
): Promise<AssociationSyncUploadOk | { ok: false; error: string; message: string; server_revision?: number; httpStatus?: number }> {
  const association_code = normalizeLicenseAssociationCode(args.associationCodeRaw)
  if (!association_code) {
    return { ok: false, error: 'invalid_association_code', message: 'Code association invalide.' }
  }
  if (!Number.isFinite(args.revision) || args.revision < 1) {
    return { ok: false, error: 'invalid_revision', message: 'Révision invalide.' }
  }

  const bodyObj: Record<string, unknown> = {
    project_code: args.projectCode.trim(),
    association_code,
    revision: Math.floor(args.revision),
    payload_base64: args.payloadUtf8.toString('base64')
  }
  const mid =
    typeof args.clientMachineId === 'string' && args.clientMachineId.trim()
      ? args.clientMachineId.trim().slice(0, 128)
      : ''
  if (mid) {
    bodyObj.client_machine_id = mid
  }

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(associationSyncUploadEndpoint(args.apiBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
      signal: ac.signal
    })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      return {
        ok: false,
        error: 'bad_response',
        message: `Réponse non JSON (HTTP ${res.status}).`,
        httpStatus: res.status
      }
    }
    const o = data as Record<string, unknown>
    if (!res.ok || o.ok === false) {
      const sr = typeof o.server_revision === 'number' ? o.server_revision : undefined
      const e = parseAssociationSyncJsonError(text, res.status)
      const out: { ok: false; error: string; message: string; server_revision?: number; httpStatus?: number } =
        {
          ok: false,
          error: e.error,
          message: e.message,
          httpStatus: res.status
        }
      if (sr !== undefined) out.server_revision = sr
      return out
    }
    const revision = typeof o.revision === 'number' ? Math.floor(o.revision) : 0
    const file_size = typeof o.file_size === 'number' ? Math.floor(o.file_size) : args.payloadUtf8.length
    if (revision < 1) {
      return { ok: false, error: 'bad_response', message: 'Réponse upload invalide.', httpStatus: res.status }
    }
    const sha256_hex = typeof o.sha256_hex === 'string' ? o.sha256_hex.trim().toLowerCase() : ''
    if (!/^[a-f0-9]{64}$/.test(sha256_hex)) {
      return { ok: false, error: 'bad_response', message: 'Réponse upload : empreinte sha256 invalide.', httpStatus: res.status }
    }
    return {
      ok: true,
      revision,
      file_size,
      sha256_hex
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé lors de l’envoi.' }
    }
    return { ok: false, error: 'network', message: msg }
  } finally {
    clearTimeout(t)
  }
}

export type AssociationSyncDownloadOk = {
  ok: true
  buffer: Buffer
  revision: number
  sha256_hex: string
}

export async function associationSyncFetchDownload(
  apiBaseUrl: string,
  projectCode: string,
  associationCodeRaw: string,
  timeoutMs = DOWNLOAD_TIMEOUT_MS
): Promise<AssociationSyncDownloadOk | { ok: false; error: string; message: string; httpStatus?: number }> {
  const association_code = normalizeLicenseAssociationCode(associationCodeRaw)
  if (!association_code) {
    return { ok: false, error: 'invalid_association_code', message: 'Code association invalide.' }
  }
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(associationSyncDownloadEndpoint(apiBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_code: projectCode.trim(),
        association_code
      }),
      signal: ac.signal
    })

    const revHeader = res.headers.get('X-LH-Association-Sync-Revision')
    const shaHeader = res.headers.get('X-LH-Association-Sync-Sha256')
    const buf = Buffer.from(await res.arrayBuffer())

    if (!res.ok) {
      const txt = buf.length < 8192 ? buf.toString('utf8') : buf.subarray(0, 8192).toString('utf8')
      const err = txt.trim().startsWith('{') ? parseAssociationSyncJsonError(txt, res.status) : null
      return {
        ok: false,
        error: err?.error ?? (res.status === 404 ? 'no_snapshot' : 'download_failed'),
        message: err?.message ?? `Téléchargement refusé (HTTP ${res.status}).`,
        httpStatus: res.status
      }
    }

    const revision = revHeader != null ? Math.floor(Number(revHeader)) : NaN
    const sha256_hex =
      typeof shaHeader === 'string' && /^[a-f0-9]{64}$/i.test(shaHeader) ? shaHeader.toLowerCase() : ''
    if (!Number.isFinite(revision) || revision < 1) {
      return { ok: false, error: 'bad_response', message: 'Réponse téléchargement : révision manquante.' }
    }
    if (!sha256_hex) {
      return { ok: false, error: 'bad_response', message: 'Réponse téléchargement : empreinte manquante.' }
    }
    return {
      ok: true,
      buffer: buf,
      revision,
      sha256_hex
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé lors du téléchargement.' }
    }
    return { ok: false, error: 'network', message: msg }
  } finally {
    clearTimeout(t)
  }
}
