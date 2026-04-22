import { createHash } from 'crypto'

export function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`, 'utf8').digest('hex')
}
