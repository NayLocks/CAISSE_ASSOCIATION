import { timingSafeEqual } from 'crypto'
import { BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { extname } from 'path'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { networkInterfaces } from 'os'
import type { AddressInfo } from 'net'
import type { SalePayment } from '../shared/sales'
import type { RemoteCaisseMirror } from '../shared/remoteCaisseMirror.js'
import { getStockMap } from '../shared/inventory'
import { sumUpPaymentsReady } from '../shared/catalog.js'
import {
  loadPersistedData,
  productImageFullPath,
  savePersistedData
} from './stateStore.js'
import { getClientDisplayFlags, setClientDisplayRemoteEnabled } from './clientDisplayServer.js'
import {
  forceClaimCartEditor,
  getCartEditor,
  getRemoteMirror,
  getRemoteStateRev,
  replaceMirrorFromHttp,
  tryReplaceMirrorFromHttp
} from './remoteCaisseState.js'
import {
  addHeldCartForSelectedEvent,
  getHeldCartsForSelectedEvent,
  placeHeldCartForSelectedEvent,
  removeHeldCartForSelectedEvent,
  setHeldCartsForSelectedEvent
} from './heldCartsStore.js'
import { executeRemoteSale } from './remoteCaisseSale.js'
import { loadSaleForRefund } from './remoteCaisseRefund.js'
import {
  buildRemoteSalesList,
  findSaleRecordById,
  paymentDetailLines
} from './remoteCaisseHistory.js'
import { buildTabletHtml } from './tabletPage.js'
import { buildEventCashSummaryPayload } from './eventCashSummary.js'
import {
  httpSumupCancelPayment,
  httpSumupCheckoutStatus,
  httpSumupCreateCheckout,
  httpSumupTransactionStatus
} from './sumupHttpHandlers.js'
import { parseClientPaymentDetail, setTabletPaymentSession } from './tabletClientDisplaySync.js'
import { executeRemoteHoldSlipPrint, executeRemoteReceiptPrint } from './remoteCaissePrint.js'
import { isEmailReceiptSmtpReady, sendSummaryReceiptEmail } from './emailReceipt.js'

function mimeForImageExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

function emptyMirror(): RemoteCaisseMirror {
  return {
    quantities: {},
    refundMode: false,
    refundMaxByProduct: null,
    refundSourceMeta: null,
    priceOverrides: {},
    lineDiscountPct: {},
    lineDiscountReason: {},
    cartDiscountPct: 0,
    cartDiscountReason: ''
  }
}

let httpServer: Server | null = null
let boundPort = 0

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

/** Évite ERR_HTTP_HEADERS_SENT si le client coupe la connexion ou si une erreur survient après envoi. */
function respondJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

function respondEmpty(res: ServerResponse, status: number, extraHeaders?: Record<string, string>): void {
  if (res.headersSent) return
  res.writeHead(status, { ...extraHeaders, ...CORS })
  res.end()
}

function listLanUrls(port: number): string[] {
  const out: string[] = []
  const ifs = networkInterfaces()
  for (const addrs of Object.values(ifs)) {
    if (!addrs) continue
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) {
        out.push(`http://${a.address}:${port}`)
      }
    }
  }
  return [...new Set(out)].sort()
}

export function getRemoteCaisseInfo(): { port: number; urls: string[] } {
  if (!httpServer || boundPort <= 0) return { port: 0, urls: [] }
  const urls = [`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`, ...listLanUrls(boundPort)]
  return { port: boundPort, urls: [...new Set(urls)] }
}

function getTokenFromRequest(req: IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim()
    return t.length > 0 ? t : null
  }
  const u = req.url ?? ''
  const q = u.includes('?') ? u.split('?')[1] : ''
  const params = new URLSearchParams(q)
  const t = params.get('token')
  return t && t.trim().length > 0 ? t.trim() : null
}

function safeEqualToken(stored: string | null, provided: string): boolean {
  if (!stored || !provided || stored.length !== provided.length) return false
  try {
    return timingSafeEqual(Buffer.from(stored, 'utf8'), Buffer.from(provided, 'utf8'))
  } catch {
    return false
  }
}

