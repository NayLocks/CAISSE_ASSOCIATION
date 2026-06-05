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
  /** Motif remise ligne (affiché sur le ticket unitaire si non vide). */
  discountReason?: string
  /** Remise globale panier (%). Non imprimé sur le ticket unitaire (seul le motif texte l’est). */
  cartDiscountPercent?: number
  /** Motif remise globale : affiché seul sur le ticket unitaire, en grand, sans montant ni %. */
  cartDiscountReason?: string
}

/** Vrai si le motif de ligne doit être imprimé sur le ticket unitaire (= texte non vide). */
export function shouldShowDiscountMotifOnUnitTicket(reason: string | undefined | null): boolean {
  const t = typeof reason === 'string' ? reason.trim() : ''
  return t.length > 0
}

/** Remise globale avec mention bénévole → à répercuter sur chaque ticket unitaire. */
export function cartGlobalReasonIsBenevole(reason: string | undefined | null): boolean {
  const t = typeof reason === 'string' ? reason.trim() : ''
  if (!t) return false
  const folded = t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  return folded.includes('benevole')
}
