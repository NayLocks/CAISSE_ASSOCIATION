/** Une unité vendue = un ticket imprimé */
export interface TicketUnitPayload {
  /** Même numéro pour tous les tickets d’une même commande */
  orderNumber: number
  emoji: string
  productName: string
  unitPriceCents: number
  eventName: string
  associationName: string
  atIso: string
  /** Motif remise ligne (affiché sur le ticket unitaire seulement si pertinent — voir `shouldShowDiscountMotifOnUnitTicket`). */
  discountReason?: string
  /** Remise globale panier (pour affichage sur chaque ticket unitaire si motif bénévole). */
  cartDiscountPercent?: number
  /** Motif remise globale (ex. Bénévole — …). */
  cartDiscountReason?: string
}

/**
 * Ticket unitaire : n’affiche le motif que s’il contient « bénévole » ou le mot « motif »
 * (évite d’imprimer toutes les remises courtes sur chaque ticket).
 */
export function shouldShowDiscountMotifOnUnitTicket(reason: string | undefined | null): boolean {
  const t = typeof reason === 'string' ? reason.trim() : ''
  if (!t) return false
  const folded = t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  if (folded.includes('benevole')) return true
  return /\bmotif\b/i.test(t)
}

/** Remise globale avec mention bénévole → à répercuter sur chaque ticket unitaire. */
export function cartGlobalReasonIsBenevole(reason: string | undefined | null): boolean {
  const t = typeof reason === 'string' ? reason.trim() : ''
  if (!t) return false
  const folded = t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return folded.includes('benevole')
}
