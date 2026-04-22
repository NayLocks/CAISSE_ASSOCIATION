import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { app } from 'electron'

const SUBDIR = 'caisse-license'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Dossier conseillé : %userData%/caisse-license/ (public.pem, master.secret). */
export function userDataLicenseDir(): string {
  return join(app.getPath('userData'), SUBDIR)
}

/** Fichier d’ancrage anti-fraude horloge (CAISSE_LICENCE `clock-trust`). */
export function clockAnchorStorePath(): string {
  return join(userDataLicenseDir(), 'clock-anchor.json')
}

export function loadPublicKeyPem(): string | null {
  const fromEnv = process.env.CAISSE_LICENSE_PUBLIC_PEM_FILE
  if (fromEnv && existsSync(fromEnv)) {
    return readFileSync(fromEnv, 'utf8').trim()
  }
  const ud = join(userDataLicenseDir(), 'public.pem')
  if (existsSync(ud)) {
    return readFileSync(ud, 'utf8').trim()
  }
  if (app.isPackaged) {
    const rp = join(process.resourcesPath, SUBDIR, 'public.pem')
    if (existsSync(rp)) return readFileSync(rp, 'utf8').trim()
  }
  return null
}

export function loadMasterSecret32(): Buffer | null {
  const fromEnv = process.env.CAISSE_LICENSE_MASTER_FILE
  if (fromEnv && existsSync(fromEnv)) {
    const b = parseHexFile(fromEnv)
    if (b) return b
  }
  const ud = join(userDataLicenseDir(), 'master.secret')
  if (existsSync(ud)) {
    const b = parseHexFile(ud)
    if (b) return b
  }

  const bundled = resolveBundledMasterSecretPath()
  if (bundled) {
    const b = parseHexFile(bundled)
    if (b) return b
  }

  return null
}

/**
 * Secret HMAC embarqué : installateur (extraResources → resources/caisse-license/)
 * ou développement (dépôt CAISSE_LICENCE adjacent).
 */
function resolveBundledMasterSecretPath(): string | null {
  const name = 'master.secret'
  if (app.isPackaged) {
    const p = join(process.resourcesPath, SUBDIR, name)
    return existsSync(p) ? p : null
  }
  const candidates = [
    join(process.cwd(), 'resources', SUBDIR, name),
    join(process.cwd(), '..', 'CAISSE_LICENCE', 'keys', name),
    join(__dirname, '../../resources', SUBDIR, name)
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function parseHexFile(path: string): Buffer | null {
  try {
    const h = readFileSync(path, 'utf8').trim()
    const b = Buffer.from(h, 'hex')
    return b.length === 32 ? b : null
  } catch {
    return null
  }
}
