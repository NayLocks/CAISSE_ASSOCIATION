import { randomUUID } from 'crypto'
import { sumUpPaymentsReady } from '../shared/catalog.js'
import { loadPersistedData } from './stateStore.js'
import {
  sumupCreateCheckout,
  sumupCreateReaderCheckout,
  sumupDeactivateCheckout,
  sumupGetCheckoutStatus,
  sumupPollTransactionByClientId,
  sumupTerminateReaderCheckout
} from './sumup.js'

export async function httpSumupCreateCheckout(payload: {
  amountCents: number
  checkoutReference: string
  description?: string
}): Promise<
  | { ok: true; flow: 'reader'; clientTransactionId: string }
  | { ok: true; flow: 'online'; checkoutId: string; nextUrl?: string }
  | { ok: false; error: string | 'not_configured' }
> {
  const data = loadPersistedData()
  const s = data.integrations.sumup
  if (!sumUpPaymentsReady(s)) {
    return { ok: false, error: 'not_configured' }
  }
  const checkoutRef =
    typeof payload.checkoutReference === 'string' && payload.checkoutReference.trim().length > 0
      ? payload.checkoutReference.trim()
      : randomUUID()
  const readerId = typeof s.readerId === 'string' ? s.readerId.trim() : ''
  if (readerId) {
    const tr = await sumupCreateReaderCheckout({
      apiKey: s.apiKey,
      merchantCode: s.merchantCode,
      readerId,
      amountCents: payload.amountCents,
      description: payload.description,
      checkoutReference: checkoutRef,
      affiliate: null
    })
    if (!tr.ok) return { ok: false, error: tr.error }
    return { ok: true, flow: 'reader', clientTransactionId: tr.clientTransactionId }
  }
  const co = await sumupCreateCheckout({
    apiKey: s.apiKey,
    amountCents: payload.amountCents,
    checkoutReference: checkoutRef
  })
  if (!co.ok) return { ok: false, error: co.error }
  return { ok: true, flow: 'online', checkoutId: co.id, nextUrl: co.nextUrl }
}

export async function httpSumupCheckoutStatus(checkoutId: string): Promise<
  { ok: false; error: 'not_configured' } | { ok: true; paid: boolean; status?: string }
> {
  const data = loadPersistedData()
  const key = data.integrations.sumup.apiKey
  if (!key.trim()) return { ok: false, error: 'not_configured' }
  const st = await sumupGetCheckoutStatus(key, checkoutId)
  return { ok: true, ...st }
}

export async function httpSumupTransactionStatus(clientTransactionId: string): Promise<
  | { ok: true; poll: 'paid' | 'pending' | 'failed' | 'error'; message?: string; detail?: string }
  | { ok: false; error: 'not_configured' }
> {
  const data = loadPersistedData()
  const s = data.integrations.sumup
  if (!s.apiKey.trim() || !s.merchantCode.trim()) {
    return { ok: false, error: 'not_configured' }
  }
  const r = await sumupPollTransactionByClientId(s.apiKey, s.merchantCode, clientTransactionId)
  if (r.state === 'error') {
    return { ok: true, poll: 'error', message: r.message }
  }
  if (r.state === 'paid') return { ok: true, poll: 'paid' }
  if (r.state === 'failed') {
    return { ok: true, poll: 'failed', detail: r.detail }
  }
  return { ok: true, poll: 'pending' }
}

/** Comme `sumup:cancel-payment` (IPC) : terminal Solo → terminate ; sinon → désactive le checkout en ligne. */
export async function httpSumupCancelPayment(payload: {
  onlineCheckoutId?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const data = loadPersistedData()
  const s = data.integrations.sumup
  if (!s.apiKey.trim()) {
    return { ok: false, error: 'SumUp non configuré.' }
  }
  const readerId = typeof s.readerId === 'string' ? s.readerId.trim() : ''
  if (readerId) {
    if (!s.merchantCode.trim()) {
      return { ok: false, error: 'SumUp non configuré.' }
    }
    const tr = await sumupTerminateReaderCheckout(s.apiKey, s.merchantCode, readerId)
    return tr.ok ? { ok: true } : { ok: false, error: tr.error }
  }
  const cid = typeof payload?.onlineCheckoutId === 'string' ? payload.onlineCheckoutId.trim() : ''
  if (!cid) return { ok: true }
  const co = await sumupDeactivateCheckout(s.apiKey, cid)
  return co.ok ? { ok: true } : { ok: false, error: co.error }
}
