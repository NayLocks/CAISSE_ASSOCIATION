export interface CategoryConfig {
  id: string
  label: string
  short: string
}

export interface ProductConfig {
  id: string
  name: string
  priceCents: number
  /** Identifiant de catégorie (voir `categories`) */
  category: string
  /** Emoji affiché si aucune image personnalisée */
  emoji: string
  /** Fichier image dans userData (comme le logo), sinon null */
  imageFile: string | null
  trackStock: boolean
  /** Alerte à la caisse si stock ≤ seuil ; null = pas d’alerte. */
  lowStockThreshold: number | null
  /** Si true, le prix unitaire est demandé à chaque ajout au panier. */
  variablePrice?: boolean
  /**
   * Si true : article seul dans le panier, paiement carte obligatoire.
   * Comptabilité : crédit carte + retrait équivalent des espèces en caisse (échange carte / espèces).
   */
  cardCashExchange?: boolean
}

export interface AssociationConfig {
  name: string
  numero: string
  logoFile: string | null
  /**
   * Code 2–6 caractères (A–Z, 0–9) pour les **clés courtes** du module CAISSE_LICENCE.
   * Doit correspondre au code figurant dans la licence ; laisser vide si vous utilisez uniquement un jeton long (UUID).
   */
  licenseAssociationCode: string | null
  /** Siège / correspondance (affiche sur le ticket de caisse récap.) */
  legalAddress: string
  /** Numéro SIRET du siège ou de l’établissement émetteur (facultatif) */
  siret: string
  /**
   * Mentions TVA / régime fiscal ou tout texte légal pour le ticket (facultatif).
   * Vide sur le ticket = libellé « TVA non applicable — article 293 B du CGI. »
   */
  receiptLegalNote: string
  /**
   * Largeur du logo sur les tickets (% de la largeur utile du papier), 5–100.
   * S’applique au ticket unitaire et au ticket de caisse récapitulatif.
   */
  receiptLogoWidthPercent: number
  /**
   * Texte affiché dans le cadre gras (validité) sur chaque ticket unitaire.
   * Chaîne vide = aucun cadre imprimé.
   */
  unitTicketValidityNotice: string
  /** Logo en tête du ticket unitaire (HTML et ESC/POS). Défaut : afficher si un fichier logo est défini. */
  unitTicketShowLogo: boolean
  /** Date et heure en pied du ticket unitaire. Défaut : afficher. */
  unitTicketShowDateTime: boolean
  /** Nom de l’association en pied du ticket unitaire. Défaut : afficher. */
  unitTicketShowAssociationName: boolean
}

/** Affiché sur le ticket (et e-mails texte) si le champ « Mentions TVA » est vide. */
export const DEFAULT_TVA_MENTION_FR = 'TVA non applicable — article 293 B du CGI.'

/** Exemple de texte (placeholder UI) pour le cadre de validité sur les tickets unitaires. */
export const DEFAULT_UNIT_TICKET_VALIDITY_FR =
  "Ce ticket n'est valable que le jour où il a été acheté."

export function clampReceiptLogoWidthPercent(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 100
  return Math.max(5, Math.min(100, n))
}

export interface ReceiptLegalInfo {
  legalAddress: string
  siret: string
  numero: string
  /** Brut (peut être vide) ; utiliser `tvaMentionLines` pour l’affichage ticket. */
  receiptLegalNote: string
}

export function receiptLegalInfoFromAssociation(a: AssociationConfig): ReceiptLegalInfo {
  const note = typeof a.receiptLegalNote === 'string' ? a.receiptLegalNote.trim() : ''
  return {
    legalAddress: typeof a.legalAddress === 'string' ? a.legalAddress.trim() : '',
    siret: typeof a.siret === 'string' ? a.siret.trim() : '',
    numero: typeof a.numero === 'string' ? a.numero.trim() : '',
    receiptLegalNote: note
  }
}

/** Lignes de mentions TVA : texte saisi (plusieurs lignes possibles) ou défaut 293 B. */
export function tvaMentionLines(receiptLegalNote: string): string[] {
  const lines = receiptLegalNote
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length > 0) return lines
  return [DEFAULT_TVA_MENTION_FR]
}

/** Envoi automatique du ticket récapitulatif en PDF par SMTP (nodemailer côté process principal). */
export interface EmailReceiptConfig {
  enabled: boolean
  host: string
  port: number
  /** TLS direct (souvent port 465) ; sinon STARTTLS selon le serveur */
  secure: boolean
  user: string
  password: string
  /** Adresse expéditrice affichée (ex. tresorier@asso.fr) */
  fromAddress: string
}

