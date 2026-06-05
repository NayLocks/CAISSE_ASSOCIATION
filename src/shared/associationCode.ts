/**
 * Codes d’association alignés sur WEB_LICENCES (lh_normalize_association_code / lh_association_code_is_valid).
 * Longueur 1–32, caractères A–Z, 0–9, tiret et souligné (espaces supprimés, casse normalisée).
 */

export type LicenseAssociationRow = {
  code: string
  sort_order?: number
}

export function normalizeLicenseAssociationCode(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  if (!t) return null
  if (t.length > 32) return null
  if (!/^[A-Z0-9_-]+$/.test(t)) return null
  return t
}

export function isValidLicenseAssociationCode(code: string): boolean {
  return normalizeLicenseAssociationCode(code) === code && code.length >= 1
}

export function orderedAssociationCodes(rows: LicenseAssociationRow[] | null | undefined): string[] {
  if (!rows?.length) return []
  return [...rows]
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((r) => normalizeLicenseAssociationCode(r.code))
    .filter((c): c is string => Boolean(c))
}
