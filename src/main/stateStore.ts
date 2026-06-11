import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { associationDataDir, getActiveAssociationIdRequired } from './associationRegistry.js'
import type {
  AppPersistedData,
  CategoryConfig,
  EmailReceiptConfig,
  EscposPaperCutMode,
  EscposPaperWidth,
  EventItem,
  IntegrationsConfig,
  PrintingConfig,
  ProductConfig,
  SecurityConfig,
  EventSessionInfo
} from '../shared/catalog'
import {
  defaultPersistedData,
  DEFAULT_CATEGORIES,
  clampReceiptLogoWidthPercent,
  sanitizeAssociationSyncAutoCheckIntervalSec,
  sanitizeDiscountMotifs
} from '../shared/catalog'
import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'

const FILE = 'caisse-data.json'

function sanitizeEvents(raw: unknown, fallback: EventItem[]): EventItem[] {
  if (!Array.isArray(raw)) return fallback
  const out: EventItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const e = item as Record<string, unknown>
    const id = typeof e.id === 'string' ? e.id : ''
    const name = typeof e.name === 'string' ? e.name : ''
    if (!id || !name.trim()) continue
    out.push({
      id,
      name,
      date: typeof e.date === 'string' ? e.date : '',
      notes: typeof e.notes === 'string' ? e.notes : '',
      closed: typeof e.closed === 'boolean' ? e.closed : false
    })
  }
  return out.length > 0 ? out : fallback
}

function sanitizeCategories(raw: unknown, fallback: CategoryConfig[]): CategoryConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((c) => ({ ...c }))
  const out: CategoryConfig[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const label = typeof o.label === 'string' ? o.label : ''
    const short = typeof o.short === 'string' ? o.short : '📁'
    if (!id || !label.trim()) continue
    out.push({ id, label, short })
  }
  return out.length > 0 ? out : fallback.map((c) => ({ ...c }))
}

function sanitizeEmailReceipt(raw: unknown, fallback: EmailReceiptConfig): EmailReceiptConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  const port =
    typeof o.port === 'number' && Number.isFinite(o.port) && o.port > 0 && o.port < 65536
      ? Math.floor(o.port)
      : fallback.port
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : fallback.enabled,
    host: typeof o.host === 'string' ? o.host : fallback.host,
    port,
    secure: typeof o.secure === 'boolean' ? o.secure : fallback.secure,
    user: typeof o.user === 'string' ? o.user : fallback.user,
    password: typeof o.password === 'string' ? o.password : fallback.password,
    fromAddress: typeof o.fromAddress === 'string' ? o.fromAddress : fallback.fromAddress
  }
}

function sanitizePrinting(raw: unknown, fallback: PrintingConfig): PrintingConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  const dn = o.deviceName
  const eng = o.unitTicketEngine
  const unitTicketEngine =
    eng === 'escpos_raw'
      ? 'escpos_raw'
      : eng === 'html_chromium'
        ? 'html_chromium'
        : fallback.unitTicketEngine
  const cut = o.escposCutMode
  const escposCutMode: EscposPaperCutMode =
    cut === 'full' ? 'full' : cut === 'partial' ? 'partial' : fallback.escposCutMode
  const pw = o.escposPaperWidth
  const escposPaperWidth: EscposPaperWidth =
    pw === '58mm' || pw === '80mm' ? pw : fallback.escposPaperWidth
  const escposCutInverted =
    typeof o.escposCutInverted === 'boolean' ? o.escposCutInverted : fallback.escposCutInverted
  return {
    deviceName: dn === null || dn === undefined ? null : typeof dn === 'string' ? dn : null,
    autoPrintTickets:
      typeof o.autoPrintTickets === 'boolean' ? o.autoPrintTickets : fallback.autoPrintTickets,
    silentPrint:
      typeof o.silentPrint === 'boolean' ? o.silentPrint : fallback.silentPrint,
    unitTicketEngine,
    escposCutMode,
    escposPaperWidth,
    escposCutInverted
  }
}

function sanitizeLowStockThreshold(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.floor(n))
}