export interface EventItem {
  id: string
  name: string
  date: string
  notes: string
  /** Si true, plus d’encaissement ni remboursement à la caisse pour cet événement */
  closed?: boolean
}

/**
 * Tickets unitaires : rendu HTML (Chromium, logo, mise en page actuelle) ou ESC/POS brut
 * (Windows RAW — plus rapide ; logo en bitmap raster si fourni).
 */
export type ThermalUnitTicketEngine = 'html_chromium' | 'escpos_raw'

/** Coupe en fin de ticket unitaire (commande ESC/POS `GS V`, mode ESC/POS brut uniquement). */
export type EscposPaperCutMode = 'partial' | 'full'

/** Largeur de papier pour le mode tickets ESC/POS brut (texte + logo raster). */
export type EscposPaperWidth = '58mm' | '80mm'

/** Largeur raster (points à ~203 dpi) pour une ligne complète. */
export function escposDotsPerLine(paper: EscposPaperWidth): number {
  return paper === '58mm' ? 384 : 576
}

/** Nombre de caractères « classiques » par ligne (retours à la ligne texte). */
export function escposCharsPerLine(paper: EscposPaperWidth): number {
  return paper === '58mm' ? 32 : 48
}

export interface PrintingConfig {
  /** Nom exact retourné par l’API imprimantes Windows */
  deviceName: string | null
  /** Un ticket par unité après chaque vente */
  autoPrintTickets: boolean
  /**
   * Si false, ouvre la boîte d’impression Windows (certains pilotes / redirecteurs
   * comme « SERVICE INFO » ne gèrent pas l’impression silencieuse).
   */
  silentPrint: boolean
  /**
   * Moteur pour les tickets **unitaires** uniquement (récap caisse / e-mail restent en HTML).
   * `escpos_raw` : Windows uniquement, job RAW ; commandes ESC/POS (texte + logo raster) calquées sur
   * le ticket HTML (ordre des blocs, polices A/B, encadré validité, `×`).
   */
  unitTicketEngine: ThermalUnitTicketEngine
  /**
   * Coupe papier après chaque ticket unitaire en mode **ESC/POS brut** (`GS V`).
   * `partial` = coupe partielle (souvent une languette) ; `full` = coupe totale (ticket détaché).
   */
  escposCutMode: EscposPaperCutMode
  /**
   * Largeur du rouleau pour l’alignement texte + logo raster en **ESC/POS brut**.
   * Choisir **58 mm** si les lignes débordent ou semblent trop petites sur un ticket étroit.
   */
  escposPaperWidth: EscposPaperWidth
  /**
   * Certains modèles (souvent clones ESC/POS) utilisent l’inverse d’Epson : `GS V 0` = partielle,
   * `GS V 1` = totale. Cocher si la coupe **totale** laisse encore une languette.
   * @see `escposPaperCut` (mode ESC/POS brut uniquement).
   */
  escposCutInverted: boolean
}

/** Code PIN (hash côté disque, jamais en clair). */
export interface SecurityConfig {
  pinSalt: string
  /** null = premier lancement, création du PIN obligatoire */
  pinHash: string | null
}

/** Session de caisse démarrée pour un événement (fond de caisse initial). */
export interface EventSessionInfo {
  floatCents: number
  startedAt: string
}

/** Connexion SumUp : code marchand, clé API, identifiant terminal — secrets jamais exposés au renderer. */
export interface SumUpIntegrationConfig {
  enabled: boolean
  /** Clé API SumUp (`Authorization: Bearer`) */
  apiKey: string
  /** Code marchand SumUp (`merchant_code`) */
  merchantCode: string
  /**
   * Identifiant lecteur terminal (`reader_id`, ex. `rdr_…`).
   * Vide = paiement carte en ligne uniquement (pas de terminal).
   */
  readerId: string
}

/** SumUp utilisable pour encaisser : option activée + clé API ; avec terminal, code marchand obligatoire. */
export function sumUpPaymentsReady(config: SumUpIntegrationConfig): boolean {
  if (!config.enabled || !config.apiKey.trim()) return false
  const rid = typeof config.readerId === 'string' ? config.readerId.trim() : ''
  if (rid.length > 0) return Boolean(config.merchantCode.trim())
  return true
}

