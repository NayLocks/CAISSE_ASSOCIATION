import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SaleRecord } from '../shared/sales'
import { SALES_FILENAME, associationDataDir, getActiveAssociationIdRequired } from './associationRegistry.js'

const MAX = 8000

function path(): string {
  const id = getActiveAssociationIdRequired()
  return join(associationDataDir(id), SALES_FILENAME)
}

interface FileShape {
  sales: SaleRecord[]
}

function load(): SaleRecord[] {
  const p = path()
  if (!existsSync(p)) return []
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as FileShape
    return Array.isArray(raw.sales) ? raw.sales : []
  } catch {
    return []
  }
}

function save(sales: SaleRecord[]): void {
  const trimmed = sales.length > MAX ? sales.slice(sales.length - MAX) : sales
  writeFileSync(path(), JSON.stringify({ sales: trimmed }, null, 0), 'utf-8')
}

export function appendSale(record: SaleRecord): void {
  const sales = load()
  sales.push(record)
  save(sales)
}

export function listSales(): SaleRecord[] {
  return load().slice().reverse()
}

/** Recherche pour réimpression tablette : même événement que la session courante. */
export function findSaleByOrderForEvent(orderNumber: number, eventId: string): SaleRecord | undefined {
  return load().find((s) => s.orderNumber === orderNumber && s.eventId === eventId)
}

/** Recopie nom / date / notes d’un événement sur toutes les ventes déjà enregistrées pour cet `eventId`. */
export function applyEventMetadataToSales(
  eventId: string,
  meta: { eventName: string; eventDate: string; eventNotes: string }
): { updated: number } {
  const sales = load()
  let updated = 0
  const next = sales.map((s) => {
    if (s.eventId !== eventId) return s
    const d = typeof s.eventDate === 'string' ? s.eventDate : ''
    const n = typeof s.eventNotes === 'string' ? s.eventNotes : ''
    if (s.eventName === meta.eventName && d === meta.eventDate && n === meta.eventNotes) return s
    updated += 1
    return {
      ...s,
      eventName: meta.eventName,
      eventDate: meta.eventDate,
      eventNotes: meta.eventNotes
    }
  })
  if (updated > 0) save(next)
  return { updated }
}

/** Vide l’historique des ventes (fichier sur disque recréé vide). */
export function clearSalesHistory(): void {
  const p = path()
  try {
    if (existsSync(p)) unlinkSync(p)
  } catch {
    /* ignore */
  }
  save([])
}
