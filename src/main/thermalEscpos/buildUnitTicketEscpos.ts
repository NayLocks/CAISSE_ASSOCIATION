import { splitDiscountMotifReason } from '../../shared/catalog.js'
import type { EscposPaperCutMode, EscposPaperWidth } from '../../shared/catalog.js'
import { escposCharsPerLine, escposDotsPerLine } from '../../shared/catalog.js'
import type { TicketUnitPayload } from '../../shared/ticket.js'
import { shouldShowDiscountMotifOnUnitTicket } from '../../shared/ticket.js'
import { formatOrderNo } from '../cashReceipt/formatting.js'
import type { UnitTicketsDocumentOptions } from '../cashReceipt/receiptDocuments.js'
import {
  concatBuffers,
  escposAlignCenter,
  escposAlignLeft,
  escposBold,
  escposBoxedNotice,
  escposCenteredRule,
  escposFeed,
  escposInit,
  escposLine,
  escposPaperCut,
  escposSelectFontA,
  escposSizeDouble,
  escposSizeDoubleHeight,
  escposSizeNormal
} from './escposCommands.js'
import { escposRasterLogoFromDataUrl } from './escposRasterLogo.js'
import { escposSafeText, wrapEscposLines } from './escposText.js'

export type UnitTicketEscposBuildOptions = UnitTicketsDocumentOptions & {
  escposCutMode?: EscposPaperCutMode
  escposPaperWidth?: EscposPaperWidth
  logoDataUrl?: string | null
  /** Clones ESC/POS : 0 = partielle, 1 = totale (inverse du comportement Epson standard). */
  escposCutInverted?: boolean
}

function orderLineText(orderNumber: number): string {
  if (orderNumber === 0) return "Essai d'impression"
  if (orderNumber < 0) return 'Commande (vente archivée)'
  return formatOrderNo(orderNumber)
}

/** Proche du bloc `.unit-motif` HTML : centré, gras ; label et commentaire sur lignes séparées. */
function escposMotifBlock(text: string, w: number): Buffer {
  const { label, comment } = splitDiscountMotifReason(text)
  const lines: string[] = []
  if (label) lines.push(...wrapEscposLines(escposSafeText(label), w))
  if (comment) lines.push(...wrapEscposLines(escposSafeText(comment), w))
  if (lines.length === 0) return Buffer.alloc(0)
  const chunks: Buffer[] = [escposSelectFontA(), escposAlignCenter(), escposBold(true)]
  for (const L of lines) {
    chunks.push(Buffer.from(`${L}\n`, 'latin1'))
  }
  chunks.push(escposBold(false))
  return concatBuffers(chunks)
}

/**
 * Ticket unitaire en commandes ESC/POS (sans capture HTML) : ordre et hiérarchie alignés sur
 * `buildTicketsDocument` — logo raster un peu plus grand ; police **A** partout (pas de police B) ;
 * double **hauteur** pour la ligne commande ; **double largeur + hauteur** pour « 1 x … » ;
 * **Espacement** : un saut de ligne (`ESC d 1`) entre les blocs principaux ; date et heure sur deux lignes.
 */
