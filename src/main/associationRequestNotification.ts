import { isNetworkReachableForWebLicenses } from './licenseDataRefresh.js'
import { loadLicense, resolveWebLicenseCredentials } from './licenseStore.js'
import {
  type AssociationCodeRequestStatusRow,
  webLicenseAssociationRequestStatus
} from './webLicenseClient.js'
import { getIdsToPollForRequestStatus } from './associationRequestTracker.js'

export type AssociationRequestModalPayload =
  | { show: false }
  | {
      show: true
      requestId: number
      title: string
      message: string
      status: 'approved' | 'rejected'
    }

function normalizeStatusRow(r: AssociationCodeRequestStatusRow): {
  id: number
  status: string
  code: string
  proposed: string
  admin_note: string | null
  client_message: string | null
} {
  return {
    id: typeof r.id === 'number' && Number.isFinite(r.id) ? r.id : 0,
    status: String(r.status ?? '').toLowerCase(),
    code: String(r.association_code ?? '').trim() || '—',
    proposed: String(r.proposed_name ?? '').trim() || '—',
    admin_note: r.admin_note,
    client_message: r.client_message
  }
}

function strTrim(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).trim()
}

function appendResolvedByAdmin(
  message: string,
  r: AssociationCodeRequestStatusRow
): string {
  const rc = strTrim(r.resolved_code)
  const rn = strTrim(r.resolved_name)
  let out = message
  if (rc !== '') {
    out += `\n\nCode d’association retenu par l’administrateur : « ${rc} »`
  }
  if (rn !== '') {
    out += `\nNom d’association retenu : « ${rn} »`
  }
  return out
}

function buildModalFromRow(r: AssociationCodeRequestStatusRow): AssociationRequestModalPayload {
  const n = normalizeStatusRow(r)
  if (n.id <= 0) {
    return { show: false }
  }
  const cm = n.client_message?.trim() ?? ''
  if (n.status === 'approved') {
    let base =
      (cm
        ? cm
        : `Votre demande concernant le code « ${n.code} » a été approuvée.`) +
      (n.proposed && n.proposed !== '—' ? ` Nom proposé : ${n.proposed}.` : '')
    base = appendResolvedByAdmin(base, r)
    return {
      show: true,
      requestId: n.id,
      title: 'Demande approuvée',
      status: 'approved',
      message: base
    }
  }
  if (n.status === 'rejected') {
    const detail =
      cm || (n.admin_note != null && String(n.admin_note).trim() !== '' ? String(n.admin_note).trim() : null)
    return {
      show: true,
      requestId: n.id,
      title: 'Demande refusée',
      status: 'rejected',
      message: detail
        ? `Votre demande concernant le code « ${n.code} » a été refusée.\n\n${detail}`
        : `Votre demande concernant le code « ${n.code} » a été refusée.`
    }
  }
  return { show: false }
}

/**
 * Première demande « résolue » (approuvée / refusée) non notifiée à l’utilisateur, pour modale.
 */
export async function checkAssociationRequestResponsesForModal(): Promise<AssociationRequestModalPayload> {
  if (!(await isNetworkReachableForWebLicenses())) {
    return { show: false }
  }
  const cred = resolveWebLicenseCredentials(loadLicense())
  if (!cred) {
    return { show: false }
  }
  const ids = getIdsToPollForRequestStatus()
  if (ids.length === 0) {
    return { show: false }
  }
  const r = await webLicenseAssociationRequestStatus(cred, ids)
  if (!r.ok) {
    return { show: false }
  }
  const resolved: AssociationCodeRequestStatusRow[] = []
  for (const row of r.results) {
    const st = String(row.status ?? '').toLowerCase()
    if (st === 'approved' || st === 'rejected') {
      resolved.push(row)
    }
  }
  resolved.sort((a, b) => {
    const da = a.reviewed_at ?? a.created_at ?? ''
    const db = b.reviewed_at ?? b.created_at ?? ''
    return db.localeCompare(da)
  })
  for (const row of resolved) {
    const m = buildModalFromRow(row)
    if (m.show) {
      return m
    }
  }
  return { show: false }
}
