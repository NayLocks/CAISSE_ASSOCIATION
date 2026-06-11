import type { CategoryConfig, ProductConfig } from '@shared/catalog'
import { parseEurosToCents } from '@renderer/utils/money'

export type ArticleCsvRow = Omit<ProductConfig, 'id' | 'imageFile'> & { imageFile: null }

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      q = !q
      continue
    }
    if (!q && (c === ',' || c === ';')) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out.map((s) => s.replace(/^"|"$/g, '').trim())
}

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function resolveCategoryId(
  raw: string,
  categories: CategoryConfig[],
  defaultCategoryId: string
): string {
  const t = raw.trim()
  if (!t) return defaultCategoryId
  const n = norm(t)
  const byId = categories.find((c) => c.id === t)
  if (byId) return byId.id
  const byShort = categories.find((c) => norm(c.short) === n || norm(c.label) === n)
  if (byShort) return byShort.id
  return defaultCategoryId
}

function parseTrack(raw: string): boolean {
  const n = norm(raw)
  return n === '1' || n === 'oui' || n === 'o' || n === 'true' || n === 'yes' || n === 'y'
}

/** Associe un libellé d’en-tête à une clé logique. */
function headerKey(cell: string): string | null {
  const k = norm(cell).replace(/\s+/g, '_')
  if (['nom', 'name', 'article', 'libelle'].includes(k)) return 'name'
  if (['prix', 'prix_eur', 'price', 'prixeur', 'pu'].includes(k)) return 'price'
  if (['categorie', 'category', 'cat'].includes(k)) return 'category'
  if (['emoji', 'icone', 'icon'].includes(k)) return 'emoji'
  if (['stock', 'suivi', 'suivi_stock', 'track', 'track_stock'].includes(k)) return 'track'
  if (['prix_variable', 'variable', 'variable_price', 'prix_var'].includes(k)) return 'variable'
  if (
    ['echange_carte', 'echange', 'card_cash_exchange', 'carte_especes', 'carte_esp'].includes(k)
  ) {
    return 'exchange'
  }
  return null
}

function parseBoolOuiNon(raw: string, defaultVal: boolean): boolean {
  const t = raw.trim()
  if (!t) return defaultVal
  const n = t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (['1', 'oui', 'o', 'true', 'yes', 'y'].includes(n)) return true
  if (['0', 'non', 'n', 'false', 'no'].includes(n)) return false
  return defaultVal
}

export function parseArticlesCsv(
  text: string,
  categories: CategoryConfig[],
  defaultCategoryId: string
): { rows: ArticleCsvRow[]; errors: string[] } {
  const errors: string[] = []
  const rows: ArticleCsvRow[] = []
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) {
    errors.push('Fichier vide.')
    return { rows, errors }
  }

  const headerCells = splitCsvLine(lines[0])
  const col: Record<string, number> = {}
  headerCells.forEach((cell, i) => {
    const hk = headerKey(cell)
    if (hk) col[hk] = i
  })

  const hasHeader = col.name !== undefined && col.price !== undefined
  const dataLines = hasHeader ? lines.slice(1) : lines
  const colMap = hasHeader
    ? col
    : ({
        name: 0,
        price: 1,
        category: 2,
        emoji: 3,
        track: 4,
        variable: 5,
        exchange: 6
      } as Record<string, number>)

  if (!hasHeader && dataLines.length > 0) {
    errors.push(
      'Aucun en-tête reconnu (colonnes nom + prix). Import positionnel : colonne 1 = nom, 2 = prix (€), 3 = catégorie (id ou libellé), 4 = emoji, 5 = suivi stock (oui/non).'
    )
  }

  const get = (line: string, key: string): string => {
    const cells = splitCsvLine(line)
    const i = colMap[key]
    if (i === undefined) return ''
    return (cells[i] ?? '').trim()
  }

  for (let li = 0; li < dataLines.length; li++) {
    const line = dataLines[li]
    const name = get(line, 'name')
    if (!name) {
      errors.push(`Ligne ${li + (hasHeader ? 2 : 1)} : nom vide.`)
      continue
    }
    const variablePrice = parseBoolOuiNon(get(line, 'variable'), false)
    const priceRaw = get(line, 'price').replace(/\s/g, '')
    let cents = 0
    if (variablePrice) {
      if (priceRaw) {
        const parsed = parseEurosToCents(priceRaw)
        if (parsed === null || parsed < 0) {
          errors.push(`Ligne ${li + (hasHeader ? 2 : 1)} : prix indicatif invalide « ${priceRaw} ».`)
          continue
        }
        cents = parsed
      }
    } else {
      const parsed = parseEurosToCents(priceRaw)
      if (parsed === null || parsed < 0) {
        errors.push(`Ligne ${li + (hasHeader ? 2 : 1)} : prix invalide « ${priceRaw} ».`)
        continue
      }
      cents = parsed
    }
    const catRaw = get(line, 'category')
    const category = resolveCategoryId(catRaw, categories, defaultCategoryId)
    const emojiRaw = get(line, 'emoji')
    const emoji = (emojiRaw || '📦').slice(0, 8)
    const trackRaw = get(line, 'track')
    const trackStock = trackRaw ? parseTrack(trackRaw) : false
    const cardCashExchange = parseBoolOuiNon(get(line, 'exchange'), false)
    rows.push({
      name,
      priceCents: cents,
      category,
      emoji,
      imageFile: null,
      trackStock,
      lowStockThreshold: null,
      variablePrice,
      cardCashExchange
    })
  }

  return { rows, errors }
}
