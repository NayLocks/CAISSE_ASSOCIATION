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
