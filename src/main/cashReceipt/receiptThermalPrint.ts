import { BrowserWindow } from 'electron'
import { randomBytes } from 'crypto'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { TicketUnitPayload } from '../../shared/ticket.js'
import { RECEIPT_DOCUMENT_ROOT_ID, RECEIPT_TICKET_WIDTH_MM, RECEIPT_WINDOW_WIDTH_PX } from './constants.js'
import { buildTicketsDocument, type UnitTicketsDocumentOptions } from './receiptDocuments.js'

const MICRONS_PER_MM = 1000
const MICRONS_PER_CSS_PX = (25.4 / 96) * MICRONS_PER_MM

/** Microns : largeur page fixe thermique */
const PAGE_WIDTH_MICRONS = RECEIPT_TICKET_WIDTH_MM * MICRONS_PER_MM

const MIN_PAGE_HEIGHT_MM = 25
/** Récap très long ou N tickets unitaires : plafond large pour éviter la coupe */
const MAX_PAGE_HEIGHT_MM = 1400

let printerProbe: BrowserWindow | null = null

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/**
 * Hauteur du bloc `#receipt-doc` en pixels CSS (même logique que la mesure pour l’impression).
 */
async function measureReceiptStackHeightCssPx(
  win: BrowserWindow,
  measureOpts?: { imageWaitMs?: number }
): Promise<number> {
  const id = RECEIPT_DOCUMENT_ROOT_ID
  let imgWait = 3500
  if (
    measureOpts?.imageWaitMs != null &&
    typeof measureOpts.imageWaitMs === 'number' &&
    Number.isFinite(measureOpts.imageWaitMs)
  ) {
    imgWait = Math.max(50, Math.min(8000, measureOpts.imageWaitMs))
  }
  const rawPx = await win.webContents.executeJavaScript(
    `(async function () {
      function waitImages() {
        return Promise.all(
          Array.from(document.images).map(function (img) {
            if (img.complete) return Promise.resolve()
            return new Promise(function (resolve) {
              function done() {
                resolve(0)
              }
              img.addEventListener('load', done, { once: true })
              img.addEventListener('error', done, { once: true })
              window.setTimeout(done, ${imgWait})
            })
          })
        )
      }
      await waitImages()
      await new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(resolve)
        })
      })
      var root = document.getElementById('${id}')
      if (!root) return 0
      var cs = window.getComputedStyle(root)
      var pb = parseFloat(cs.paddingBottom) || 0
      var rr = root.getBoundingClientRect()
      var maxB = rr.top
      var ch = root.children
      var i = 0
      for (; i < ch.length; i++) {
        var el = ch[i]
        var r = el.getBoundingClientRect()
        var mb = parseFloat(window.getComputedStyle(el).marginBottom) || 0
        maxB = Math.max(maxB, r.bottom + mb)
      }
      var hPx = Math.max(maxB - rr.top + pb, Math.ceil(rr.height))
      return typeof hPx === 'number' && isFinite(hPx) ? Math.round(hPx) : 0
    })()`,
    true
  )

  return typeof rawPx === 'number' && Number.isFinite(rawPx) ? rawPx : 0
}

export async function measureReceiptDocumentHeightPx(
  win: BrowserWindow,
  measureOpts?: { imageWaitMs?: number }
): Promise<number> {
  return measureReceiptStackHeightCssPx(win, measureOpts)
}

/**
 * Hauteur physique du ticket = boîte `#receipt-doc` (padding inclus) · ne dépend pas de la fenêtre.
 * Script uniquement ES5/ES2017 compatible Chromium (pas de syntaxe TS).
 */
async function measureReceiptStackHeightMicrons(
  win: BrowserWindow,
  measureOpts?: { imageWaitMs?: number }
): Promise<number> {
  const px = await measureReceiptStackHeightCssPx(win, measureOpts)
  const minMicrons = MIN_PAGE_HEIGHT_MM * MICRONS_PER_MM
  const maxMicrons = MAX_PAGE_HEIGHT_MM * MICRONS_PER_MM
  const scaled = Math.round(px * MICRONS_PER_CSS_PX + 2 * MICRONS_PER_MM)
  return clamp(scaled, minMicrons, maxMicrons)
}

function getProbeWindow(): BrowserWindow {
  if (!printerProbe || printerProbe.isDestroyed()) {
    printerProbe = new BrowserWindow({
      show: false,
      width: 200,
      height: 200,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      }
    })
  }
  return printerProbe
}

/**
 * Entre deux unitaires dans la même fenêtre : le spouleur enchaîne les jobs ; 0 = enchaînement direct.
 */
const BETWEEN_UNIT_TICKET_IN_BATCH_MS = 0

