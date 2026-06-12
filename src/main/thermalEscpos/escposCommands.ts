import { escposSafeText, wrapEscposLines, ESCPOS_DEFAULT_LINE_CHARS } from './escposText.js'

const ESC = 0x1b
const GS = 0x1d

export function escposInit(): Buffer {
  return Buffer.from([ESC, 0x40])
}

export function escposAlignLeft(): Buffer {
  return Buffer.from([ESC, 0x61, 0])
}

export function escposAlignCenter(): Buffer {
  return Buffer.from([ESC, 0x61, 1])
}

export function escposBold(on: boolean): Buffer {
  return Buffer.from([ESC, 0x45, on ? 1 : 0])
}

/** Police A (12×24 typ.), corps du ticket HTML. */
export function escposSelectFontA(): Buffer {
  return Buffer.from([ESC, 0x4d, 0])
}

/** Police B (9×17 typ.), proche des 7–8 pt du pied date / numéro de commande. */
export function escposSelectFontB(): Buffer {
  return Buffer.from([ESC, 0x4d, 1])
}

/** Taille double hauteur + largeur (titre). */
export function escposSizeDouble(): Buffer {
  return Buffer.from([GS, 0x21, 0x11])
}

/** Double hauteur seulement (plus proche du rendu HTML du libellé article). */
export function escposSizeDoubleHeight(): Buffer {
  return Buffer.from([GS, 0x21, 0x01])
}

export function escposSizeNormal(): Buffer {
  return Buffer.from([GS, 0x21, 0])
}

export function escposFeed(n = 1): Buffer {
  const k = Math.min(255, Math.max(1, n))
  return Buffer.from([ESC, 0x64, k])
}

/** Coupe ESC/POS `GS V` : par défaut forme « avance + coupe » (Epson m=65/66) ; si `inverted`,
 * codes simples inversés (clones où 0 = partielle, 1 = totale). */
export function escposPaperCut(mode: 'partial' | 'full', inverted = false): Buffer {
  if (inverted) {
    return mode === 'full' ? Buffer.from([GS, 0x56, 0x01]) : Buffer.from([GS, 0x56, 0x00])
  }
  /* Epson fonction B : avance jusqu’à la position de coupe puis coupe (souvent plus net qu’un `GS V 0` seul). */
  return mode === 'full'
    ? Buffer.from([GS, 0x56, 0x41, 0x00])
    : Buffer.from([GS, 0x56, 0x42, 0x00])
}

/** Coupe partielle (languette). @see escposPaperCut */
export function escposCutPartial(): Buffer {
  return escposPaperCut('partial', false)
}

export function escposLine(s: string, maxChars = ESCPOS_DEFAULT_LINE_CHARS): Buffer {
  const parts = wrapEscposLines(s, maxChars)
  return Buffer.from(parts.join('\n') + '\n', 'latin1')
}

export function escposDashRule(maxChars = ESCPOS_DEFAULT_LINE_CHARS): Buffer {
  return Buffer.from(`${'-'.repeat(maxChars)}\n`, 'latin1')
}

/** Largeur des traits / cadres du ticket unitaire (nombre de tirets horizontaux). */
export const ESCPOS_UNIT_TICKET_FRAME_DASHES = 40
/** Trait court : à imprimer avec `escposAlignCenter()` actif (pas de padding manuel). */
export function escposCenteredRule(
  maxChars = ESCPOS_DEFAULT_LINE_CHARS,
  ruleLen = ESCPOS_UNIT_TICKET_FRAME_DASHES
): Buffer {
  const len = Math.min(Math.max(8, ruleLen), maxChars)
  return Buffer.from(`${'-'.repeat(len)}\n`, 'latin1')
}

export function concatBuffers(chunks: Buffer[]): Buffer {
  return Buffer.concat(chunks)
}

export function escposTextBlock(s: string, maxChars = ESCPOS_DEFAULT_LINE_CHARS): Buffer {
  return escposLine(escposSafeText(s), maxChars)
}

/**
 * Bloc encadré type « validité » HTML (bordure 1 px) : lignes ASCII + / -.
 * À imprimer avec `escposAlignCenter()` actif. Chaîne vide si aucune ligne utile.
 */
export function escposBoxedNotice(
  text: string,
  maxChars = ESCPOS_DEFAULT_LINE_CHARS,
  frameDashes = ESCPOS_UNIT_TICKET_FRAME_DASHES
): Buffer {
  const innerW = Math.min(Math.max(8, frameDashes), maxChars - 2)
  const rows: string[] = []
  for (const para of text.split(/\r?\n/)) {
    const p = para.trim()
    if (!p) continue
    rows.push(...wrapEscposLines(escposSafeText(p), innerW))
  }
  if (rows.length === 0) return Buffer.alloc(0)
  const horiz = '-'.repeat(innerW)
  const parts: string[] = []
  parts.push(`+${horiz}+`)
  for (const r of rows) {
    const inner = r.length >= innerW ? r.slice(0, innerW) : padCenterInField(r, innerW)
    parts.push(`|${inner}|`)
  }
  parts.push(`+${horiz}+`)
  return Buffer.from(`${parts.join('\n')}\n`, 'latin1')
}

/** Centre `texte` dans une largeur fixe (espaces de part et d’autre). */
function padCenterInField(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  const pad = width - text.length
  const left = Math.floor(pad / 2)
  return `${' '.repeat(left)}${text}${' '.repeat(pad - left)}`
}
