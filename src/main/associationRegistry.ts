import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  rmSync
} from 'fs'
import { extname, join } from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import type { AppPersistedData } from '../shared/catalog'
import { factoryResetPersistedData } from '../shared/catalog'
import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'

export const REGISTRY_FILENAME = 'associations-registry.json'
export const ASSOCIATIONS_SUBDIR = 'associations'
export const DATA_FILENAME = 'caisse-data.json'
export const SALES_FILENAME = 'ventes-historique.json'

export interface AssociationListItem {
  id: string
  displayName: string
  /** Code association (clé courte). Absent ou null si jeton long uniquement. */
  licenseAssociationCode?: string | null
}

export interface AssociationRegistryFile {
  version: 1
  lastSelectedId: string | null
  items: AssociationListItem[]
}

type Registry = AssociationRegistryFile

let activeAssociationId: string | null = null

export function getActiveAssociationId(): string | null {
  return activeAssociationId
}

export function getActiveAssociationIdRequired(): string {
  if (!activeAssociationId) {
    throw new Error('Aucune association active')
  }
  return activeAssociationId
}

export function setActiveAssociationId(id: string | null): void {
  if (id === null) {
    activeAssociationId = null
    return
  }
  const reg = readRegistry()
  if (!reg.items.some((x) => x.id === id)) {
    throw new Error('Association inconnue')
  }
  activeAssociationId = id
  reg.lastSelectedId = id
  writeRegistry(reg)
}

