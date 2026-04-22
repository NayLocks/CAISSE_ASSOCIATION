/** État miroir caisse (synchro PC ↔ tablette). */
export type RemoteCaisseMirror = {
  quantities: Record<string, number>
  refundMode: boolean
  refundMaxByProduct: Record<string, number> | null
  refundSourceMeta: { saleId: string; orderNumber?: number } | null
  /** Prix unitaire de base TTC avant remise (absent = prix catalogue). */
  priceOverrides: Record<string, number>
  /** Remise en % (0–100) sur le prix de base, par article. */
  lineDiscountPct: Record<string, number>
  /** Motif de la remise (texte libre), par article. */
  lineDiscountReason: Record<string, string>
  /** Remise en % sur le sous-total panier (somme des lignes nettes), 0–100. */
  cartDiscountPct?: number
  /** Motif de la remise sur le total. */
  cartDiscountReason?: string
}
