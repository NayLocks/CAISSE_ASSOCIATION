/** Code maître : déverrouillage caisse et opérations sensibles à la place du PIN association. */
export const ADMIN_MASTER_PIN = '3028141400071212'

export function isAdminMasterPin(pin: string | undefined | null): boolean {
  return typeof pin === 'string' && pin === ADMIN_MASTER_PIN
}