export interface IntegrationsConfig {
  sumup: SumUpIntegrationConfig
}

/** Motif prédéfini pour les remises (ligne ou total), configurable dans Apparence. */
export interface DiscountMotifPreset {
  id: string
  /** Texte du motif (bouton et début du libellé enregistré). */
  label: string
  /**
   * Si true, une modale demande le commentaire avant application ; le motif enregistré est
   * « label — commentaire » (comme l’ancien motif bénévole + prénom).
   */
  commentRequired: boolean
  /** Libellé du champ commentaire dans la modale (ex. prénom, référence). */
  commentLabel: string
}

export const DISCOUNT_MOTIF_REASON_MAX = 200
/** Séparateur label / commentaire dans les motifs enregistrés (récap, etc.). */
export const DISCOUNT_MOTIF_REASON_SEP = ' — '

export function formatDiscountMotifReason(label: string, comment: string): string {
  const l = typeof label === 'string' ? label.trim() : ''
  const c = typeof comment === 'string' ? comment.trim() : ''
  if (!l && !c) return ''
  if (!c) return l.length > DISCOUNT_MOTIF_REASON_MAX ? l.slice(0, DISCOUNT_MOTIF_REASON_MAX) : l
  const full = `${l}${DISCOUNT_MOTIF_REASON_SEP}${c}`
  return full.length > DISCOUNT_MOTIF_REASON_MAX ? full.slice(0, DISCOUNT_MOTIF_REASON_MAX) : full
}

/** Découpe un motif enregistré pour affichage ticket unitaire (label et commentaire sur lignes séparées). */
export function splitDiscountMotifReason(reason: string | undefined | null): {
  label: string
  comment?: string
} {
  const t = typeof reason === 'string' ? reason.trim() : ''
  if (!t) return { label: '' }
  const i = t.indexOf(DISCOUNT_MOTIF_REASON_SEP)
  if (i === -1) return { label: t }
  const label = t.slice(0, i).trim()
  const comment = t.slice(i + DISCOUNT_MOTIF_REASON_SEP.length).trim()
  if (!comment) return { label: t }
  return { label, comment }
}

export const DEFAULT_DISCOUNT_MOTIFS: DiscountMotifPreset[] = [
  {
    id: 'preset-benevole',
    label: 'Bénévole',
    commentRequired: true,
    commentLabel: 'Prénom du bénévole'
  }
]

export function sanitizeDiscountMotifs(raw: unknown): DiscountMotifPreset[] {
  const fallback = (): DiscountMotifPreset[] => DEFAULT_DISCOUNT_MOTIFS.map((x) => ({ ...x }))
  if (!Array.isArray(raw)) return fallback()
  const out: DiscountMotifPreset[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (out.length >= 25) break
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim().slice(0, 64) : ''
    const label = typeof o.label === 'string' ? o.label.trim() : ''
    if (!id || !label) continue
    if (seen.has(id)) continue
    seen.add(id)
    const commentRequired = o.commentRequired === true
    const commentLabel =
      typeof o.commentLabel === 'string' && o.commentLabel.trim()
        ? o.commentLabel.trim().slice(0, 80)
        : 'Commentaire'
    out.push({
      id,
      label: label.slice(0, 120),
      commentRequired,
      commentLabel
    })
  }
  return out.length > 0 ? out : fallback()
}

