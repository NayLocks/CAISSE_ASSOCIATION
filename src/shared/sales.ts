export interface SaleLineSnapshot {
  productId: string
  name: string
  emoji: string
  qty: number
  /** Prix unitaire net encaissé (après remise). */
  unitCents: number
  lineTotalCents: number
  /** Prix unitaire avant remise (barème / saisi) ; absent sur anciennes ventes (= unitCents). */
  listUnitCents?: number
  /** Remise en % sur listUnitCents ; absent si 0. */
  discountPercent?: number
  /** Motif remise (ex. bénévole) ; absent si vide. */
  discountReason?: string
}

export interface SalePayment {
  mode: 'cash' | 'card' | 'mixed'
  cashCents: number
  cardCents: number
  /** Monnaie rendue (espèces uniquement si donné ≥ total ou complément carte exact) */
  changeCents: number
}

export interface SaleRecord {
  id: string
  at: string
  /** Numéro de commande affiché sur les tickets (séquentiel) — absent sur les ventes anciennes */
  orderNumber?: number
  /** `refund` = remboursement client (réintègre le stock si suivi) ; absent = vente */
  kind?: 'sale' | 'refund'
  /** Remboursement partiel / total lié à une vente d’origine */
  refundSourceSaleId?: string
  refundSourceOrderNumber?: number
  eventId: string
  eventName: string
  /** Date événement (snapshot) ; mise à jour si l’événement est modifié dans l’app. */
  eventDate?: string
  /** Notes événement (snapshot) ; idem. */
  eventNotes?: string
  associationName: string
  lines: SaleLineSnapshot[]
  totalCents: number
  payment: SalePayment
  /** Remise en % sur le sous-total (après remises lignes). */
  cartDiscountPercent?: number
  /** Motif de la remise sur le total. */
  cartDiscountReason?: string
}
