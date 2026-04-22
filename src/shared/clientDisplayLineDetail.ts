/** Libellés remises pour l’écran client (alignés sur le ticket de caisse HTML). */

export function formatMoneyFrCents(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

/** Lignes de détail sous une ligne panier : montants avant/après, %, motif. */
export function buildClientLineDetailLines(p: {
  qty: number
  unitCents: number
  listUnitCents: number
  discountPercent: number
  discountReason: string
}): string[] {
  const pct = Math.min(100, Math.max(0, Math.round(p.discountPercent ?? 0)))
  const listU = Number.isFinite(p.listUnitCents) ? p.listUnitCents : p.unitCents
  const avant = listU * p.qty
  const apres = p.unitCents * p.qty
  const out: string[] = []
  if (pct > 0 || avant !== apres) {
    out.push(
      `Sans remise ligne : ${formatMoneyFrCents(avant)} — Avec remise : ${formatMoneyFrCents(apres)}`
    )
  }
  if (pct > 0) out.push(`Remise ${pct} %`)
  const reason = typeof p.discountReason === 'string' ? p.discountReason.trim() : ''
  if (reason) out.push(reason)
  return out
}
