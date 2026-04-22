import SumUp, { APIError } from '@sumup/sdk'
import type { CreateReaderCheckoutRequest } from '@sumup/sdk'

function problemMessage(raw: unknown, fallback: string): string {
  if (typeof raw === 'object' && raw && 'detail' in raw) {
    const d = (raw as { detail: unknown }).detail
    if (typeof d === 'string' && d.trim()) return d
    if (Array.isArray(d)) {
      const parts = d
        .map((x) => {
          if (x && typeof x === 'object' && 'message' in x) {
            const m = (x as { message: unknown }).message
            return typeof m === 'string' ? m : ''
          }
          return ''
        })
        .filter(Boolean)
      if (parts.length) return parts.join(' — ')
    }
  }
  if (typeof raw === 'object' && raw && 'title' in raw) {
    const t = (raw as { title: unknown }).title
    if (typeof t === 'string' && t.trim()) return t
  }
  if (typeof raw === 'object' && raw && 'message' in raw) {
    const m = (raw as { message: unknown }).message
    if (typeof m === 'string' && m.trim()) return m
  }
  return fallback
}

function sdkErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof APIError) {
    const er = err.error
    if (typeof er === 'object' && er !== null) {
      return problemMessage(er, err.message || fallback)
    }
    if (typeof er === 'string' && er.trim()) return er
    if (typeof err.message === 'string' && err.message.trim()) return err.message
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

function sumupClient(apiKey: string): SumUp {
  return new SumUp({ apiKey: apiKey.trim() })
}

/** Normalise le code marchand SumUp (souvent alphanumérique majuscules). */
function normalizeMerchantCode(code: string): string {
  return code.trim().toUpperCase()
}

const SUMUP_API_ORIGIN = 'https://api.sumup.com'

async function readSumUpJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { message: text }
  }
}

/**
 * Checkout carte en ligne : `POST /v0.1/checkouts` avec la clé API en Bearer.
 */
export async function sumupCreateCheckout(opts: {
  apiKey: string
  amountCents: number
  checkoutReference: string
}): Promise<
  | { ok: true; id: string; nextUrl?: string }
  | { ok: false; error: string }
