/** État affiché sur l’écran client (navigateur), synchronisé avec la caisse */

/** `live` = données caisse ; `closed` = appli verrouillée / PIN ; `disconnected` = coupé depuis la caisse */
export type ClientDisplayMode = 'live' | 'closed' | 'disconnected'

export type ClientDisplayPhase = 'welcome' | 'cart' | 'payment' | 'thanks'

export interface ClientDisplayLine {
  emoji: string
  name: string
  qty: number
  unitCents: number
  lineTotalCents: number
  /** Détail remise / prix (affichage client). */
  lineNote?: string
  /** Détail remise par ligne (montants, %, motif), comme ticket de caisse. */
  lineDetailLines?: string[]
}

/** Résumé remise globale sur l’écran client (comme bloc ticket de caisse). */
export interface ClientDisplayCartDiscountSummary {
  linesSubtotalCents: number
  discountAmountCents: number
  percent?: number
  reason?: string
}

/** Détail affiché pendant la fenêtre de paiement (modal caisse) */
export type ClientPaymentDetail =
  | {
      kind: 'choose'
      totalCents: number
      refundMode: boolean
    }
  | {
      kind: 'cash'
      totalCents: number
      refundMode: boolean
      cashGivenCents: number
      changeCents: number
      shortCents: number
      canValidateCash: boolean
      canMixed: boolean
    }
  | {
      kind: 'card'
      /** Total commande (toujours le montant panier) */
      totalCents: number
      /**
       * Montant débité sur carte : complément après espèces en paiement mixte ;
       * sinon égal au total — pour l’affichage client (reste à payer carte).
       */
      cardChargeCents?: number
      refundMode: boolean
      sumupPhase: 'idle' | 'creating' | 'waiting' | 'error'
      /** SumUp configuré (flux API / terminal) */
      sumupActive: boolean
      /** Envoi automatique au terminal Solo */
      terminalAuto: boolean
    }

export interface ClientDisplayState {
  associationName: string
  associationNumero?: string
  /** Présent sur les réponses API ; `live` = contenu ci-dessous actif */
  mode?: ClientDisplayMode
  eventName: string | null
  refundMode: boolean
  phase: ClientDisplayPhase
  lines: ClientDisplayLine[]
  totalCents: number
  /** Sous-total lignes, montant remise globale, motif (si remise panier). */
  cartDiscountSummary?: ClientDisplayCartDiscountSummary | null
  /** Présent uniquement si phase === 'payment' */
  paymentDetail?: ClientPaymentDetail | null
  thanksTitle?: string
  thanksDetail?: string
  orderNumberLabel?: string | null
  logoDataUrl?: string | null
  /** Thème poussé par la caisse (menu Apparence) */
  clientUiTheme?: 'dark' | 'light'
}

export function defaultClientDisplayState(): ClientDisplayState {
  return {
    associationName: '',
    eventName: null,
    refundMode: false,
    phase: 'welcome',
    lines: [],
    totalCents: 0
  }
}
