import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readHeldCartState, writeHeldCartState } from './heldCartsStorage'
import type { RemoteCaisseMirror } from '@shared/remoteCaisseMirror'

const mem: Record<string, string> = {}

function installLocalStorageMock(): void {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string): string | null => mem[k] ?? null,
      setItem: (k: string, v: string): void => {
        mem[k] = v
      },
      removeItem: (k: string): void => {
        delete mem[k]
      },
      clear: (): void => {
        for (const k of Object.keys(mem)) delete mem[k]
      },
      key: (): null => null,
      get length(): number {
        return Object.keys(mem).length
      }
    } as Storage,
    configurable: true
  })
}

const minimalMirror = (): RemoteCaisseMirror => ({
  quantities: {},
  refundMode: false,
  refundMaxByProduct: null,
  refundSourceMeta: null,
  priceOverrides: {},
  lineDiscountPct: {},
  lineDiscountReason: {}
})

describe('heldCartsStorage', () => {
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k]
    installLocalStorageMock()
  })

  afterEach(() => {
    for (const k of Object.keys(mem)) delete mem[k]
  })

  it('retourne un état vide par défaut', () => {
    expect(readHeldCartState('any-key')).toEqual({ entries: [], nextHoldTicketNum: 1 })
  })

  it('persiste et relit la version 2 avec nextHoldTicketNum', () => {
    const key = 'k1'
    writeHeldCartState(key, { entries: [], nextHoldTicketNum: 7 })
    expect(readHeldCartState(key)).toEqual({ entries: [], nextHoldTicketNum: 7 })
  })

  it('migre la v1 et déduit nextHoldTicketNum depuis les libellés Ticket NNN', () => {
    const key = 'k2'
    const mirror = minimalMirror()
    const payload = {
      v: 1,
      entries: [
        {
          id: 'h1',
          displayName: 'Ticket 4',
          totalCents: 100,
          lineCount: 1,
          savedAt: 1,
          mirror
        }
      ]
    }
    localStorage.setItem(key, JSON.stringify(payload))
    expect(readHeldCartState(key).nextHoldTicketNum).toBe(5)
    expect(readHeldCartState(key).entries).toHaveLength(1)
  })

  it('corrige un nextHoldTicketNum invalide en v2', () => {
    const key = 'k3'
    const mirror = minimalMirror()
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 2,
        nextHoldTicketNum: -3,
        entries: [
          {
            id: 'h1',
            displayName: 'Ticket 9',
            totalCents: 0,
            lineCount: 0,
            savedAt: 1,
            mirror
          }
        ]
      })
    )
    expect(readHeldCartState(key).nextHoldTicketNum).toBe(10)
  })
})