function sanitizeProducts(raw: ProductConfig[]): ProductConfig[] {
  const out: ProductConfig[] = []
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue
    const id = typeof p.id === 'string' ? p.id : ''
    const name = typeof p.name === 'string' ? p.name : ''
    if (!id || !name.trim()) continue
    out.push({
      id,
      name,
      priceCents:
        typeof p.priceCents === 'number' && Number.isFinite(p.priceCents)
          ? Math.max(0, Math.round(p.priceCents))
          : 0,
      category: typeof p.category === 'string' ? p.category : 'boissons',
      emoji: typeof p.emoji === 'string' && p.emoji ? p.emoji : '📦',
      imageFile:
        p.imageFile === undefined || p.imageFile === null || p.imageFile === ''
          ? null
          : String(p.imageFile),
      trackStock: Boolean(p.trackStock),
      lowStockThreshold: sanitizeLowStockThreshold(
        (p as { lowStockThreshold?: unknown }).lowStockThreshold
      ),
      variablePrice: Boolean((p as { variablePrice?: unknown }).variablePrice),
      cardCashExchange: Boolean((p as { cardCashExchange?: unknown }).cardCashExchange)
    })
  }
  return out.length > 0 ? out : defaultPersistedData().products
}

function fixProductCategories(products: ProductConfig[], categories: CategoryConfig[]): ProductConfig[] {
  const ids = new Set(categories.map((c) => c.id))
  const fallbackId = categories[0]?.id ?? DEFAULT_CATEGORIES[0].id
  return products.map((p) => ({
    ...p,
    category: ids.has(p.category) ? p.category : fallbackId,
    imageFile:
      p.imageFile === undefined || p.imageFile === null || p.imageFile === ''
        ? null
        : String(p.imageFile)
  }))
}

/** Ancienne grille à 4 onglets (chaud / frais / alcool / snacks) → boissons / repas / dessert */
const LEGACY_DEFAULT_CATEGORY_IDS = ['chaud', 'frais', 'alcool', 'snack'] as const

function isLegacyDefaultCategorySet(cats: CategoryConfig[]): boolean {
  if (cats.length !== 4) return false
  const ids = new Set(cats.map((c) => c.id))
  if (ids.size !== 4) return false
  return LEGACY_DEFAULT_CATEGORY_IDS.every((id) => ids.has(id))
}

function mapLegacyProductCategory(productId: string, oldCat: string): string {
  if (oldCat === 'chaud' || oldCat === 'frais' || oldCat === 'alcool') return 'boissons'
  if (oldCat === 'snack') {
    return productId === 'gaufre' || productId === 'crepe' ? 'dessert' : 'repas'
  }
  return oldCat
}

function migrateLegacyDefaultCategories(
  categories: CategoryConfig[],
  products: ProductConfig[]
): { categories: CategoryConfig[]; products: ProductConfig[] } {
  if (!isLegacyDefaultCategorySet(categories)) {
    return { categories, products }
  }
  const nextCategories = DEFAULT_CATEGORIES.map((c) => ({ ...c }))
  const nextProducts = products.map((p) => ({
    ...p,
    category: mapLegacyProductCategory(p.id, p.category)
  }))
  return { categories: nextCategories, products: nextProducts }
}

function sanitizeIntegrations(raw: unknown, fallback: IntegrationsConfig): IntegrationsConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  const su =
    o.sumup && typeof o.sumup === 'object' ? (o.sumup as Record<string, unknown>) : {}
  return {
    sumup: {
      enabled: typeof su.enabled === 'boolean' ? su.enabled : fallback.sumup.enabled,
      apiKey: typeof su.apiKey === 'string' ? su.apiKey : '',
      merchantCode: typeof su.merchantCode === 'string' ? su.merchantCode : '',
      readerId: typeof su.readerId === 'string' ? su.readerId : ''
    }
  }
}

function sanitizeStockByEvent(
  raw: unknown,
  eventIds: string[],
  legacyGlobal: Record<string, number>
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const id of eventIds) {
    out[id] = {}
  }
  if (!raw || typeof raw !== 'object') {
    for (const id of eventIds) {
      out[id] = { ...legacyGlobal }
    }
    return out
  }
  const o = raw as Record<string, unknown>
  for (const eid of eventIds) {
    const m = o[eid]
    if (m && typeof m === 'object' && m !== null) {
      const mm: Record<string, number> = {}
      for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) mm[k] = Math.floor(v)
      }
      out[eid] = mm
    } else {
      out[eid] = { ...legacyGlobal }
    }
  }
  return out
}

function sanitizeEventSessions(raw: unknown): Record<string, EventSessionInfo> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, EventSessionInfo> = {}
  for (const [eid, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const s = v as Record<string, unknown>
    const floatCents =
      typeof s.floatCents === 'number' && Number.isFinite(s.floatCents)
        ? Math.max(0, Math.floor(s.floatCents))
        : 0
    const startedAt = typeof s.startedAt === 'string' ? s.startedAt : new Date().toISOString()
    out[eid] = { floatCents, startedAt }
  }
  return out
}

