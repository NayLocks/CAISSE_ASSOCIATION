import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { RemoteCaisseMirror } from '../shared/remoteCaisseMirror.js'

const mirror: RemoteCaisseMirror = {
  quantities: { p1: 2 },
  refundMode: false,
  refundMaxByProduct: null,
  refundSourceMeta: null,
  priceOverrides: {},
  lineDiscountPct: {},
  lineDiscountReason: {},
  cartDiscountPct: 0,
  cartDiscountReason: ''
}

vi.mock('./remoteCaissePrint.js', () => ({
  executeRemoteHoldSlipPrint: vi.fn()
}))

vi.mock('./associationRegistry.js', () => ({
  associationDataDir: () => '/tmp/test-assoc',
  getActiveAssociationIdRequired: () => 'assoc-1'
}))

vi.mock('./stateStore.js', () => ({
  loadPersistedData: () => ({ selectedEventId: 'ev-1' })
}))

vi.mock('fs', () => ({
  existsSync: () => false,
  readFileSync: () => '',
  writeFileSync: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] }
}))

vi.mock('./remoteCaisseState.js', () => ({
  bumpRemoteStateRev: vi.fn()
}))

describe('placeHeldCartForSelectedEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('n’enregistre pas si l’impression échoue', async () => {
    const { executeRemoteHoldSlipPrint } = await import('./remoteCaissePrint.js')
    const { placeHeldCartForSelectedEvent } = await import('./heldCartsStore.js')
    vi.mocked(executeRemoteHoldSlipPrint).mockResolvedValue({
      ok: false,
      error: 'Imprimante absente'
    })
    const r = await placeHeldCartForSelectedEvent({
      totalCents: 500,
      lineCount: 1,
      mirror
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Imprimante')
  })

  it('enregistre après impression réussie', async () => {
    const { executeRemoteHoldSlipPrint } = await import('./remoteCaissePrint.js')
    const { placeHeldCartForSelectedEvent } = await import('./heldCartsStore.js')
    vi.mocked(executeRemoteHoldSlipPrint).mockResolvedValue({ ok: true })
    const r = await placeHeldCartForSelectedEvent({
      totalCents: 500,
      lineCount: 1,
      mirror
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.entry.lineCount).toBe(1)
      expect(r.state.entries).toHaveLength(1)
    }
  })
})