/** Entre deux segments du ticket récap découpé (même logique que les tickets unitaires). */
const BETWEEN_SUMMARY_RECEIPT_CHUNK_MS = 200

/**
 * Après `webContents.print()`, Electron peut rappeler avant que le spouleur Windows ait fini de
 * prendre en charge le GDI/job — détruire la fenêtre tout de suite annule souvent l’impression et peut
 * faire « tomber » le spouleur / USB. On attend un peu avant fermeture.
 */
const BEFORE_CLOSE_AFTER_PRINT_MS_SUMMARY = 480
/** Ticket unitaire : job petit, délai plus court tout en laissant passer le job au spouleur. */
const BEFORE_CLOSE_AFTER_PRINT_MS_UNIT = 260
/** Autre HTML (rare) : valeur intermédiaire. */
const BEFORE_CLOSE_AFTER_PRINT_MS_DEFAULT = 400

/** Mise en page après load : le récap est lourd ; le ticket unitaire est léger (mesure attend déjà les images). */
const LAYOUT_SETTLE_MS_SUMMARY = 820
const LAYOUT_SETTLE_MS_UNIT = 180
/** Série de tickets unitaires : pas d’attente fixe — mesure + double rAF suffisent (gain sensible vs 1 job). */
const LAYOUT_SETTLE_MS_UNIT_BATCH = 0
const LAYOUT_SETTLE_MS_DEFAULT = 480

/** Logo data-URL : décodage rapide ; éviter 3,5 s de plafond par image en série. */
const MEASURE_IMAGE_WAIT_MS_UNIT_BATCH = 450

export async function listPrinters(): Promise<{ name: string; displayName: string }[]> {
  const w = getProbeWindow()
  const list = await w.webContents.getPrintersAsync()
  return list.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name
  }))
}

/** Charge le HTML sans écrire le disque quand c’est raisonnable (séries de tickets plus fluides). */
export async function loadReceiptHtmlIntoWindow(
  win: BrowserWindow,
  html: string,
  tmpPath: string
): Promise<void> {
  const maxDataUrlChars = 1_200_000
  if (html.length <= maxDataUrlChars) {
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      return
    } catch {
      /* URL trop longue ou refus navigateur → fichier */
    }
  }
  writeFileSync(tmpPath, html, 'utf-8')
  await win.loadFile(tmpPath)
}

export function createReceiptUnitTicketWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: RECEIPT_WINDOW_WIDTH_PX,
    height: 480,
    minWidth: RECEIPT_WINDOW_WIDTH_PX,
    minHeight: 120,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })
}

/**
 * Charge le HTML dans la fenêtre, mesure, imprime (une étape d’un flux unitaire ou un document isolé).
 */
async function loadAndPrintReceiptInWindow(
  win: BrowserWindow,
  tmpPath: string,
  html: string,
  layoutSettleMs: number,
  deviceName: string | null,
  silent: boolean,
  measureOpts?: { imageWaitMs?: number }
): Promise<{ ok: boolean; error?: string }> {
  await loadReceiptHtmlIntoWindow(win, html, tmpPath)
  if (layoutSettleMs > 0) {
    await new Promise<void>((r) => setTimeout(r, layoutSettleMs))
  }
  const pageHeightMicrons = await measureReceiptStackHeightMicrons(win, measureOpts)

  const opts: Electron.WebContentsPrintOptions = {
    silent,
    printBackground: true,
    margins: { marginType: 'none' },
    pageSize: {
      width: PAGE_WIDTH_MICRONS,
      height: pageHeightMicrons
    }
  }
  if (deviceName && deviceName.trim()) {
    opts.deviceName = deviceName.trim()
  }

  return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    win.webContents.print(opts, (success, failureReason) => {
      resolve({ ok: success, error: success ? undefined : failureReason })
    })
  })
}

/**
 * Un job d’impression par ticket unitaire (HTML à une seule section).
 * Une seule fenêtre cachée pour toute la commande : enchaînement direct au spouleur, sans recréer la fenêtre.
 */