export function buildUnitTicketEscposBuffer(
  t: TicketUnitPayload,
  options?: UnitTicketEscposBuildOptions
): Buffer {
  const paper: EscposPaperWidth = options?.escposPaperWidth === '58mm' ? '58mm' : '80mm'
  const w = escposCharsPerLine(paper)
  const dots = escposDotsPerLine(paper)
  const logoPct = options?.logoWidthPercent
  const showLogo = options?.unitTicketShowLogo !== false
  const logoRaster = showLogo
    ? escposRasterLogoFromDataUrl(options?.logoDataUrl, {
        dotsPerLine: dots,
        logoWidthPercent:
          typeof logoPct === 'number' && Number.isFinite(logoPct)
            ? Math.max(5, Math.min(100, Math.round(logoPct)))
            : 100,
        logoWidthScale: 1.12,
        maxHeightDots: Math.round(dots * 0.45)
      })
    : Buffer.alloc(0)
  const cutMode: 'partial' | 'full' = options?.escposCutMode === 'full' ? 'full' : 'partial'
  const cutInverted = options?.escposCutInverted === true
  const dt = new Date(t.atIso)
  const dateLong = dt.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const timeShort = dt.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const rawValidity =
    typeof options?.validityNotice === 'string' ? options.validityNotice.trim() : ''

  const dr = typeof t.discountReason === 'string' ? t.discountReason.trim() : ''
  const lineMotifBuf =
    dr && shouldShowDiscountMotifOnUnitTicket(dr) ? escposMotifBlock(dr, w) : Buffer.alloc(0)

  const cartCr = typeof t.cartDiscountReason === 'string' ? t.cartDiscountReason.trim() : ''
  const cartMotifBuf = cartCr.length > 0 ? escposMotifBlock(cartCr, w) : Buffer.alloc(0)

  const validityChunks: Buffer[] = []
  if (rawValidity.length > 0) {
    const box = escposBoxedNotice(rawValidity, w)
    if (box.length > 0) {
      validityChunks.push(escposSelectFontA(), escposAlignCenter(), escposBold(true), box, escposBold(false))
    }
  }

  const qtyLine = `1 x ${t.productName}`.trim()
  const qtySafe = escposSafeText(qtyLine)

  const logoChunks: Buffer[] = logoRaster.length > 0 ? [logoRaster] : []

  const hasLineMotif = lineMotifBuf.length > 0
  const hasCartMotif = cartMotifBuf.length > 0
  const hasValidity = validityChunks.length > 0
  const asso = t.associationName.trim()
  const showAssoFooter = options?.unitTicketShowAssociationName !== false && asso.length > 0
  const showDateFooter = options?.unitTicketShowDateTime !== false
  const hasFooterBlock = showAssoFooter || showDateFooter
  /** En double largeur+hauteur, environ la moitié de caractères par ligne visuelle. */
  const qtyLineChars = Math.max(8, Math.floor(w / 2))

  return concatBuffers([
    escposInit(),
    escposSelectFontA(),
    escposAlignCenter(),
    ...logoChunks,
    escposFeed(1),
    /** Ligne commande : double hauteur + gras (police A). */
    escposSizeDoubleHeight(),
    escposBold(true),
    escposLine(orderLineText(t.orderNumber), w),
    escposBold(false),
    escposSizeNormal(),
    escposSelectFontA(),
    escposFeed(1),
    /** Événement */
    escposSelectFontA(),
    escposBold(true),
    escposLine(t.eventName.trim(), w),
    escposBold(false),
    escposFeed(1),
    /** « 1 x … » : double largeur + double hauteur (plus lisible). */
    escposSelectFontA(),
    escposSizeDouble(),
    escposBold(true),
    escposLine(qtySafe, qtyLineChars),
    escposBold(false),
    escposSizeNormal(),
    escposSelectFontA(),
    escposFeed(1),
    lineMotifBuf,
    ...(hasLineMotif && hasCartMotif ? [escposFeed(1)] : []),
    cartMotifBuf,
    ...((hasLineMotif || hasCartMotif) && hasValidity ? [escposFeed(1)] : []),
    ...validityChunks,
    ...(!(hasValidity && hasFooterBlock) ? [escposFeed(1)] : []),
    ...(hasFooterBlock
      ? [
          escposSelectFontA(),
          escposAlignCenter(),
          escposCenteredRule(w),
          escposFeed(1),
          ...(showAssoFooter
            ? [
                escposSelectFontA(),
                escposBold(true),
                escposLine(asso, w),
                escposBold(false),
                escposFeed(1)
              ]
            : []),
          ...(showDateFooter
            ? [
                escposSelectFontA(),
                escposLine(escposSafeText(dateLong), w),
                escposLine(escposSafeText(timeShort), w)
              ]
            : [])
        ]
      : []),
    escposAlignLeft(),
    escposFeed(6),
    escposPaperCut(cutMode, cutInverted)
  ])
}
