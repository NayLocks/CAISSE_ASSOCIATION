/** Largeur utile ~80 mm, police simple (MUNBYN ITPP047 / ESC/POS standard). */
export const ESCPOS_DEFAULT_LINE_CHARS = 48

const REPLACEMENTS: Record<string, string> = {
  œ: 'oe',
  Œ: 'OE',
  æ: 'ae',
  Æ: 'AE',
  '€': 'EUR',
  '’': "'",
  '‘': "'",
  '«': '"',
  '»': '"',
  '…': '...',
  '–': '-',
  '—': '-'
}

/** Texte compatible imprimante thermique (pas d’UTF-8 ESC/POS dans ce module v1). */
export function escposSafeText(s: string): string {
  let t = s.normalize('NFD').replace(/\p{M}/gu, '')
  for (const [k, v] of Object.entries(REPLACEMENTS)) {
    t = t.split(k).join(v)
  }
  let out = ''
  for (const ch of t) {
    const cp = ch.codePointAt(0)!
    if (cp === 9 || cp === 10 || cp === 13) out += ch
    else if (cp >= 32 && cp <= 126) out += ch
    /** Latin-1 imprimable (×, lettres accentuées natives si présentes après NFD). */
    else if (cp >= 0xa0 && cp <= 0xff) out += ch
    else out += '?'
  }
  return out
}

export function wrapEscposLines(text: string, maxChars: number): string[] {
  const safe = escposSafeText(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const out: string[] = []
  for (const paragraph of safe.split('\n')) {
    let rest = paragraph.trimEnd()
    while (rest.length > 0) {
      if (rest.length <= maxChars) {
        out.push(rest)
        break
      }
      let chunk = rest.slice(0, maxChars)
      const sp = chunk.lastIndexOf(' ')
      if (sp > maxChars * 0.55) chunk = chunk.slice(0, sp)
      out.push(chunk.trimEnd())
      rest = rest.slice(chunk.length).trimStart()
    }
  }
  return out
}