> {
  const amount = Math.round(opts.amountCents) / 100
  try {
    const res = await fetch(`${SUMUP_API_ORIGIN}/v0.1/checkouts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey.trim()}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        checkout_reference: opts.checkoutReference,
        amount,
        currency: 'EUR'
      })
    })
    const raw = await readSumUpJson(res)
    if (!res.ok) {
      return {
        ok: false,
        error: problemMessage(raw, `Erreur SumUp (${res.status})`)
      }
    }
    if (!raw || typeof raw !== 'object') {
      return { ok: false, error: 'Réponse SumUp invalide.' }
    }
    const ext = raw as Record<string, unknown>
    const id = ext.id
    if (typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'Réponse SumUp invalide.' }
    }
    const ns = ext.next_step as { full?: string; url?: string } | undefined
    const nextUrl =
      typeof ns?.full === 'string' ? ns.full : typeof ns?.url === 'string' ? ns.url : undefined
    return { ok: true, id: id.trim(), nextUrl }
  } catch (e) {
    return { ok: false, error: sdkErrorMessage(e, 'Erreur SumUp') }
  }
}

export async function sumupGetCheckoutStatus(
  apiKey: string,
  checkoutId: string
): Promise<{ status: string; paid: boolean; error?: string }> {
  try {
    const raw = await sumupClient(apiKey).checkouts.get(checkoutId)
    const status = String(raw.status ?? 'UNKNOWN')
    const txOk =
      Array.isArray(raw.transactions) &&
      raw.transactions.some((t) => {
        const st = String(t?.status ?? '').toUpperCase()
        return st === 'SUCCESSFUL' || st === 'SUCCESS' || st === 'PAID'
      })
    const paid =
      status.toUpperCase() === 'PAID' ||
      status.toUpperCase() === 'SUCCESSFUL' ||
      txOk
    return { status, paid }
  } catch (e) {
    return { status: 'ERROR', paid: false, error: sdkErrorMessage(e, 'Erreur SumUp') }
  }
}

/** Paiement sur terminal physique (SumUp Cloud API — Solo / virtual-solo). */
export async function sumupCreateReaderCheckout(opts: {
  apiKey: string
  merchantCode: string
  readerId: string
  amountCents: number
  description?: string
  /** Référence client unique (ex. checkoutReference) — utilisée comme foreign_transaction_id si affilié renseigné */
  checkoutReference?: string
  /** Clés affilié SumUp (portail développeur) — recommandé pour l’API Cloud */
  affiliate?: { appId: string; key: string } | null
}): Promise<{ ok: true; clientTransactionId: string } | { ok: false; error: string }> {
  const value = Math.round(opts.amountCents)
  const body: CreateReaderCheckoutRequest = {
    total_amount: {
      currency: 'EUR',
      minor_unit: 2,
      value
    }
  }
  if (opts.description) body.description = opts.description

  const appId = opts.affiliate?.appId?.trim() ?? ''
  const affKey = opts.affiliate?.key?.trim() ?? ''
  const foreignId = opts.checkoutReference?.trim() ?? ''
  if (appId && affKey && foreignId) {
    body.affiliate = {
      app_id: appId,
      key: affKey,
      foreign_transaction_id: foreignId
    }
  }

  try {
    const res = await sumupClient(opts.apiKey).readers.createCheckout(
      normalizeMerchantCode(opts.merchantCode),
      opts.readerId.trim(),
      body
    )
    const id = res.data?.client_transaction_id
    if (typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'Réponse SumUp (terminal) invalide.' }
    }
    return { ok: true, clientTransactionId: id.trim() }
  } catch (e) {
    return { ok: false, error: sdkErrorMessage(e, 'Erreur SumUp') }
  }
}

export type TransactionPollResult =
  | { state: 'pending' }
  | { state: 'paid' }
  | { state: 'failed'; detail?: string }

export async function sumupPollTransactionByClientId(
  apiKey: string,
  merchantCode: string,
  clientTransactionId: string
): Promise<TransactionPollResult | { state: 'error'; message: string }> {
  try {
    const tx = await sumupClient(apiKey).transactions.get(normalizeMerchantCode(merchantCode), {
      client_transaction_id: clientTransactionId
    })
    const status = String(tx.status ?? 'PENDING').toUpperCase()
    if (status === 'SUCCESSFUL') return { state: 'paid' }
    if (status === 'FAILED' || status === 'CANCELLED') {
      return { state: 'failed', detail: status }
    }
    return { state: 'pending' }
  } catch (e) {
    if (e instanceof APIError && e.status === 404) {
      return { state: 'pending' }
    }
    return { state: 'error', message: sdkErrorMessage(e, 'Erreur SumUp') }
  }
}

export type ReaderListItem = {
  id: string
  name: string
  status: string
  model: string | null
}

export async function sumupListReaders(
  apiKey: string,
  merchantCode: string
): Promise<{ ok: true; items: ReaderListItem[] } | { ok: false; error: string }> {
  try {
    const { items } = await sumupClient(apiKey).readers.list(normalizeMerchantCode(merchantCode))
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: true, items: [] }
    }
    const out: ReaderListItem[] = []
    for (const r of items) {
      if (!r?.id) continue
      out.push({
        id: r.id,
        name: typeof r.name === 'string' ? r.name : r.id,
        status: typeof r.status === 'string' ? r.status : 'unknown',
        model: r.device?.model != null ? String(r.device.model) : null
      })
    }
    return { ok: true, items: out }
  } catch (e) {
    return { ok: false, error: sdkErrorMessage(e, 'Erreur SumUp') }
  }
}

/** Annule le checkout en cours sur le terminal (Cloud API — Solo). */
export async function sumupTerminateReaderCheckout(
  apiKey: string,
  merchantCode: string,
  readerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sumupClient(apiKey).readers.terminateCheckout(
      normalizeMerchantCode(merchantCode),
      readerId.trim()
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: sdkErrorMessage(e, 'Annulation terminal impossible') }
  }
}

/** Désactive un checkout en ligne non finalisé (fermeture modale / retour). */
export async function sumupDeactivateCheckout(
  apiKey: string,
  checkoutId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sumupClient(apiKey).checkouts.deactivate(checkoutId.trim())
    return { ok: true }
  } catch (e) {
    return { ok: false, error: sdkErrorMessage(e, 'Annulation checkout impossible') }
  }
}
