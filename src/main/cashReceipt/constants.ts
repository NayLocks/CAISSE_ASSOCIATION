/** Largeur ticket thermique (CSS + pageSize print Chromium) */
export const RECEIPT_TICKET_WIDTH_MM = 70

/** Largeur fenêtre Chromium pour mise en page ticket (≈ 96 CSS px / pouce). */
export const RECEIPT_WINDOW_WIDTH_PX = Math.round((RECEIPT_TICKET_WIDTH_MM * 96) / 25.4)

/** ID du conteneur mesuré pour la hauteur de page (une seule zone de vérité) */
export const RECEIPT_DOCUMENT_ROOT_ID = 'receipt-doc'

/**
 * Récap thermique : nombre max de lignes article par job d’impression.
 * Des pages extrêmement hautes font souvent planter le spouleur Windows / pilotes USB thermiques.
 */
export const SUMMARY_RECEIPT_LINES_PER_PRINT_CHUNK = 10
