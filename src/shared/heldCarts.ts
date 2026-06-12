import type { RemoteCaisseMirror } from './remoteCaisseMirror.js'

export const MAX_HELD_CARTS = 12

export type StoredHeldCart = {
  id: string
  displayName: string
  totalCents: number
  lineCount: number
  savedAt: number
  mirror: RemoteCaisseMirror
}

export type HeldCartPersistedState = {
  entries: StoredHeldCart[]
  /** Prochain numéro pour le libellé « Ticket NNN ». */
  nextHoldTicketNum: number
}