export interface AppPersistedData {
  association: AssociationConfig
  events: EventItem[]
  categories: CategoryConfig[]
  products: ProductConfig[]
  integrations: IntegrationsConfig
  /** Stock par identifiant d’événement, puis par article */
  stockByEvent: Record<string, Record<string, number>>
  /** Articles désactivés pour un événement (non vendables à la caisse). */
  disabledProductsByEvent: Record<string, Record<string, true>>
  /** Session ouverte : fond de caisse enregistré pour pouvoir encaisser */
  eventSessions: Record<string, EventSessionInfo>
  selectedEventId: string | null
  printing: PrintingConfig
  security: SecurityConfig
  /** Dernier numéro de commande attribué (incrémenté à chaque vente) */
  orderCounter: number
  /**
   * Dossier (optionnel) où enregistrer les sauvegardes rapides pour cette association.
   * Les exports manuels peuvent aller ailleurs.
   */
  associationBackupPath: string | null
  /** Thème de l’écran affichage client (navigateur), poussé avec le panier */
  clientDisplayTheme: 'dark' | 'light'
  /**
   * Espèces dans la fenêtre de paiement : vignettes pièces/billets tout de suite, ou mise en avant de
   * l’encaisse « montant exact » avec détail désignatif sur demande (reste toujours possible en carte).
   */
  cashPaymentUi: 'detail' | 'express'
  /**
   * Pilotage caisse depuis une tablette (navigateur sur le même réseau).
   * Le jeton secret est transmis en en-tête Authorization ou dans l’URL de la page tablette.
   */
  remoteCaisseEnabled: boolean
  /**
   * Si true (défaut), chaque requête API exige le jeton. Si false, accès ouvert sur le réseau local
   * (déconseillé sauf réseau fermé / test).
   */
  remoteCaisseTokenRequired: boolean
  /** Jeton aléatoire (hex) ; null tant que non généré */
  remoteCaisseToken: string | null
  /** SMTP optionnel pour envoyer le ticket de caisse récapitulatif par e-mail */
  emailReceipt: EmailReceiptConfig
  /**
   * Révision locale alignée avec la dernière copie d’association sur le serveur (API association-sync-*).
   * Null si aucune synchro encore enregistrée sur ce fichier de données.
   */
  associationServerSnapshotRevision: number | null
  /** Motifs de remise proposés dans la fenêtre Remise (caisse et tablette). */
  discountMotifs: DiscountMotifPreset[]
  /** Sauvegarde automatique quotidienne vers `associationBackupPath`. */
  autoBackupEnabled: boolean
  /** Dernière exécution réussie (YYYY-MM-DD, heure locale). */
  autoBackupLastRunDate: string | null
  /** Vérification périodique `association-sync-check` (bandeau + alertes). */
  associationSyncAutoCheckEnabled: boolean
  /** Intervalle entre deux vérifications automatiques (secondes). */
  associationSyncAutoCheckIntervalSec: number
  /**
   * PIN utilisé pour envoi / réception auto (si un PIN caisse est défini).
   * Stocké sur ce poste uniquement — requis pour la synchro auto avec PIN.
   */
  associationSyncAutoPin: string | null
}

export const ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MIN_SEC = 3
export const ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MAX_SEC = 3600
export const ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_DEFAULT_SEC = 30

export function sanitizeAssociationSyncAutoCheckIntervalSec(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_DEFAULT_SEC
  return Math.min(
    ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MAX_SEC,
    Math.max(ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_MIN_SEC, Math.floor(n))
  )
}

/** Catégories par défaut (identifiants stables pour migration) */
export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'boissons', label: 'Boissons', short: '🥤' },
  { id: 'repas', label: 'Repas & sandwichs', short: '🥪' },
  { id: 'dessert', label: 'Desserts', short: '🧇' }
]

export const SEED_PRODUCTS: ProductConfig[] = [
  { id: 'cafe', name: 'Café', priceCents: 150, category: 'boissons', emoji: '☕', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'choco', name: 'Chocolat chaud', priceCents: 250, category: 'boissons', emoji: '🍫', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'the', name: 'Thé', priceCents: 150, category: 'boissons', emoji: '🫖', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'eau', name: 'Eau 50cl', priceCents: 200, category: 'boissons', emoji: '💧', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'soda', name: 'Soda 33cl', priceCents: 300, category: 'boissons', emoji: '🥤', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'jus', name: 'Jus de fruit', priceCents: 280, category: 'boissons', emoji: '🧃', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'biere', name: 'Bière 50cl', priceCents: 450, category: 'boissons', emoji: '🍺', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'vin', name: 'Vin (verre)', priceCents: 400, category: 'boissons', emoji: '🍷', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'cidre', name: 'Cidre 33cl', priceCents: 400, category: 'boissons', emoji: '🍎', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'sandwich', name: 'Sandwich', priceCents: 450, category: 'repas', emoji: '🥪', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'barre', name: 'Barre céréales', priceCents: 150, category: 'repas', emoji: '🍫', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'chips', name: 'Chips', priceCents: 200, category: 'repas', emoji: '🥔', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'gaufre', name: 'Gaufre', priceCents: 250, category: 'dessert', emoji: '🧇', imageFile: null, trackStock: false, lowStockThreshold: null },
  { id: 'crepe', name: 'Crêpe', priceCents: 300, category: 'dessert', emoji: '🥞', imageFile: null, trackStock: false, lowStockThreshold: null }
]

