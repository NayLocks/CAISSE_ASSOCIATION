import {
  clearLicenseAssociationCodeForAssociation,
  createAssociation,
  readRegistry,
  updateAssociationDisplayName
} from './associationRegistry.js'
import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'
import type { WebLicenseLookupOk } from './webLicenseClient.js'

function findLocalByAssociationCode(code: string): { id: string; displayName: string } | null {
  const norm = normalizeLicenseAssociationCode(code)
  if (!norm) return null
  const reg = readRegistry()
  for (const it of reg.items) {
    const c = normalizeLicenseAssociationCode(it.licenseAssociationCode ?? null)
    if (c === norm) return { id: it.id, displayName: it.displayName }
  }
  return null
}

export type SyncAssociationsFromLicenseResult = {
  created: number
  renamed: number
}

/**
 * Crée les associations locales manquantes à partir de la liste renvoyée par license-lookup,
 * et met à jour le nom affiché si le serveur a changé.
 */
export function syncLocalAssociationsFromLicense(
  license: WebLicenseLookupOk['license']
): SyncAssociationsFromLicenseResult {
  const rows = license.associations
  if (!rows?.length) return { created: 0, renamed: 0 }
  let created = 0
  let renamed = 0
  const sorted = [...rows].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
  )
  for (const row of sorted) {
    const code = normalizeLicenseAssociationCode(row.code)
    if (!code) continue
    const nameRaw = typeof row.name === 'string' ? row.name.trim().slice(0, 120) : ''
    const displayName = nameRaw || 'Association'
    const existing = findLocalByAssociationCode(code)
    if (!existing) {
      createAssociation(displayName, code)
      created += 1
    } else if (displayName && displayName !== existing.displayName) {
      updateAssociationDisplayName(existing.id, displayName)
      renamed += 1
    }
  }
  return { created, renamed }
}

/**
 * Si le serveur renvoie une liste d’associations, retire le code licence des profils locaux
 * dont le code n’existe plus côté serveur (déliage, sans supprimer les données de caisse).
 */
export function pruneLocalAssociationsNotOnServer(license: WebLicenseLookupOk['license']): number {
  const rows = license.associations
  if (!rows?.length) return 0
  const serverCodes = new Set<string>()
  for (const row of rows) {
    const c = normalizeLicenseAssociationCode(row.code)
    if (c) serverCodes.add(c)
  }
  let delinked = 0
  const reg = readRegistry()
  for (const it of reg.items) {
    const c = normalizeLicenseAssociationCode(it.licenseAssociationCode ?? null)
    if (!c) continue
    if (!serverCodes.has(c)) {
      clearLicenseAssociationCodeForAssociation(it.id)
      delinked += 1
    }
  }
  return delinked
}
