import { normalizeProjectCode } from './projectCode.js'

/**
 * Point d’accès public des API de licence (sans champ modifiable dans l’app).
 * Ex. `https://projets.delannoy.tech/api/v1` → `license-lookup.php` à la racine de ce chemin.
 */
export const WEB_LICENSE_API_PUBLIC_BASE = 'https://projets.delannoy.tech/api/v1'

/** Code produit fixe (`projects.code` sur WEB_LICENCES) : licence, activation, mises à jour. */
export const APP_WEB_LICENCES_PROJECT_CODE = normalizeProjectCode('CAISSE_ASSOS')

export function resolveWebLicencesPublicProjectCode(): string {
  return APP_WEB_LICENCES_PROJECT_CODE
}