export function defaultPersistedData(): AppPersistedData {
  return {
    association: {
      name: '',
      numero: '',
      logoFile: null,
      licenseAssociationCode: null,
      legalAddress: '',
      siret: '',
      receiptLegalNote: '',
      receiptLogoWidthPercent: 100,
      unitTicketValidityNotice: '',
      unitTicketShowLogo: true,
      unitTicketShowDateTime: true,
      unitTicketShowAssociationName: true
    },
    events: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    products: SEED_PRODUCTS.map((p) => ({ ...p })),
    integrations: {
      sumup: {
        enabled: false,
        apiKey: '',
        merchantCode: '',
        readerId: ''
      }
    },
    stockByEvent: {},
    disabledProductsByEvent: {},
    eventSessions: {},
    selectedEventId: null,
    printing: {
      deviceName: null,
      autoPrintTickets: false,
      silentPrint: true,
      unitTicketEngine: 'html_chromium',
      escposCutMode: 'partial',
      escposPaperWidth: '80mm',
      escposCutInverted: false
    },
    security: { pinSalt: '', pinHash: null },
    orderCounter: 0,
    associationBackupPath: null,
    clientDisplayTheme: 'light',
    cashPaymentUi: 'detail',
    remoteCaisseEnabled: false,
    remoteCaisseTokenRequired: true,
    remoteCaisseToken: null,
    emailReceipt: {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      fromAddress: ''
    },
    associationServerSnapshotRevision: null,
    discountMotifs: sanitizeDiscountMotifs(null),
    autoBackupEnabled: false,
    autoBackupLastRunDate: null,
    associationSyncAutoCheckEnabled: true,
    associationSyncAutoCheckIntervalSec: ASSOCIATION_SYNC_AUTO_CHECK_INTERVAL_DEFAULT_SEC,
    associationSyncAutoPin: null
  }
}

const FACTORY_RESET_CATEGORY_ID = 'general'

/** Après « Réinitialisation » dans Association : une seule catégorie et un seul article. */
export function factoryResetPersistedData(): AppPersistedData {
  const d = defaultPersistedData()
  return {
    ...d,
    associationBackupPath: null,
    clientDisplayTheme: 'light',
    remoteCaisseEnabled: false,
    remoteCaisseTokenRequired: true,
    remoteCaisseToken: null,
    categories: [{ id: FACTORY_RESET_CATEGORY_ID, label: 'Général', short: '📦' }],
    products: [
      {
        id: 'article-1',
        name: 'Article',
        priceCents: 100,
        category: FACTORY_RESET_CATEGORY_ID,
        emoji: '🛒',
        imageFile: null,
        trackStock: false,
        lowStockThreshold: null
      }
    ]
  }
}

/**
 * Même contenu métier que `factoryResetPersistedData`, mais conserve l’identité licence
 * (nom, numéro, code association) pour ne réinitialiser que cette caisse sur le poste.
 */
export function factoryResetPersistedDataPreservingAssociationIdentity(
  current: AppPersistedData
): AppPersistedData {
  const fresh = factoryResetPersistedData()
  return {
    ...fresh,
    association: {
      ...fresh.association,
      name: current.association.name,
      numero: current.association.numero,
      licenseAssociationCode: current.association.licenseAssociationCode,
      legalAddress: current.association.legalAddress ?? '',
      siret: current.association.siret ?? '',
      receiptLegalNote: current.association.receiptLegalNote ?? '',
      receiptLogoWidthPercent: clampReceiptLogoWidthPercent(current.association.receiptLogoWidthPercent),
      unitTicketValidityNotice:
        typeof current.association.unitTicketValidityNotice === 'string'
          ? current.association.unitTicketValidityNotice
          : '',
      unitTicketShowLogo:
        typeof current.association.unitTicketShowLogo === 'boolean'
          ? current.association.unitTicketShowLogo
          : fresh.association.unitTicketShowLogo,
      unitTicketShowDateTime:
        typeof current.association.unitTicketShowDateTime === 'boolean'
          ? current.association.unitTicketShowDateTime
          : fresh.association.unitTicketShowDateTime,
      unitTicketShowAssociationName:
        typeof current.association.unitTicketShowAssociationName === 'boolean'
          ? current.association.unitTicketShowAssociationName
          : fresh.association.unitTicketShowAssociationName
    },
    associationServerSnapshotRevision:
      typeof current.associationServerSnapshotRevision === 'number'
        ? current.associationServerSnapshotRevision
        : null
  }
}