type AuthFail = { ok: false; status: number; body: string }
type AuthOk = { ok: true }
function verifyRemote(req: IncomingMessage): AuthOk | AuthFail {
  const data = loadPersistedData()
  if (!data.remoteCaisseEnabled) {
    return { ok: false, status: 403, body: JSON.stringify({ error: 'Pilotage tablette désactivé.' }) }
  }
  if (data.remoteCaisseTokenRequired === false) {
    return { ok: true }
  }
  if (!data.remoteCaisseToken) {
    return {
      ok: false,
      status: 403,
      body: JSON.stringify({ error: 'Aucun jeton — générez-en un depuis la caisse (menu Accès distant).' })
    }
  }
  const tok = getTokenFromRequest(req)
  if (!tok || !safeEqualToken(data.remoteCaisseToken, tok)) {
    return { ok: false, status: 401, body: JSON.stringify({ error: 'Jeton invalide ou manquant.' }) }
  }
  return { ok: true }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function broadcastRefresh(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('remote-caisse:refresh-data')
  }
}

function buildBootstrapPayload() {
  const data = loadPersistedData()
  const eid = data.selectedEventId
  const ev = eid ? data.events.find((x) => x.id === eid) : undefined
  const eventClosed = ev?.closed === true
  const sessionInfo = eid ? data.eventSessions[eid] : undefined
  const canSell = Boolean(ev && sessionInfo && !eventClosed)
  const sessionRequired = Boolean(ev && !sessionInfo && !eventClosed)
  const stock = eid ? getStockMap(data, eid) : {}
  const su = data.integrations.sumup
  const sumupConfigured = sumUpPaymentsReady(su)
  const sumupTerminalAuto = Boolean(sumupConfigured && (su.readerId ?? '').trim().length > 0)
  const mirror = getRemoteMirror()

  const disp = getClientDisplayFlags()
  return {
    rev: getRemoteStateRev(),
    associationName: data.association.name.trim() || 'Association',
    categories: data.categories,
    products: data.products.map((p) => {
      const imgPath = p.imageFile ? productImageFullPath(p.imageFile) : ''
      return {
        id: p.id,
        name: p.name,
        priceCents: p.priceCents,
        category: p.category,
        emoji: p.emoji,
        trackStock: p.trackStock,
        lowStockThreshold: p.lowStockThreshold ?? null,
        variablePrice: p.variablePrice === true,
        cardCashExchange: p.cardCashExchange === true,
        hasImage: Boolean(imgPath && existsSync(imgPath)),
        enabledForEvent: eid ? data.disabledProductsByEvent[eid]?.[p.id] !== true : true
      }
    }),
    events: data.events.map((e) => ({ id: e.id, name: e.name, closed: e.closed === true })),
    selectedEventId: eid,
    eventName: ev?.name ?? null,
    eventClosed,
    canSell,
    sessionRequired,
    sessionFloatCents: sessionInfo ? sessionInfo.floatCents : null,
    clientDisplayRemoteEnabled: disp.remoteEnabled,
    stock,
    mirror,
    sumupConfigured,
    sumupTerminalAuto,
    smtpReceiptConfigured: isEmailReceiptSmtpReady(data),
    tabletTokenRequired: data.remoteCaisseTokenRequired !== false,
    cashPaymentUi: data.cashPaymentUi === 'express' ? 'express' : 'detail',
    discountMotifs: data.discountMotifs,
    held: getHeldCartsForSelectedEvent(),
    cartEditor: getCartEditor()
  }
}

function parseJsonMirror(raw: string): RemoteCaisseMirror | null {
  try {
    const o = JSON.parse(raw) as RemoteCaisseMirror
    if (!o || typeof o !== 'object') return null
    return o
  } catch {
    return null
  }
}

