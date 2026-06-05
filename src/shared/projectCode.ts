/** Aligné sur WEB_LICENCES (`api_authenticate_project`) : majuscules, espaces retirés. */
export function normalizeProjectCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, '')
}