function sanitizeSecurity(raw: unknown, fallback: SecurityConfig): SecurityConfig {
  if (!raw || typeof raw !== 'object') return { ...fallback }
  const o = raw as Record<string, unknown>
  const pinSalt = typeof o.pinSalt === 'string' ? o.pinSalt : ''
  const pinHash =
    o.pinHash === null || o.pinHash === undefined
      ? null
      : typeof o.pinHash === 'string'
        ? o.pinHash
        : null
  return { pinSalt, pinHash }
}

function dataPath(): string {
  const id = getActiveAssociationIdRequired()
  return join(associationDataDir(id), FILE)
}

function mergeWithDefaults(raw: unknown): AppPersistedData {
  const base = defaultPersistedData()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  let categories = sanitizeCategories(o.categories, base.categories)
  const printing = sanitizePrinting(o.printing, base.printing)

  let products: ProductConfig[] =
    Array.isArray(o.products) && o.products.length > 0
      ? sanitizeProducts(o.products as ProductConfig[])
      : base.products
  const migrated = migrateLegacyDefaultCategories(categories, products)
  categories = migrated.categories
  products = migrated.products
  products = fixProductCategories(products, categories)

  const events = sanitizeEvents(o.events, base.events)
  const eventIds = events.map((e) => e.id)

  const legacyStock =
    typeof o.stock === 'object' && o.stock !== null ? (o.stock as Record<string, number>) : {}
  const stockByEvent = sanitizeStockByEvent(o.stockByEvent, eventIds, legacyStock)
  const eventSessions = sanitizeEventSessions(o.eventSessions)
  const security = sanitizeSecurity(o.security, base.security)
  const integrations = sanitizeIntegrations(o.integrations, base.integrations)
  const emailReceipt = sanitizeEmailReceipt(o.emailReceipt, base.emailReceipt)

  const assocRaw =
    typeof o.association === 'object' && o.association ? (o.association as Record<string, unknown>) : null

  let licenseAssociationCode = base.association.licenseAssociationCode
  if (assocRaw && 'licenseAssociationCode' in assocRaw) {
    const raw = assocRaw.licenseAssociationCode
    if (raw === null || raw === undefined || raw === '') {
      licenseAssociationCode = null
    } else if (typeof raw === 'string') {
      licenseAssociationCode = normalizeLicenseAssociationCode(raw.trim())
    }
  }

  return {
    association: {
      name:
        assocRaw && typeof assocRaw.name === 'string'
          ? String(assocRaw.name)
          : base.association.name,
      numero:
        assocRaw && typeof assocRaw.numero === 'string'
          ? String(assocRaw.numero)
          : base.association.numero,
      logoFile:
        assocRaw && 'logoFile' in assocRaw
          ? (assocRaw.logoFile as string | null) ?? null
          : base.association.logoFile,
      licenseAssociationCode,
      legalAddress:
        assocRaw && typeof assocRaw.legalAddress === 'string'
          ? String(assocRaw.legalAddress)
          : base.association.legalAddress,
      siret: assocRaw && typeof assocRaw.siret === 'string' ? String(assocRaw.siret) : base.association.siret,
      receiptLegalNote:
        assocRaw && typeof assocRaw.receiptLegalNote === 'string'
          ? String(assocRaw.receiptLegalNote)
          : base.association.receiptLegalNote,
      receiptLogoWidthPercent:
        assocRaw && 'receiptLogoWidthPercent' in assocRaw
          ? clampReceiptLogoWidthPercent(assocRaw.receiptLogoWidthPercent)
          : base.association.receiptLogoWidthPercent,
      unitTicketValidityNotice:
        assocRaw && typeof assocRaw.unitTicketValidityNotice === 'string'
          ? String(assocRaw.unitTicketValidityNotice)
          : base.association.unitTicketValidityNotice,
      unitTicketShowLogo:
        assocRaw && typeof assocRaw.unitTicketShowLogo === 'boolean'
          ? assocRaw.unitTicketShowLogo
          : base.association.unitTicketShowLogo,
      unitTicketShowDateTime:
        assocRaw && typeof assocRaw.unitTicketShowDateTime === 'boolean'
          ? assocRaw.unitTicketShowDateTime
          : base.association.unitTicketShowDateTime,
      unitTicketShowAssociationName:
        assocRaw && typeof assocRaw.unitTicketShowAssociationName === 'boolean'
          ? assocRaw.unitTicketShowAssociationName
          : base.association.unitTicketShowAssociationName
    },
    events,
    categories,
    products,
    integrations,
    stockByEvent,
    eventSessions,
    selectedEventId:
      typeof o.selectedEventId === 'string' || o.selectedEventId === null
        ? (o.selectedEventId as string | null)
        : base.selectedEventId,
    printing,
    security,
    orderCounter:
      typeof o.orderCounter === 'number' && o.orderCounter >= 0
        ? Math.floor(o.orderCounter)
        : base.orderCounter,
    associationBackupPath:
      o.associationBackupPath === null || o.associationBackupPath === undefined
        ? base.associationBackupPath
        : typeof o.associationBackupPath === 'string'
          ? o.associationBackupPath
          : base.associationBackupPath,
    clientDisplayTheme:
      o.clientDisplayTheme === 'light' || o.clientDisplayTheme === 'dark'
        ? o.clientDisplayTheme
        : base.clientDisplayTheme,
    cashPaymentUi: o.cashPaymentUi === 'express' ? 'express' : base.cashPaymentUi,
    remoteCaisseEnabled:
      typeof o.remoteCaisseEnabled === 'boolean' ? o.remoteCaisseEnabled : base.remoteCaisseEnabled,
    remoteCaisseTokenRequired:
      typeof o.remoteCaisseTokenRequired === 'boolean'
        ? o.remoteCaisseTokenRequired
        : base.remoteCaisseTokenRequired,
    remoteCaisseToken:
      o.remoteCaisseToken === null || o.remoteCaisseToken === undefined
        ? base.remoteCaisseToken
        : typeof o.remoteCaisseToken === 'string' && o.remoteCaisseToken.length > 0
          ? o.remoteCaisseToken
          : base.remoteCaisseToken,
    emailReceipt,
    associationServerSnapshotRevision:
      typeof o.associationServerSnapshotRevision === 'number' &&
      Number.isFinite(o.associationServerSnapshotRevision)
        ? Math.max(0, Math.floor(o.associationServerSnapshotRevision))
        : o.associationServerSnapshotRevision === null
          ? null
          : base.associationServerSnapshotRevision,
    discountMotifs: sanitizeDiscountMotifs(o.discountMotifs),
    autoBackupEnabled:
      typeof o.autoBackupEnabled === 'boolean' ? o.autoBackupEnabled : base.autoBackupEnabled,
    autoBackupLastRunDate:
      typeof o.autoBackupLastRunDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.autoBackupLastRunDate)
        ? o.autoBackupLastRunDate
        : o.autoBackupLastRunDate === null
          ? null
          : base.autoBackupLastRunDate,
    associationSyncAutoCheckEnabled:
      typeof o.associationSyncAutoCheckEnabled === 'boolean'
        ? o.associationSyncAutoCheckEnabled
        : base.associationSyncAutoCheckEnabled,
    associationSyncAutoCheckIntervalSec: sanitizeAssociationSyncAutoCheckIntervalSec(
      o.associationSyncAutoCheckIntervalSec ?? base.associationSyncAutoCheckIntervalSec
    ),
    associationSyncAutoPin:
      typeof o.associationSyncAutoPin === 'string'
        ? o.associationSyncAutoPin.slice(0, 64)
        : o.associationSyncAutoPin === null
          ? null
          : base.associationSyncAutoPin
  }
}