export function rootUserData(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function registryPath(): string {
  return join(rootUserData(), REGISTRY_FILENAME)
}

function associationDir(id: string): string {
  return join(rootUserData(), ASSOCIATIONS_SUBDIR, id)
}

/** Chemin du dossier d’une association (sans créer le dossier). */
export function getAssociationFolderPath(id: string): string {
  return associationDir(id)
}

function logoMimeFromFileName(fileName: string): string {
  switch (extname(fileName).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Data URL du logo d’une association (pour l’écran de choix de profil), si présent sur disque.
 */
export function readAssociationLogoDataUrl(associationId: string): string | null {
  const dataPath = join(associationDir(associationId), DATA_FILENAME)
  if (!existsSync(dataPath)) return null
  let fileName: string | null = null
  try {
    const raw = JSON.parse(readFileSync(dataPath, 'utf-8')) as AppPersistedData
    const f = raw?.association?.logoFile
    fileName = typeof f === 'string' && f.length > 0 ? f : null
  } catch {
    return null
  }
  if (!fileName) return null
  const full = join(associationDir(associationId), fileName)
  if (!existsSync(full)) return null
  try {
    const buf = readFileSync(full)
    const mime = logoMimeFromFileName(fileName)
    if (mime === 'image/svg+xml') {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString('utf-8'))}`
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Dossier parent contenant toutes les associations (`…/userData/associations`). */
export function associationsRootDir(): string {
  return join(rootUserData(), ASSOCIATIONS_SUBDIR)
}

/** Dossier de données de l’association (images, JSON). */
export function associationDataDir(id: string): string {
  const d = associationDir(id)
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

export function readRegistry(): Registry {
  const p = registryPath()
  if (!existsSync(p)) {
    return { version: 1, lastSelectedId: null, items: [] }
  }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Registry
    if (!raw || raw.version !== 1 || !Array.isArray(raw.items)) {
      return { version: 1, lastSelectedId: null, items: [] }
    }
    return {
      version: 1,
      lastSelectedId:
        typeof raw.lastSelectedId === 'string' || raw.lastSelectedId === null
          ? raw.lastSelectedId
          : null,
      items: raw.items
        .filter((x) => x && typeof x.id === 'string' && typeof x.displayName === 'string')
        .map((x) => {
          const codeRaw = (x as AssociationListItem).licenseAssociationCode
          let licenseAssociationCode: string | null | undefined
          if (typeof codeRaw === 'string' && codeRaw.trim()) {
            const norm = normalizeLicenseAssociationCode(codeRaw.trim())
            licenseAssociationCode = norm ?? undefined
          } else if (codeRaw === null) {
            licenseAssociationCode = null
          } else {
            licenseAssociationCode = undefined
          }
          return {
            id: x.id,
            displayName: x.displayName,
            ...(licenseAssociationCode !== undefined ? { licenseAssociationCode } : {})
          }
        })
    }
  } catch {
    return { version: 1, lastSelectedId: null, items: [] }
  }
}

export function writeRegistry(reg: Registry): void {
  writeFileSync(registryPath(), JSON.stringify(reg, null, 2), 'utf-8')
}

export function listAssociations(): AssociationListItem[] {
  const reg = readRegistry()
  return reg.items.map((x) => ({ ...x }))
}

export function listAssociationsWithMeta(): {
  items: AssociationListItem[]
  lastSelectedId: string | null
} {
  const reg = readRegistry()
  return {
    items: reg.items.map((x) => ({ ...x })),
    lastSelectedId: reg.lastSelectedId
  }
}

export function updateAssociationDisplayName(id: string, displayName: string): void {
  const trimmed = displayName.trim().slice(0, 200)
  if (!trimmed) return
  const reg = readRegistry()
  const item = reg.items.find((x) => x.id === id)
  if (!item || item.displayName === trimmed) return
  item.displayName = trimmed
  writeRegistry(reg)
}

/** Met à jour nom + code association dans le registre (après sauvegarde caisse-data). */
/**
 * Retire le code association du registre et du fichier caisse-data (profil plus lié à une ligne serveur).
 */
export function clearLicenseAssociationCodeForAssociation(id: string): void {
  const reg = readRegistry()
  const item = reg.items.find((x) => x.id === id)
  if (!item) return
  item.licenseAssociationCode = null
  writeRegistry(reg)
  const p = join(associationDir(id), DATA_FILENAME)
  if (!existsSync(p)) return
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as AppPersistedData
    data.association.licenseAssociationCode = null
    writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    /* ignore */
  }
}

export function updateAssociationRegistryFromPersistedData(
  id: string,
  displayName: string,
  licenseAssociationCode: string | null
): void {
  const name = displayName.trim().slice(0, 200) || 'Association'
  const reg = readRegistry()
  const item = reg.items.find((x) => x.id === id)
  if (!item) return
  item.displayName = name
  item.licenseAssociationCode = licenseAssociationCode
  writeRegistry(reg)
}

function normalizeAssocCode(raw: string | null | undefined): string | null {
  return normalizeLicenseAssociationCode(raw ?? null)
}

/** Lit le code association depuis le fichier local (rétrocompat sans champ registre). */
export function readLicenseAssociationCodeFromDataFile(id: string): string | null {
  const p = join(associationDir(id), DATA_FILENAME)
  if (!existsSync(p)) return null
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as AppPersistedData
    return normalizeAssocCode(raw?.association?.licenseAssociationCode ?? null)
  } catch {
    return null
  }
}

/** Registre prioritaire, sinon fichier caisse-data (migrations). */
export function getEffectiveLicenseAssociationCode(id: string): string | null {
  const reg = readRegistry()
  const item = reg.items.find((x) => x.id === id)
  if (item?.licenseAssociationCode) return normalizeAssocCode(item.licenseAssociationCode)
  return readLicenseAssociationCodeFromDataFile(id)
}

function writeDefaultAssociationFiles(
  dir: string,
  displayName: string,
  licenseAssociationCode: string | null
): void {
  const data = factoryResetPersistedData()
  data.association.name = displayName
  data.association.numero = ''
  data.association.logoFile = null
  data.association.licenseAssociationCode = licenseAssociationCode
  writeFileSync(join(dir, DATA_FILENAME), JSON.stringify(data, null, 2), 'utf-8')
  writeFileSync(join(dir, SALES_FILENAME), JSON.stringify({ sales: [] }, null, 2), 'utf-8')
}

export function createAssociation(
  displayName: string,
  licenseAssociationCode: string | null | undefined
): { ok: true; id: string } {
  const name = displayName.trim().slice(0, 120) || 'Nouvelle caisse'
  const code = normalizeAssocCode(licenseAssociationCode ?? null)
  const id = randomUUID()
  const dir = associationDir(id)
  mkdirSync(dir, { recursive: true })
  writeDefaultAssociationFiles(dir, name, code)
  const reg = readRegistry()
  reg.items.push({ id, displayName: name, licenseAssociationCode: code })
  writeRegistry(reg)
  return { ok: true, id }
}

export function deleteAssociationData(id: string): { ok: true } | { ok: false; error: 'not_found' } {
  const reg = readRegistry()
  if (!reg.items.some((x) => x.id === id)) {
    return { ok: false, error: 'not_found' }
  }
  const dir = associationDir(id)
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      return { ok: false, error: 'not_found' }
    }
  }
  reg.items = reg.items.filter((x) => x.id !== id)
  if (reg.lastSelectedId === id) {
    reg.lastSelectedId = null
  }
  writeRegistry(reg)
  if (activeAssociationId === id) {
    activeAssociationId = null
  }
  return { ok: true }
}

/** Supprime toutes les associations locales et vide le registre (remise à zéro projet). */
export function wipeAllAssociationsAndRegistry(): void {
  const root = associationsRootDir()
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true })
  }
  mkdirSync(root, { recursive: true })
  writeRegistry({ version: 1, lastSelectedId: null, items: [] })
  activeAssociationId = null
}

/** Chemins d’installation / racine utilisateur (affichage). */
export function getInstallationInfo(): {
  userDataRoot: string
  exePath: string
  appPath: string
} {
  return {
    userDataRoot: rootUserData(),
    exePath: app.getPath('exe'),
    appPath: app.getAppPath()
  }
}

export function getActiveAssociationDataPaths(): {
  dataFile: string
  salesFile: string
} | null {
  const id = activeAssociationId
  if (!id) return null
  const d = associationDir(id)
  return {
    dataFile: join(d, DATA_FILENAME),
    salesFile: join(d, SALES_FILENAME)
  }
}

/**
 * Migration : ancien modèle (fichiers à la racine userData) → sous-dossier associations/&lt;id&gt;.
 * Premier lancement sans rien : une association par défaut.
 */
export function migrateLegacyIfNeeded(): void {
  const root = rootUserData()
  const regPath = registryPath()
  if (existsSync(regPath)) {
    return
  }

  const legacyData = join(root, DATA_FILENAME)
  const legacySales = join(root, SALES_FILENAME)

  if (!existsSync(legacyData)) {
    writeRegistry({ version: 1, lastSelectedId: null, items: [] })
    return
  }

  const id = randomUUID()
  const dir = associationDir(id)
  mkdirSync(dir, { recursive: true })
  renameSync(legacyData, join(dir, DATA_FILENAME))
  if (existsSync(legacySales)) {
    renameSync(legacySales, join(dir, SALES_FILENAME))
  } else {
    writeFileSync(join(dir, SALES_FILENAME), JSON.stringify({ sales: [] }), 'utf-8')
  }

  let displayName = 'Association'
  try {
    const raw = JSON.parse(readFileSync(join(dir, DATA_FILENAME), 'utf-8')) as AppPersistedData
    const n = raw?.association?.name
    if (typeof n === 'string' && n.trim()) displayName = n.trim().slice(0, 120)
  } catch {
    /* ignore */
  }

  try {
    const raw = JSON.parse(readFileSync(join(dir, DATA_FILENAME), 'utf-8')) as AppPersistedData
    const names = new Set<string>()
    if (raw.association?.logoFile) names.add(raw.association.logoFile)
    for (const p of raw.products ?? []) {
      if (p.imageFile) names.add(p.imageFile)
    }
    for (const n of names) {
      const from = join(root, n)
      const to = join(dir, n)
      if (existsSync(from) && !existsSync(to)) {
        try {
          renameSync(from, to)
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  let licenseAssociationCode: string | null = null
  try {
    const raw = JSON.parse(readFileSync(join(dir, DATA_FILENAME), 'utf-8')) as AppPersistedData
    licenseAssociationCode = normalizeAssocCode(raw?.association?.licenseAssociationCode ?? null)
  } catch {
    /* ignore */
  }

  const reg: Registry = {
    version: 1,
    lastSelectedId: id,
    items: [
      {
        id,
        displayName,
        ...(licenseAssociationCode ? { licenseAssociationCode } : {})
      }
    ]
  }
  writeRegistry(reg)
}