export async function printUnitTicketsToDevice(
  tickets: TicketUnitPayload[],
  logoDataUrl: string | null,
  deviceName: string | null,
  silent = true,
  docOptions?: UnitTicketsDocumentOptions
): Promise<{ ok: boolean; error?: string }> {
  if (tickets.length === 0) return { ok: true }
  const opts: UnitTicketsDocumentOptions = {
    logoWidthPercent: docOptions?.logoWidthPercent ?? 100,
    validityNotice: docOptions?.validityNotice,
    unitTicketShowLogo: docOptions?.unitTicketShowLogo,
    unitTicketShowDateTime: docOptions?.unitTicketShowDateTime,
    unitTicketShowAssociationName: docOptions?.unitTicketShowAssociationName
  }

  const win = createReceiptUnitTicketWindow()
  try {
    for (let i = 0; i < tickets.length; i++) {
      const tmpPath = join(
        tmpdir(),
        `caisse-print-${Date.now()}-${randomBytes(8).toString('hex')}.html`
      )
      try {
        const html = buildTicketsDocument([tickets[i]], logoDataUrl, opts)
        const r = await loadAndPrintReceiptInWindow(
          win,
          tmpPath,
          html,
          LAYOUT_SETTLE_MS_UNIT_BATCH,
          deviceName,
          silent,
          { imageWaitMs: MEASURE_IMAGE_WAIT_MS_UNIT_BATCH }
        )
        if (!r.ok) return r
      } finally {
        try {
          unlinkSync(tmpPath)
        } catch {
          /* ignore */
        }
      }
      if (i < tickets.length - 1 && BETWEEN_UNIT_TICKET_IN_BATCH_MS > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, BETWEEN_UNIT_TICKET_IN_BATCH_MS))
      }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  } finally {
    await new Promise<void>((r) => setTimeout(r, BEFORE_CLOSE_AFTER_PRINT_MS_UNIT))
    try {
      if (!win.isDestroyed()) win.destroy()
    } catch {
      /* ignore */
    }
  }
}

/** Imprime un document HTML construit par `buildTicketsDocument` / `buildSummaryReceiptDocument`. */
export async function printReceiptDocument(
  html: string,
  deviceName: string | null,
  silent = true
): Promise<{ ok: boolean; error?: string }> {
  const tmpPath = join(
    tmpdir(),
    `caisse-print-${Date.now()}-${randomBytes(8).toString('hex')}.html`
  )

  const isSummary = html.includes('receipt-full')
  const isUnitTicket = html.includes('ticket-unit')
  const layoutSettleMs = isSummary
    ? LAYOUT_SETTLE_MS_SUMMARY
    : isUnitTicket
      ? LAYOUT_SETTLE_MS_UNIT
      : LAYOUT_SETTLE_MS_DEFAULT
  const beforeCloseMs = isSummary
    ? BEFORE_CLOSE_AFTER_PRINT_MS_SUMMARY
    : isUnitTicket
      ? BEFORE_CLOSE_AFTER_PRINT_MS_UNIT
      : BEFORE_CLOSE_AFTER_PRINT_MS_DEFAULT

  const win = new BrowserWindow({
    show: false,
    width: RECEIPT_WINDOW_WIDTH_PX,
    /** Récap : fenêtre plus haute pour que la mesure #receipt-doc reflète tout le HTML. */
    height: isSummary ? 2200 : 480,
    minWidth: RECEIPT_WINDOW_WIDTH_PX,
    minHeight: 120,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  try {
    return await loadAndPrintReceiptInWindow(
      win,
      tmpPath,
      html,
      layoutSettleMs,
      deviceName,
      silent,
      isSummary ? undefined : isUnitTicket ? { imageWaitMs: 800 } : undefined
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  } finally {
    try {
      unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    await new Promise<void>((r) => setTimeout(r, beforeCloseMs))
    try {
      if (!win.isDestroyed()) win.destroy()
    } catch {
      /* ignore */
    }
  }
}

/** Imprime une série de documents HTML (récap découpé : un job par page). */
export async function printReceiptHtmlPages(
  htmlPages: string[],
  deviceName: string | null,
  silent = true
): Promise<{ ok: boolean; error?: string }> {
  if (htmlPages.length === 0) return { ok: true }
  for (let i = 0; i < htmlPages.length; i++) {
    const r = await printReceiptDocument(htmlPages[i], deviceName, silent)
    if (!r.ok) return r
    if (i < htmlPages.length - 1 && BETWEEN_SUMMARY_RECEIPT_CHUNK_MS > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, BETWEEN_SUMMARY_RECEIPT_CHUNK_MS))
    }
  }
  return { ok: true }
}

export async function htmlDocumentToPdf(html: string): Promise<
  { ok: true; pdf: Buffer } | { ok: false; error: string }
> {
  const tmpPath = join(
    tmpdir(),
    `caisse-pdf-${Date.now()}-${randomBytes(8).toString('hex')}.html`
  )

  const win = new BrowserWindow({
    show: false,
    width: RECEIPT_WINDOW_WIDTH_PX,
    height: 2400,
    minWidth: RECEIPT_WINDOW_WIDTH_PX,
    minHeight: 200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  try {
    writeFileSync(tmpPath, html, 'utf-8')
    await win.loadFile(tmpPath)
    await new Promise<void>((r) => setTimeout(r, 520))

    const raw = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: 'none' }
    })
    const pdf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
    return { ok: true, pdf }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  } finally {
    try {
      unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    win.destroy()
  }
}
