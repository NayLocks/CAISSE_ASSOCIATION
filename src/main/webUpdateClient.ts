/**
 * Client des API mises à jour WEB_LICENCES (update-check.php, update-download.php).
 */

import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { updateCheckEndpoint, updateDownloadEndpoint } from './webLicenseClient.js'

const CHECK_TIMEOUT_MS = 18_000
const DOWNLOAD_TIMEOUT_MS = 720_000

export type WebUpdateLatest = {
  release_id: number
  version: string
  filename: string
  file_size: number
  created_at: string
}

export type WebUpdateCheckOk = {
  ok: true
  update_available: boolean | null
  version_compare: number | null
  version_compare_failed: boolean
  latest: WebUpdateLatest | null
  download_endpoint: string
}

export type WebUpdateCheckFail = {
  ok: false
  error?: string
  message?: string
}

export type WebUpdateCheckResult = WebUpdateCheckOk | WebUpdateCheckFail

export async function webUpdateCheck(
  apiBaseUrl: string,
  projectCode: string,
  currentVersion: string,
  timeoutMs = CHECK_TIMEOUT_MS
): Promise<WebUpdateCheckResult> {
  const url = updateCheckEndpoint(apiBaseUrl)
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_code: projectCode.trim(),
        current_version: currentVersion.trim()
      }),
      signal: ac.signal
    })
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      return { ok: false, error: 'invalid_response', message: `Réponse non JSON (${res.status}).` }
    }
    const o = data as Record<string, unknown>
    if (o.ok !== true) {
      return {
        ok: false,
        error: typeof o.error === 'string' ? o.error : undefined,
        message: typeof o.message === 'string' ? o.message : 'Le serveur a refusé la vérification de mise à jour.'
      }
    }
    return data as WebUpdateCheckOk
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, error: 'timeout', message: 'Délai dépassé lors de la vérification de mise à jour.' }
    }
    return {
      ok: false,
      error: 'network',
      message: `Impossible de joindre le serveur (${msg}).`
    }
  } finally {
    clearTimeout(t)
  }
}

function parseAttachmentFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const m = /filename\*?=(?:UTF-8''([^;\s]+)|"([^"]+)"|([^;\s]+))/i.exec(contentDisposition)
  const raw = (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim()
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function webUpdateDownloadToPath(options: {
  apiBaseUrl: string
  projectCode: string
  releaseId: number
  destPath: string
  timeoutMs?: number
}): Promise<{ ok: true; suggestedName: string } | { ok: false; message: string }> {
  const { apiBaseUrl, projectCode, releaseId, destPath } = options
  const timeoutMs = options.timeoutMs ?? DOWNLOAD_TIMEOUT_MS
  const url = updateDownloadEndpoint(apiBaseUrl)
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_code: projectCode.trim(),
        release_id: releaseId
      }),
      signal: ac.signal
    })
    const suggestedName = parseAttachmentFilename(res.headers.get('content-disposition')) ?? 'mise-a-jour'
    if (!res.ok) {
      const text = await res.text()
      try {
        const j = JSON.parse(text) as { message?: string }
        if (j && typeof j.message === 'string') return { ok: false, message: j.message }
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        message: `Téléchargement refusé (${res.status}).`
      }
    }
    if (!res.body) {
      return { ok: false, message: 'Réponse vide du serveur.' }
    }
    const webBody = res.body as import('stream/web').ReadableStream
    await pipeline(Readable.fromWeb(webBody), createWriteStream(destPath))
    return { ok: true, suggestedName }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('abort') || msg.includes('Aborted')) {
      return { ok: false, message: 'Délai dépassé lors du téléchargement.' }
    }
    return { ok: false, message: `Échec du téléchargement : ${msg}` }
  } finally {
    clearTimeout(t)
  }
}
