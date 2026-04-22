import { BrowserWindow } from 'electron'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'

let printerProbe: BrowserWindow | null = null

/** Dimensions page pour Chromium (unités : micromètres, 1 mm = 1000) */
const MICRONS_PER_MM = 1000

/** Largeur ticket thermique (CSS + pageSize print) */
export const TICKET_WIDTH_MM = 70

const RECEIPT_PAGE_MICRONS = {
  width: TICKET_WIDTH_MM * MICRONS_PER_MM,
  height: 1200 * MICRONS_PER_MM
}

/** Largeur fenêtre ≈ ticket à 96 dpi — évite un layout trop étroit / décalé à l’impression */
const RECEIPT_WINDOW_WIDTH_PX = Math.round((TICKET_WIDTH_MM * 96) / 25.4)

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

export async function listPrinters(): Promise<{ name: string; displayName: string }[]> {
  const w = getProbeWindow()
  const list = await w.webContents.getPrintersAsync()
  return list.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name
  }))
}

/**
 * Fenêtre dimensionnée pour que le layout ne soit pas « vide » côté print pipeline.
 * pageSize + margins explicites : certains pilotes (thermique, redirecteurs) ne renvoient
 * pas de zone imprimable sans ça → erreur device_event_log « content size is empty ».
 */
export async function printHtmlDocument(
  html: string,
  deviceName: string | null,
  silent = true
): Promise<{ ok: boolean; error?: string }> {
  const tmpPath = join(
    tmpdir(),
    `caisse-print-${Date.now()}-${randomBytes(8).toString('hex')}.html`
  )

  const win = new BrowserWindow({
    show: false,
    width: RECEIPT_WINDOW_WIDTH_PX,
    height: 1100,
    minWidth: RECEIPT_WINDOW_WIDTH_PX,
    minHeight: 400,
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
    await new Promise((r) => setTimeout(r, 700))

    const opts: Electron.WebContentsPrintOptions = {
      silent,
      printBackground: true,
      /** Marges nulles : zone imprimable = largeur ticket (70 mm) */
      margins: { marginType: 'none' },
      pageSize: {
        width: RECEIPT_PAGE_MICRONS.width,
        height: RECEIPT_PAGE_MICRONS.height
      }
    }
    if (deviceName && deviceName.trim()) {
      opts.deviceName = deviceName
    }

    const printResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      win.webContents.print(opts, (success, failureReason) => {
        resolve({ ok: success, error: success ? undefined : failureReason })
      })
    })
    return printResult
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

/**
 * Rendu du même HTML que l’impression ticket en PDF (Chromium), pour pièce jointe e-mail.
 */
export async function htmlDocumentToPdf(
  html: string
): Promise<{ ok: true; pdf: Buffer } | { ok: false; error: string }> {
  const tmpPath = join(
    tmpdir(),
    `caisse-pdf-${Date.now()}-${randomBytes(8).toString('hex')}.html`
  )

  const win = new BrowserWindow({
    show: false,
    width: RECEIPT_WINDOW_WIDTH_PX,
    height: 1600,
    minWidth: RECEIPT_WINDOW_WIDTH_PX,
    minHeight: 400,
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
    await new Promise((r) => setTimeout(r, 700))

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
