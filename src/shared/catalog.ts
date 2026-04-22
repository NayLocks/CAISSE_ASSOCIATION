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
}

/** Affiché sur le ticket (et e-mails texte) si le champ « Mentions TVA » est vide. */
export const DEFAULT_TVA_MENTION_FR = 'TVA non applicable — article 293 B du CGI.'

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

export interface AppPersistedData {
  association: AssociationConfig
  events: EventItem[]
  categories: CategoryConfig[]
  products: ProductConfig[]
  integrations: IntegrationsConfig
  /** Stock par identifiant d’événement, puis par article */
  stockByEvent: Record<string, Record<string, number>>
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
   * Pilotage caisse depuis une tablette (navigateur sur le même réseau).
   * Le jeton secret est transmis en en-tête Authorization ou dans l’URL de la page tablette.
   */
  remoteCaisseEnabled: boolean
  /** Jeton aléatoire (hex) ; null tant que non généré */
  remoteCaisseToken: string | null
  /** SMTP optionnel pour envoyer le ticket de caisse récapitulatif par e-mail */
  emailReceipt: EmailReceiptConfig
}

/** Catégories par défaut (identifiants stables pour migration) */
export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'boissons', label: 'Boissons', short: '🥤' },
  { id: 'repas', label: 'Repas & sandwichs', short: '🥪' },
  { id: 'dessert', label: 'Desserts', short: '🧇' }
]

export const SEED_PRODUCTS: ProductConfig[] = [
  { id: 'cafe', name: 'Café', priceCents: 150, category: 'boissons', emoji: '☕', imageFile: null, trackStock: false },
  { id: 'choco', name: 'Chocolat chaud', priceCents: 250, category: 'boissons', emoji: '🍫', imageFile: null, trackStock: false },
  { id: 'the', name: 'Thé', priceCents: 150, category: 'boissons', emoji: '🫖', imageFile: null, trackStock: false },
  { id: 'eau', name: 'Eau 50cl', priceCents: 200, category: 'boissons', emoji: '💧', imageFile: null, trackStock: false },
  { id: 'soda', name: 'Soda 33cl', priceCents: 300, category: 'boissons', emoji: '🥤', imageFile: null, trackStock: false },
  { id: 'jus', name: 'Jus de fruit', priceCents: 280, category: 'boissons', emoji: '🧃', imageFile: null, trackStock: false },
  { id: 'biere', name: 'Bière 50cl', priceCents: 450, category: 'boissons', emoji: '🍺', imageFile: null, trackStock: false },
  { id: 'vin', name: 'Vin (verre)', priceCents: 400, category: 'boissons', emoji: '🍷', imageFile: null, trackStock: false },
  { id: 'cidre', name: 'Cidre 33cl', priceCents: 400, category: 'boissons', emoji: '🍎', imageFile: null, trackStock: false },
  { id: 'sandwich', name: 'Sandwich', priceCents: 450, category: 'repas', emoji: '🥪', imageFile: null, trackStock: false },
  { id: 'barre', name: 'Barre céréales', priceCents: 150, category: 'repas', emoji: '🍫', imageFile: null, trackStock: false },
  { id: 'chips', name: 'Chips', priceCents: 200, category: 'repas', emoji: '🥔', imageFile: null, trackStock: false },
  { id: 'gaufre', name: 'Gaufre', priceCents: 250, category: 'dessert', emoji: '🧇', imageFile: null, trackStock: false },
  { id: 'crepe', name: 'Crêpe', priceCents: 300, category: 'dessert', emoji: '🥞', imageFile: null, trackStock: false }
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
      receiptLegalNote: ''
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
    eventSessions: {},
    selectedEventId: null,
    printing: { deviceName: null, autoPrintTickets: false, silentPrint: true },
    security: { pinSalt: '', pinHash: null },
    orderCounter: 0,
    associationBackupPath: null,
    clientDisplayTheme: 'light',
    remoteCaisseEnabled: false,
    remoteCaisseToken: null,
    emailReceipt: {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      fromAddress: ''
    }
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
        trackStock: false
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
      receiptLegalNote: current.association.receiptLegalNote ?? ''
    }
  }
}