async function handleRemoteApi(
  req: IncomingMessage,
  res: ServerResponse,
  rawPath: string,
  query: URLSearchParams
): Promise<boolean> {
  if (rawPath === '/tablet' || rawPath === '/tablet/') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...CORS })
      res.end(buildTabletHtml())
      return true
    }
  }

  /** État du pilotage (sans jeton) — écran d’attente tablette. */
  if (rawPath === '/api/remote/status') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const data = loadPersistedData()
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(
      JSON.stringify({
        enabled: Boolean(data.remoteCaisseEnabled),
        tokenRequired: data.remoteCaisseTokenRequired !== false
      })
    )
    return true
  }

  /** Sonde légère : la tablette compare `rev` et recharge le bootstrap quand il change. */
  if (rawPath === '/api/remote/rev') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(JSON.stringify({ rev: getRemoteStateRev() }))
    return true
  }

  if (rawPath === '/api/remote/held') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    respondJson(res, 200, getHeldCartsForSelectedEvent())
    return true
  }

  if (rawPath === '/api/remote/held/add') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw
        ? (JSON.parse(raw) as {
            displayName?: unknown
            totalCents?: unknown
            lineCount?: unknown
            mirror?: unknown
          })
        : {}
      const totalCents = typeof body.totalCents === 'number' ? body.totalCents : NaN
      const lineCount = typeof body.lineCount === 'number' ? body.lineCount : NaN
      if (!Number.isFinite(totalCents) || !Number.isFinite(lineCount)) {
        respondJson(res, 400, { error: 'totalCents et lineCount requis.' })
        return true
      }
      const r = addHeldCartForSelectedEvent({
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        totalCents,
        lineCount,
        mirror: body.mirror as RemoteCaisseMirror
      })
      if (!r.ok) {
        respondJson(res, 400, { error: r.error })
        return true
      }
      respondJson(res, 200, { ok: true, entry: r.entry, state: r.state })
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/held/remove') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { id?: unknown }) : {}
      const id = typeof body.id === 'string' ? body.id.trim() : ''
      if (!id) {
        respondJson(res, 400, { error: 'Identifiant manquant.' })
        return true
      }
      const state = removeHeldCartForSelectedEvent(id)
      respondJson(res, 200, { ok: true, state })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      respondJson(res, 400, { error: msg })
    }
    return true
  }

  if (rawPath === '/api/remote/bootstrap') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(JSON.stringify(buildBootstrapPayload()))
    return true
  }

  if (rawPath === '/api/remote/cart/force-control') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    const r = forceClaimCartEditor('tablet')
    respondJson(res, 200, r)
    return true
  }

  if (rawPath === '/api/remote/mirror') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const m = parseJsonMirror(raw || '{}')
      if (!m) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'État invalide.' }))
        return true
      }
      const r = tryReplaceMirrorFromHttp(m)
      if (!r.ok) {
        respondJson(res, 409, { error: r.error, cartEditor: getCartEditor() })
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true, mirror: getRemoteMirror(), cartEditor: getCartEditor() }))
    } catch {
      respondJson(res, 400, { error: 'JSON invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/client-display/payment') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { open?: unknown; paymentDetail?: unknown }) : {}
      const open = Boolean(body.open)
      if (!open) {
        setTabletPaymentSession(false, null)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ ok: true }))
        return true
      }
      const det = parseClientPaymentDetail(body.paymentDetail)
      if (!det) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'Détail paiement invalide.' }))
        return true
      }
      setTabletPaymentSession(true, det)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/sale/finalize') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { payment?: SalePayment }) : {}
      if (!body.payment || typeof body.payment !== 'object') {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'Paiement manquant.' }))
        return true
      }
      const result = await executeRemoteSale(body.payment)
      if (!result.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: result.error }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true, orderNumber: result.orderNumber, totalCents: result.totalCents }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/session/start') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { floatCents?: number }) : {}
      const fc =
        typeof body.floatCents === 'number' && Number.isFinite(body.floatCents)
          ? Math.max(0, Math.floor(body.floatCents))
          : 0
      const data = loadPersistedData()
      const eid = data.selectedEventId
      if (!eid) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'Aucun événement sélectionné.' }))
        return true
      }
      const next = {
        ...data,
        eventSessions: {
          ...data.eventSessions,
          [eid]: { floatCents: fc, startedAt: new Date().toISOString() }
        }
      }
      savePersistedData(next)
      broadcastRefresh()
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/select-event') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { eventId?: string | null }) : {}
      const data = loadPersistedData()
      const eventId =
        body.eventId === null || body.eventId === undefined || body.eventId === ''
          ? null
          : String(body.eventId)
      const prevEventId = data.selectedEventId
      const prevEv = prevEventId ? data.events.find((x) => x.id === prevEventId) : undefined
      savePersistedData({ ...data, selectedEventId: eventId })
      replaceMirrorFromHttp(emptyMirror())
      broadcastRefresh()
      const newEv = eventId ? data.events.find((x) => x.id === eventId) : undefined
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('remote-caisse:event-changed', {
          eventId,
          eventName: newEv?.name ?? null,
          previousEventId: prevEventId,
          previousEventName: prevEv?.name ?? null
        })
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/sales') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    const limit = Math.min(200, Math.max(1, parseInt(query.get('limit') ?? '80', 10) || 80))
    const data = loadPersistedData()
    const eid = data.selectedEventId
    const salesOnly = query.get('salesOnly') === '1'
    let sales = buildRemoteSalesList(eid, limit)
    if (salesOnly) {
      sales = sales.filter((x) => x.kind === 'sale')
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(JSON.stringify({ sales }))
    return true
  }

  if (rawPath === '/api/remote/event-cash-summary') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    const data = loadPersistedData()
    const eid = data.selectedEventId
    const ev = eid ? data.events.find((x) => x.id === eid) : undefined
    const sessionInfo = eid ? data.eventSessions[eid] : undefined
    const sessionStarted = Boolean(ev && sessionInfo && ev.closed !== true)
    const payload = buildEventCashSummaryPayload(
      eid,
      sessionInfo ? sessionInfo.floatCents : null,
      sessionStarted,
      ev?.name ?? null,
      data.products
    )
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(JSON.stringify(payload))
    return true
  }

  if (rawPath === '/api/remote/sale') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    const id = (query.get('id') ?? '').trim()
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ error: 'id requis.' }))
      return true
    }
    const data = loadPersistedData()
    const sale = findSaleRecordById(id, data.selectedEventId)
    if (!sale) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ error: 'Vente introuvable.' }))
      return true
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(
      JSON.stringify({
        sale,
        paymentDetailText: paymentDetailLines(sale)
      })
    )
    return true
  }

  if (rawPath === '/api/remote/refund/load-sale') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { saleId?: string }) : {}
      const saleId = typeof body.saleId === 'string' ? body.saleId : ''
      if (!saleId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'saleId requis.' }))
        return true
      }
      const r = loadSaleForRefund(saleId)
      if (!r.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: r.error }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true, mirror: getRemoteMirror() }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/sumup/create-checkout') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw
        ? (JSON.parse(raw) as { amountCents?: number; checkoutReference?: string; description?: string })
        : {}
      const r = await httpSumupCreateCheckout({
        amountCents: Math.floor(Number(body.amountCents) || 0),
        checkoutReference: typeof body.checkoutReference === 'string' ? body.checkoutReference : '',
        description: typeof body.description === 'string' ? body.description : undefined
      })
      if (!r.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: r.error === 'not_configured' ? 'SumUp non configuré.' : r.error }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify(r))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/sumup/checkout-status') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    const checkoutId = query.get('checkoutId') ?? ''
    if (!checkoutId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ error: 'checkoutId requis.' }))
      return true
    }
    const st = await httpSumupCheckoutStatus(checkoutId)
    if (!st.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ error: 'SumUp non configuré.' }))
      return true
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(JSON.stringify(st))
    return true
  }

  if (rawPath === '/api/remote/sumup/transaction-status') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    const clientTransactionId = query.get('clientTransactionId') ?? ''
    if (!clientTransactionId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ error: 'clientTransactionId requis.' }))
      return true
    }
    const st = await httpSumupTransactionStatus(clientTransactionId)
    if (!st.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ error: 'SumUp non configuré.' }))
      return true
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
    res.end(JSON.stringify(st))
    return true
  }

  if (rawPath === '/api/remote/sumup/cancel') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw
        ? (JSON.parse(raw) as { onlineCheckoutId?: string })
        : {}
      const r = await httpSumupCancelPayment({
        onlineCheckoutId: typeof body.onlineCheckoutId === 'string' ? body.onlineCheckoutId : undefined
      })
      if (!r.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: r.error }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/print/receipt') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw
        ? (JSON.parse(raw) as { orderNumber?: unknown; kind?: unknown })
        : {}
      const orderNumber = Math.floor(Number(body.orderNumber) || 0)
      const kind = body.kind === 'units' ? 'units' : 'summary'
      if (orderNumber <= 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'Numéro de commande invalide.' }))
        return true
      }
      const r = await executeRemoteReceiptPrint({ orderNumber, kind })
      if (!r.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: r.error }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  /** Mise en attente atomique : impression + enregistrement. */
  if (rawPath === '/api/remote/hold/place') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw
        ? (JSON.parse(raw) as {
            displayName?: unknown
            totalCents?: unknown
            lineCount?: unknown
            mirror?: unknown
          })
        : {}
      const totalCents = typeof body.totalCents === 'number' ? body.totalCents : NaN
      const lineCount = typeof body.lineCount === 'number' ? body.lineCount : NaN
      if (!Number.isFinite(totalCents) || !Number.isFinite(lineCount)) {
        respondJson(res, 400, { error: 'totalCents et lineCount requis.' })
        return true
      }
      const r = await placeHeldCartForSelectedEvent({
        displayName: typeof body.displayName === 'string' ? body.displayName : undefined,
        totalCents,
        lineCount,
        mirror: body.mirror as RemoteCaisseMirror
      })
      if (!r.ok) {
        respondJson(res, 400, { error: r.error })
        return true
      }
      respondJson(res, 200, { ok: true, entry: r.entry, state: r.state })
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/held/set') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { state?: unknown }) : {}
      if (!body.state || typeof body.state !== 'object') {
        respondJson(res, 400, { error: 'État invalide.' })
        return true
      }
      const state = setHeldCartsForSelectedEvent(body.state as import('../shared/heldCarts.js').HeldCartPersistedState)
      respondJson(res, 200, { ok: true, state })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      respondJson(res, 400, { error: msg })
    }
    return true
  }

  /** Ticket d’attente (panier mis de côté sur la tablette) : impression côté caisse. */
  if (rawPath === '/api/remote/hold/print') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { ticketLabel?: unknown }) : {}
      const ticketLabel = typeof body.ticketLabel === 'string' ? body.ticketLabel.trim() : ''
      if (!ticketLabel) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'Libellé de ticket manquant.' }))
        return true
      }
      const r = await executeRemoteHoldSlipPrint(ticketLabel)
      if (!r.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: r.error }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/email/receipt') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { saleId?: string; to?: string }) : {}
      const saleId = typeof body.saleId === 'string' ? body.saleId.trim() : ''
      const to = typeof body.to === 'string' ? body.to.trim() : ''
      if (!saleId) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'saleId requis.' }))
        return true
      }
      if (!to || !to.includes('@')) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'Adresse e-mail invalide.' }))
        return true
      }
      const data = loadPersistedData()
      const sale = findSaleRecordById(saleId, data.selectedEventId)
      if (!sale) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: 'Vente introuvable.' }))
        return true
      }
      const sent = await sendSummaryReceiptEmail(data, sale, to)
      if (!sent.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
        res.end(JSON.stringify({ error: sent.error }))
        return true
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  if (rawPath === '/api/remote/product-image') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'GET') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    const productId = query.get('productId') ?? ''
    if (!productId.trim()) {
      res.writeHead(400, CORS)
      res.end()
      return true
    }
    const data = loadPersistedData()
    const p = data.products.find((x) => x.id === productId)
    if (!p?.imageFile) {
      res.writeHead(404, CORS)
      res.end()
      return true
    }
    const full = productImageFullPath(p.imageFile)
    if (!existsSync(full)) {
      res.writeHead(404, CORS)
      res.end()
      return true
    }
    const buf = readFileSync(full)
    const mime = mimeForImageExt(extname(full))
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=120',
      ...CORS
    })
    res.end(buf)
    return true
  }

  if (rawPath === '/api/remote/client-display-remote') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS)
      res.end()
      return true
    }
    if (req.method !== 'POST') {
      res.writeHead(405, CORS)
      res.end()
      return true
    }
    const v = verifyRemote(req)
    if (!v.ok) {
      res.writeHead(v.status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(v.body)
      return true
    }
    try {
      const raw = await readBody(req)
      const body = raw ? (JSON.parse(raw) as { enabled?: unknown }) : {}
      setClientDisplayRemoteEnabled(Boolean(body.enabled))
      broadcastRefresh()
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS })
      res.end(JSON.stringify({ ok: true }))
    } catch {
      respondJson(res, 400, { error: 'Requête invalide.' })
    }
    return true
  }

  return false
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const rawUrl = req.url ?? '/'
  const [pathOnly, search = ''] = rawUrl.split('?')
  const rawPath = pathOnly ?? '/'
  const query = new URLSearchParams(search)

  void (async () => {
    try {
      const handled = await handleRemoteApi(req, res, rawPath, query)
      if (handled) return
      respondEmpty(res, 404)
    } catch (e) {
      if (!res.headersSent) {
        respondJson(res, 500, { error: 'Erreur serveur.' })
      } else {
        console.error('[remote-caisse] erreur après envoi de la réponse', e)
      }
    }
  })()
}

function tryListen(s: Server, port: number): void {
  const onErr = (e: NodeJS.ErrnoException) => {
    s.removeListener('error', onErr)
    if (e.code === 'EADDRINUSE' && port < 3865) {
      tryListen(s, port + 1)
    } else {
      console.error('[remote-caisse]', e.message)
    }
  }
  s.once('error', onErr)
  s.listen(port, '0.0.0.0', () => {
    s.removeListener('error', onErr)
    const addr = s.address() as AddressInfo
    boundPort = addr.port
    console.log(`[remote-caisse] http://127.0.0.1:${boundPort}/tablet`)
  })
}

export function startRemoteCaisseServer(): void {
  if (httpServer) return
  const s = createServer(handleRequest)
  httpServer = s
  tryListen(s, 3850)
}

/** Arrêt propre (quitter l’app) : coupe les connexions en cours puis libère le port. */
export function stopRemoteCaisseServer(): void {
  const s = httpServer
  if (!s) return
  httpServer = null
  boundPort = 0
  try {
    s.closeAllConnections()
  } catch {
    /* ignore */
  }
  s.close()
}