export function loadPersistedData(): AppPersistedData {
  const path = dataPath()
  if (!existsSync(path)) {
    return defaultPersistedData()
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    return mergeWithDefaults(raw)
  } catch {
    return defaultPersistedData()
  }
}

export function savePersistedData(data: AppPersistedData): void {
  const path = dataPath()
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

export function userDataDir(): string {
  const id = getActiveAssociationIdRequired()
  return associationDataDir(id)
}

export function copyLogoFromPath(sourcePath: string): string | null {
  const ext = sourcePath.match(/\.(png|jpe?g|gif|webp|svg)$/i)?.[0] ?? '.png'
  const name = `logo${ext}`
  const dest = join(userDataDir(), name)
  try {
    copyFileSync(sourcePath, dest)
    return name
  } catch {
    return null
  }
}

export function logoFullPath(fileName: string): string {
  return join(userDataDir(), fileName)
}

export function productImageFullPath(fileName: string): string {
  return join(userDataDir(), fileName)
}

export function copyProductImageFromPath(sourcePath: string): string | null {
  const ext = sourcePath.match(/\.(png|jpe?g|gif|webp)$/i)?.[0] ?? '.png'
  const name = `pimg-${randomUUID()}${ext}`
  const dest = join(userDataDir(), name)
  try {
    copyFileSync(sourcePath, dest)
    return name
  } catch {
    return null
  }
}

export function unlinkProductImageFile(fileName: string | null): void {
  if (!fileName) return
  const p = productImageFullPath(fileName)
  try {
    if (existsSync(p)) unlinkSync(p)
  } catch {
    /* ignore */
  }
}
