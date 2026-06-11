import { dialog } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import type { AssociationRegistryFile } from './associationRegistry.js'
import {
  associationDataDir,
  createAssociation,
  getActiveAssociationId,
  getAssociationFolderPath,
  readRegistry,
  setActiveAssociationId,
  writeRegistry
} from './associationRegistry.js'
import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'
import { validateNewAssociationLicense } from './caisseLicenseVerifier.js'
import { isLicenseServerAdminPin } from './adminUnlock.js'
import { hashPin } from './pinHash.js'
import { loadPersistedData } from './stateStore.js'
import type { AppPersistedData } from '../shared/catalog'

export const BACKUP_FORMAT = 'caisse-buvette-backup' as const
export const BACKUP_VERSION = 1 as const

export type BackupPayloadV1 = {
  format: typeof BACKUP_FORMAT
  version: typeof BACKUP_VERSION
  exportedAt: string
  scope: 'full' | 'association'
  registry: AssociationRegistryFile
  associations: {
    id: string
    displayName: string
    files: Record<string, string>
  }[]
}

function posixRel(p: string): string {
  return p.replace(/\\/g, '/')
}

function collectFilesRecursive(rootDir: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {}
  function walk(dir: string, relBase: string): void {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      const rel = relBase ? `${relBase}/${name}` : name
      const st = statSync(full)
      if (st.isDirectory()) {
        walk(full, rel)
      } else if (st.isFile()) {
        out[posixRel(rel)] = readFileSync(full)
      }
    }
  }
  walk(rootDir, '')
  return out
}

/** Export pour contrôler que la copie distante correspond au code licence de ce profil. */
export function licenseCodeFromBackupFiles(files: Record<string, string>): string | null {
  const b64 = files['caisse-data.json']
  if (!b64 || typeof b64 !== 'string') return null
  try {
    const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')) as AppPersistedData
    const raw = json?.association?.licenseAssociationCode
    return normalizeLicenseAssociationCode(raw)
  } catch {
    return null
  }
}

function writeFilesFromBase64(targetDir: string, files: Record<string, string>): void {
  mkdirSync(targetDir, { recursive: true })
  for (const [rel, b64] of Object.entries(files)) {
    const dest = join(targetDir, ...rel.split('/'))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, Buffer.from(b64, 'base64'))
  }
}

async function verifyPinOrNoPin(pin: string): Promise<boolean> {
  if (await isLicenseServerAdminPin(pin)) return true
  const data = loadPersistedData()
  if (data.security.pinHash === null) return true
  if (!data.security.pinSalt) return false
  return hashPin(pin, data.security.pinSalt) === data.security.pinHash
}

/** Vérifie le PIN (ou absence de PIN) pour les opérations sensibles sur l’association active. */
export async function verifyActiveAssociationBackupPin(pin: string): Promise<boolean> {
  return verifyPinOrNoPin(pin)
}

/**
 * Payload JSON pour l’API `association-sync-upload` : même enveloppe que l’export manuel (.json association).
 */
export function buildActiveAssociationSyncPayloadJson():
  | { ok: true; json: string }
  | { ok: false; error: 'no_active' | 'not_found' } {
  const id = getActiveAssociationId()
  if (!id) return { ok: false, error: 'no_active' }
  const reg = readRegistry()
  const item = reg.items.find((x) => x.id === id)
  if (!item) return { ok: false, error: 'not_found' }
  const payload = buildPayloadForAssociation(id, item.displayName, 'association')
  return { ok: true, json: JSON.stringify(payload) }
}

function buildPayloadForAssociation(
  id: string,
  displayName: string,
  scope: 'full' | 'association'
): BackupPayloadV1 {
  const dir = associationDataDir(id)
  const raw = collectFilesRecursive(dir)
  const files: Record<string, string> = {}
  for (const [k, buf] of Object.entries(raw)) {
    files[k] = buf.toString('base64')
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    scope,
    registry: readRegistry(),
    associations: [{ id, displayName, files }]
  }
}

export async function exportFullBackup(): Promise<
  { ok: true; path: string } | { ok: false; canceled: true } | { ok: false; error: string }
> {
  const reg = readRegistry()
  const associations: BackupPayloadV1['associations'] = []
  for (const item of reg.items) {
    const dir = associationDataDir(item.id)
    const raw = collectFilesRecursive(dir)
    const files: Record<string, string> = {}
    for (const [k, buf] of Object.entries(raw)) {
      files[k] = buf.toString('base64')
    }
    associations.push({ id: item.id, displayName: item.displayName, files })
  }
  const payload: BackupPayloadV1 = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    scope: 'full',
    registry: reg,
    associations
  }
  const json = JSON.stringify(payload)
  const r = await dialog.showSaveDialog({
    title: 'Exporter toutes les données',
    defaultPath: `caisse-sauvegarde-complete-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Sauvegarde Caisse', extensions: ['json'] }]
  })
  if (r.canceled || !r.filePath) return { ok: false, canceled: true }
  try {
    writeFileSync(r.filePath, json, 'utf-8')
    return { ok: true, path: r.filePath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Écriture impossible' }
  }
}

export async function exportCurrentAssociationBackup(): Promise<
  { ok: true; path: string } | { ok: false; canceled: true } | { ok: false; error: string }
> {
  const id = getActiveAssociationId()
  if (!id) return { ok: false, error: 'no_active' }
  const reg = readRegistry()
  const item = reg.items.find((x) => x.id === id)
  if (!item) return { ok: false, error: 'not_found' }
  const payload = buildPayloadForAssociation(id, item.displayName, 'association')
  const safe = item.displayName.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'association'
  const json = JSON.stringify(payload)
  const r = await dialog.showSaveDialog({
    title: 'Exporter cette association',
    defaultPath: `caisse-${safe}-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Sauvegarde Caisse', extensions: ['json'] }]
  })
  if (r.canceled || !r.filePath) return { ok: false, canceled: true }
  try {
    writeFileSync(r.filePath, json, 'utf-8')
    return { ok: true, path: r.filePath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Écriture impossible' }
  }
}

export async function exportCurrentToBackupFolder(
  folderPath: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const id = getActiveAssociationId()
  if (!id) return { ok: false, error: 'no_active' }
  const reg = readRegistry()
  const item = reg.items.find((x) => x.id === id)
  if (!item) return { ok: false, error: 'not_found' }
  if (!folderPath.trim() || !existsSync(folderPath)) {
    return { ok: false, error: 'bad_folder' }
  }
  const payload = buildPayloadForAssociation(id, item.displayName, 'association')
  const safe = item.displayName.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'association'
  const name = `caisse-${safe}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  const dest = join(folderPath, name)
  try {
    writeFileSync(dest, JSON.stringify(payload), 'utf-8')
    return { ok: true, path: dest }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Écriture impossible' }
  }
}

export async function pickBackupFolder(): Promise<
  { ok: true; path: string } | { ok: false; canceled: true }
> {
  const r = await dialog.showOpenDialog({
    title: 'Dossier de sauvegarde pour cette association',
    properties: ['openDirectory', 'createDirectory']
  })
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
  return { ok: true, path: r.filePaths[0] }
}

export function parseBackupPayload(raw: string): BackupPayloadV1 | null {
  try {
    const o = JSON.parse(raw) as BackupPayloadV1
    if (o.format !== BACKUP_FORMAT || o.version !== 1 || !Array.isArray(o.associations)) {
      return null
    }
    if (!o.registry || o.registry.version !== 1 || !Array.isArray(o.registry.items)) {
      return null
    }
    return o
  } catch {
    return null
  }
}

export async function applyFullImport(
  payload: BackupPayloadV1,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await verifyPinOrNoPin(pin))) return { ok: false, error: 'wrong_pin' }
  if (payload.scope !== 'full') return { ok: false, error: 'not_full_backup' }
  if (payload.associations.length !== payload.registry.items.length) {
    return { ok: false, error: 'registry_mismatch' }
  }
  try {
    const current = readRegistry()
    for (const item of current.items) {
      const p = getAssociationFolderPath(item.id)
      if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true })
      }
    }
    writeRegistry(payload.registry)
    for (const a of payload.associations) {
      const dir = associationDataDir(a.id)
      mkdirSync(dir, { recursive: true })
      writeFilesFromBase64(dir, a.files)
    }
    const pick = payload.registry.lastSelectedId ?? payload.registry.items[0]?.id ?? null
    if (pick) setActiveAssociationId(pick)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'import_failed' }
  }
}

export async function applyAssociationImportReplace(
  payload: BackupPayloadV1,
  pin: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await verifyPinOrNoPin(pin))) return { ok: false, error: 'wrong_pin' }
  const id = getActiveAssociationId()
  if (!id) return { ok: false, error: 'no_active' }
  const one = payload.associations[0]
  if (!one) return { ok: false, error: 'empty' }
  try {
    const dir = getAssociationFolderPath(id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }
    mkdirSync(dir, { recursive: true })
    writeFilesFromBase64(dir, one.files)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'import_failed' }
  }
}

export async function applyAssociationImportNew(
  payload: BackupPayloadV1,
  pin: string
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await verifyPinOrNoPin(pin))) return { ok: false, error: 'wrong_pin' }
  const one = payload.associations[0]
  if (!one) return { ok: false, error: 'empty' }
  const name = one.displayName.trim().slice(0, 120) || 'Association importée'
  const licCode = licenseCodeFromBackupFiles(one.files)
  const pre = await validateNewAssociationLicense('', licCode)
  if (!pre.ok) return { ok: false, error: pre.reason }
  try {
    const created = createAssociation(name, licCode)
    const dir = getAssociationFolderPath(created.id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }
    mkdirSync(dir, { recursive: true })
    writeFilesFromBase64(dir, one.files)
    setActiveAssociationId(created.id)
    return { ok: true, id: created.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'import_failed' }
  }
}

export async function importBackupFromFile(
  filePath: string,
  mode: 'full' | 'replace' | 'new',
  pin: string
): Promise<{ ok: true; reload: boolean } | { ok: false; error: string }> {
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return { ok: false, error: 'read_failed' }
  }
  const payload = parseBackupPayload(raw)
  if (!payload) return { ok: false, error: 'invalid_file' }

  if (mode === 'full') {
    const r = await applyFullImport(payload, pin)
    if (!r.ok) return r
    return { ok: true, reload: true }
  }
  if (mode === 'replace') {
    const r = await applyAssociationImportReplace(payload, pin)
    if (!r.ok) return r
    return { ok: true, reload: false }
  }
  const r = await applyAssociationImportNew(payload, pin)
  if (!r.ok) return r
  return { ok: true, reload: true }
}

export async function openImportBackupDialog(): Promise<
  { ok: true; filePath: string } | { ok: false; canceled: true }
> {
  const r = await dialog.showOpenDialog({
    title: 'Choisir un fichier de sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde Caisse', extensions: ['json'] }]
  })
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
  return { ok: true, filePath: r.filePaths[0] }
}
