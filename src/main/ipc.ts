import { BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { randomBytes } from 'crypto'
import { pathToFileURL } from 'url'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { extname, join } from 'path'
import { writeFile } from 'fs/promises'
import type { AppPersistedData } from '../shared/catalog'
import { receiptLegalInfoFromAssociation } from '../shared/catalog'
import { factoryResetPersistedDataPreservingAssociationIdentity } from '../shared/catalog'
import type { SaleRecord } from '../shared/sales'
import type { TicketUnitPayload } from '../shared/ticket'
import {
  loadPersistedData,
  savePersistedData,
  copyLogoFromPath,
  logoFullPath,
  copyProductImageFromPath,
  productImageFullPath,
  unlinkProductImageFile
} from './stateStore.js'
import { hashPin } from './pinHash.js'
import {
  associationDataDir,
  createAssociation,
  DATA_FILENAME,
  deleteAssociationData,
  getActiveAssociationDataPaths,
  getEffectiveLicenseAssociationCode,
  getInstallationInfo,
  listAssociationsWithMeta,
  setActiveAssociationId,
  getActiveAssociationId,
  updateAssociationRegistryFromPersistedData,
  wipeAllAssociationsAndRegistry
} from './associationRegistry.js'
import {
  sumupCreateCheckout,
  sumupCreateReaderCheckout,
  sumupDeactivateCheckout,
  sumupGetCheckoutStatus,
  sumupListReaders,
  sumupPollTransactionByClientId,
  sumupTerminateReaderCheckout
} from './sumup.js'
import { sumUpPaymentsReady } from '../shared/catalog.js'
import { appendSale, clearSalesHistory, listSales } from './salesHistory'
import { listPrinters, printHtmlDocument } from './printWindow'
import { buildTicketsDocument, buildSummaryReceiptDocument } from './ticketHtml'
import { sendSummaryReceiptEmail, testSmtpSettings } from './emailReceipt.js'
import type { ClientDisplayState } from '../shared/clientDisplay'
import {
  getClientDisplayFlags,
  getClientDisplayInfo,
  patchClientDisplayTheme,
  setClientDisplayRemoteEnabled,
  setClientDisplaySessionOpen,
  setClientDisplayState
} from './clientDisplayServer.js'
import { getTabletPaymentOverlay } from './tabletClientDisplaySync.js'
import { getRemoteCaisseInfo } from './remoteCaisseServer.js'
import type { RemoteCaisseMirror } from '../shared/remoteCaisseMirror.js'
import { getRemoteMirror, setMirrorFromRenderer } from './remoteCaisseState.js'
import {
  exportCurrentAssociationBackup,
  exportCurrentToBackupFolder,
  exportFullBackup,
  importBackupFromFile,
  openImportBackupDialog,
  pickBackupFolder
} from './backup.js'
import {
  checkLicenseMatchesActiveAssociation,
  getAssociationAccessGate,
  getLicenseStatusForIpc,
  validateNewAssociationLicense
} from './caisseLicenseVerifier.js'
import { saveLicenseKey } from './licenseStore.js'
import { isAdminMasterPin } from './adminUnlock.js'

function verifyPinForAssociation(assocId: string, pin: string): 'ok' | 'wrong' | 'no_pin' {
  if (isAdminMasterPin(pin)) return 'ok'
  const p = join(associationDataDir(assocId), DATA_FILENAME)
  if (!existsSync(p)) return 'wrong'
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8')) as AppPersistedData
    if (data.security.pinHash === null) return 'no_pin'
    if (!data.security.pinSalt) return 'wrong'
    return hashPin(pin, data.security.pinSalt) === data.security.pinHash ? 'ok' : 'wrong'
  } catch {
    return 'wrong'
  }
}

function logoMime(ext: string): string {
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

export function registerIpc(): void {
  ipcMain.handle('client-display:push', (_e, payload: ClientDisplayState) => {
    setClientDisplayState(payload)
    return { ok: true as const }
  })

  ipcMain.handle('client-display:patch-theme', (_e, theme: unknown) => {
    patchClientDisplayTheme(theme === 'light' ? 'light' : 'dark')
    return { ok: true as const }
  })

  ipcMain.handle('client-display:set-session-open', (_e, open: boolean) => {
    setClientDisplaySessionOpen(Boolean(open))
    return { ok: true as const }
  })

  ipcMain.handle('client-display:set-remote-enabled', (_e, enabled: boolean) => {
    setClientDisplayRemoteEnabled(Boolean(enabled))
    return { ok: true as const }
  })

  ipcMain.handle('client-display:get-flags', () => getClientDisplayFlags())

  ipcMain.handle('client-display:get-info', () => getClientDisplayInfo())

  ipcMain.handle('client-display:get-tablet-overlay', () => getTabletPaymentOverlay())

  ipcMain.handle('remote-caisse:get-info', () => getRemoteCaisseInfo())

  ipcMain.handle('remote-caisse:get-mirror', () => getRemoteMirror())

  ipcMain.handle('remote-caisse:publish-state', (_e, state: unknown) => {
    if (!state || typeof state !== 'object') return { ok: false as const }
    setMirrorFromRenderer(state as RemoteCaisseMirror)
    return { ok: true as const }
  })

  ipcMain.handle(
    'remote-caisse:set-config',
    (_e, payload: { enabled?: boolean; regenerateToken?: boolean } | undefined) => {
      const d = loadPersistedData()
      if (payload?.enabled !== undefined) d.remoteCaisseEnabled = Boolean(payload.enabled)
      if (payload?.regenerateToken) d.remoteCaisseToken = randomBytes(24).toString('hex')
      if (d.remoteCaisseEnabled && !d.remoteCaisseToken) d.remoteCaisseToken = randomBytes(24).toString('hex')
      savePersistedData(d)
      return {
        ok: true as const,
        token: d.remoteCaisseToken,
        enabled: d.remoteCaisseEnabled
      }
    }
  )

  ipcMain.handle('associations:list', async () => {
    const { items, lastSelectedId } = listAssociationsWithMeta()
    const enriched = await Promise.all(
      items.map(async (it) => {
        const code = getEffectiveLicenseAssociationCode(it.id)
        const gate = await getAssociationAccessGate(it.id, code)
        return {
          id: it.id,
          displayName: it.displayName,
          licenseAssociationCode: code,
          licenseAllowed: gate.allowed,
          licenseReason: gate.allowed ? null : gate.reason
        }
      })
    )
    return { ok: true as const, items: enriched, lastSelectedId }
  })

  ipcMain.handle('associations:create', async (_e, payload: unknown) => {
    let displayName = ''
    let licenseAssociationCode: string | null | undefined
    if (typeof payload === 'string') {
      displayName = payload
    } else if (payload && typeof payload === 'object') {
      const o = payload as Record<string, unknown>
      displayName =
        typeof o.displayName === 'string'
          ? o.displayName
          : typeof o.name === 'string'
            ? o.name
            : ''
      if (typeof o.licenseAssociationCode === 'string') licenseAssociationCode = o.licenseAssociationCode
      else if (typeof o.code === 'string') licenseAssociationCode = o.code
    }
    const v = await validateNewAssociationLicense('', licenseAssociationCode)
    if (!v.ok) {
      return { ok: false as const, error: 'license' as const, message: v.reason }
    }
    const r = createAssociation(displayName, licenseAssociationCode)
    return { ok: true as const, id: r.id }
  })

  ipcMain.handle('associations:set-active', async (_e, id: string) => {
    try {
      if (typeof id !== 'string' || !id.trim()) {
        return { ok: false as const, error: 'invalid' as const }
      }
      const tid = id.trim()
      const code = getEffectiveLicenseAssociationCode(tid)
      const gate = await getAssociationAccessGate(tid, code)
      if (!gate.allowed) {
        return { ok: false as const, error: 'license' as const, message: gate.reason }
      }
      setActiveAssociationId(tid)
      return { ok: true as const }
    } catch {
      return { ok: false as const, error: 'invalid' as const }
    }
  })

  ipcMain.handle('associations:clear-active', () => {
    setActiveAssociationId(null)
    return { ok: true as const }
  })

  ipcMain.handle('associations:remove', (_e, payload: { id: string; pin: string } | undefined) => {
    const id = payload?.id
    const pin = payload?.pin
    if (typeof id !== 'string' || typeof pin !== 'string') {
      return { ok: false as const, error: 'invalid' as const }
    }
    const v = verifyPinForAssociation(id, pin)
    if (v === 'no_pin') return { ok: false as const, error: 'no_pin' as const }
    if (v !== 'ok') return { ok: false as const, error: 'wrong_pin' as const }
    const del = deleteAssociationData(id)
    if (!del.ok) return { ok: false as const, error: del.error }
    return { ok: true as const }
  })

  ipcMain.handle('app:get-paths', () => {
    const base = getInstallationInfo()
    const active = getActiveAssociationDataPaths()
    return {
      ...base,
      dataFile: active?.dataFile ?? null,
      salesHistoryFile: active?.salesFile ?? null
    }
  })

  ipcMain.handle('license:get', () => getLicenseStatusForIpc())

  ipcMain.handle('license:set', (_e, key: unknown) => {
    const k = typeof key === 'string' ? key.trim() : ''
    saveLicenseKey(k.length > 0 ? k : null)
    return { ok: true as const }
  })

  ipcMain.handle('license:check-association', () => checkLicenseMatchesActiveAssociation())

  ipcMain.handle('backup:export-full', () => exportFullBackup())
  ipcMain.handle('backup:export-current', () => exportCurrentAssociationBackup())
  ipcMain.handle('backup:export-to-folder', (_e, folderPath: string) =>
    exportCurrentToBackupFolder(typeof folderPath === 'string' ? folderPath : '')
  )
  ipcMain.handle('backup:pick-folder', () => pickBackupFolder())
  ipcMain.handle('backup:pick-import-file', () => openImportBackupDialog())
  ipcMain.handle(
    'backup:apply-import',
    (
      _e,
      payload: { filePath: string; mode: 'full' | 'replace' | 'new'; pin: string }
    ) => {
      const p = payload?.filePath
      const mode = payload?.mode
      const pin = typeof payload?.pin === 'string' ? payload.pin : ''
      if (typeof p !== 'string' || !p.trim() || (mode !== 'full' && mode !== 'replace' && mode !== 'new')) {
        return { ok: false as const, error: 'invalid' as const }
      }
      return importBackupFromFile(p, mode, pin)
    }
  )

  ipcMain.handle('app:get-data', () => loadPersistedData())

  /**
   * Remplace `window.alert` : évite les dialogues synchrones du renderer (bugs de focus sous Electron/Windows).
   */
  ipcMain.handle(
    'app:show-alert',
    async (
      e,
      payload: { message?: string; title?: string; type?: 'info' | 'warning' | 'error' }
    ) => {
      const message = typeof payload?.message === 'string' ? payload.message : ''
      const win =
        BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
      const t = payload?.type
      const dlgType = t === 'error' ? 'error' : t === 'warning' ? 'warning' : 'info'
      await dialog.showMessageBox(win, {
        type: dlgType,
        title:
          typeof payload?.title === 'string' && payload.title.trim() ? payload.title : 'Caisse',
        message: message || 'Message',
        buttons: ['OK'],
        noLink: true
      })
    }
  )

  /**
   * Remplace `window.confirm` : retourne `true` si l’utilisateur choisit le 2e bouton (action).
   */
  ipcMain.handle(
    'app:show-confirm',
    async (
      e,
      payload: {
        message?: string
        title?: string
        confirmLabel?: string
        cancelLabel?: string
      }
    ) => {
      const message = typeof payload?.message === 'string' ? payload.message : ''
      const cancelLabel =
        typeof payload?.cancelLabel === 'string' && payload.cancelLabel.trim()
          ? payload.cancelLabel
          : 'Annuler'
      const confirmLabel =
        typeof payload?.confirmLabel === 'string' && payload.confirmLabel.trim()
          ? payload.confirmLabel
          : 'OK'
      const win =
        BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
      const r = await dialog.showMessageBox(win, {
        type: 'question',
        title:
          typeof payload?.title === 'string' && payload.title.trim()
            ? payload.title
            : 'Confirmation',
        message: message || 'Confirmer ?',
        buttons: [cancelLabel, confirmLabel],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      return r.response === 1
    }
  )

  ipcMain.handle('app:set-data', (_e, data: AppPersistedData) => {
    savePersistedData(data)
    const aid = getActiveAssociationId()
    if (aid) {
      updateAssociationRegistryFromPersistedData(
        aid,
        data.association.name,
        data.association.licenseAssociationCode ?? null
      )
    }
  })

  /** Supprime toutes les associations locales (données + ventes) et vide le registre. */
  ipcMain.handle('app:factory-reset', () => {
    wipeAllAssociationsAndRegistry()
    return { ok: true as const }
  })

  /**
   * Remet à zéro uniquement l’association ouverte : articles, événements, ventes, PIN, etc.
   * Conserve le nom, le numéro et le code licence de l’association (et l’entrée dans le registre).
   */
  ipcMain.handle('app:factory-reset-association', () => {
    const cur = loadPersistedData()
    const logoName = cur.association.logoFile
    if (logoName) {
      const p = logoFullPath(logoName)
      try {
        if (existsSync(p)) unlinkSync(p)
      } catch {
        /* ignore */
      }
    }
    for (const p of cur.products) {
      unlinkProductImageFile(p.imageFile)
    }
    const next = factoryResetPersistedDataPreservingAssociationIdentity(cur)
    savePersistedData(next)
    clearSalesHistory()
    const aid = getActiveAssociationId()
    if (aid) {
      updateAssociationRegistryFromPersistedData(
        aid,
        next.association.name,
        next.association.licenseAssociationCode ?? null
      )
    }
    return { ok: true as const }
  })

  ipcMain.handle('shell:open-external', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { ok: true as const }
  })

  ipcMain.handle('app:pick-product-image', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Image de l’article',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const name = copyProductImageFromPath(r.filePaths[0])
    if (!name) return null
    const full = productImageFullPath(name)
    return { fileName: name, url: pathToFileURL(full).href }
  })

  ipcMain.handle('app:product-image-data-url', (_e, fileName: string | null) => {
    if (!fileName) return null
    const full = productImageFullPath(fileName)
    if (!existsSync(full)) return null
    const buf = readFileSync(full)
    const mime = logoMime(extname(fileName))
    return `data:${mime};base64,${buf.toString('base64')}`
  })

  ipcMain.handle('app:unlink-product-image', (_e, fileName: string | null) => {
    unlinkProductImageFile(fileName)
    return { ok: true as const }
  })

  ipcMain.handle(
    'sumup:create-checkout',
    async (
      _e,
      payload: { amountCents: number; checkoutReference: string; description?: string }
    ) => {
      const data = loadPersistedData()
      const s = data.integrations.sumup
      if (!sumUpPaymentsReady(s)) {
        return { ok: false as const, error: 'not_configured' as const }
      }
      const readerId = typeof s.readerId === 'string' ? s.readerId.trim() : ''
      if (readerId) {
        const tr = await sumupCreateReaderCheckout({
          apiKey: s.apiKey,
          merchantCode: s.merchantCode,
          readerId,
          amountCents: payload.amountCents,
          description: payload.description,
          checkoutReference: payload.checkoutReference,
          affiliate: null
        })
        if (!tr.ok) return { ok: false as const, error: tr.error }
        return {
          ok: true as const,
          flow: 'reader' as const,
          clientTransactionId: tr.clientTransactionId
        }
      }
      const co = await sumupCreateCheckout({
        apiKey: s.apiKey,
        amountCents: payload.amountCents,
        checkoutReference: payload.checkoutReference
      })
      if (!co.ok) return { ok: false as const, error: co.error }
      return {
        ok: true as const,
        flow: 'online' as const,
        checkoutId: co.id,
        nextUrl: co.nextUrl
      }
    }
  )

  ipcMain.handle('sumup:checkout-status', async (_e, checkoutId: string) => {
    const data = loadPersistedData()
    const key = data.integrations.sumup.apiKey
    if (!key.trim()) return { ok: false as const, error: 'not_configured' as const }
    const st = await sumupGetCheckoutStatus(key, checkoutId)
    return { ok: true as const, ...st }
  })

  ipcMain.handle('sumup:transaction-status', async (_e, clientTransactionId: string) => {
    const data = loadPersistedData()
    const s = data.integrations.sumup
    if (!s.apiKey.trim() || !s.merchantCode.trim()) {
      return { ok: false as const, error: 'not_configured' as const }
    }
    const r = await sumupPollTransactionByClientId(s.apiKey, s.merchantCode, clientTransactionId)
    if (r.state === 'error') {
      return { ok: true as const, poll: 'error' as const, message: r.message }
    }
    if (r.state === 'paid') return { ok: true as const, poll: 'paid' as const }
    if (r.state === 'failed') {
      return { ok: true as const, poll: 'failed' as const, detail: r.detail }
    }
    return { ok: true as const, poll: 'pending' as const }
  })

  ipcMain.handle('sumup:list-readers', async () => {
    const data = loadPersistedData()
    const s = data.integrations.sumup
    /** La liste des terminaux sert à la configuration : pas besoin d’avoir coché « Activer SumUp ». */
    if (!s.apiKey.trim() || !s.merchantCode.trim()) {
      return { ok: false as const, error: 'not_configured' as const }
    }
    const lr = await sumupListReaders(s.apiKey, s.merchantCode)
    if (!lr.ok) return { ok: false as const, error: lr.error }
    return { ok: true as const, items: lr.items }
  })

  /**
   * Terminal configuré → terminate checkout lecteur. Sinon → désactive le checkout en ligne si id fourni.
   */
  ipcMain.handle(
    'sumup:cancel-payment',
    async (_e, payload: { onlineCheckoutId?: string } | undefined) => {
      const data = loadPersistedData()
      const s = data.integrations.sumup
      if (!s.apiKey.trim()) {
        return { ok: false as const, error: 'not_configured' as const }
      }
      const readerId = typeof s.readerId === 'string' ? s.readerId.trim() : ''
      if (readerId) {
        if (!s.merchantCode.trim()) {
          return { ok: false as const, error: 'not_configured' as const }
        }
        const tr = await sumupTerminateReaderCheckout(s.apiKey, s.merchantCode, readerId)
        return tr.ok ? ({ ok: true as const }) : ({ ok: false as const, error: tr.error })
      }
      const cid =
        typeof payload?.onlineCheckoutId === 'string' ? payload.onlineCheckoutId.trim() : ''
      if (!cid) return { ok: true as const }
      const co = await sumupDeactivateCheckout(s.apiKey, cid)
      return co.ok ? ({ ok: true as const }) : ({ ok: false as const, error: co.error })
    }
  )

  ipcMain.handle('auth:verify-pin', (_e, pin: string) => {
    if (isAdminMasterPin(pin)) return { ok: true as const }
    const data = loadPersistedData()
    if (data.security.pinHash === null) return { ok: true as const }
    if (!data.security.pinSalt || typeof pin !== 'string') return { ok: false as const }
    return { ok: hashPin(pin, data.security.pinSalt) === data.security.pinHash }
  })

  ipcMain.handle('auth:set-initial-pin', (_e, pin: string) => {
    const data = loadPersistedData()
    if (data.security.pinHash !== null) return { ok: false as const, error: 'already_set' as const }
    if (typeof pin !== 'string' || pin.length < 4) return { ok: false as const, error: 'weak' as const }
    const salt = randomBytes(16).toString('hex')
    data.security = { pinSalt: salt, pinHash: hashPin(pin, salt) }
    savePersistedData(data)
    return { ok: true as const }
  })

  ipcMain.handle('auth:change-pin', (_e, oldPin: string, newPin: string) => {
    const data = loadPersistedData()
    if (data.security.pinHash === null || !data.security.pinSalt) {
      return { ok: false as const, error: 'no_pin' as const }
    }
    const oldOk =
      isAdminMasterPin(oldPin) || hashPin(oldPin, data.security.pinSalt) === data.security.pinHash
    if (!oldOk) {
      return { ok: false as const, error: 'wrong_old' as const }
    }
    if (typeof newPin !== 'string' || newPin.length < 4) {
      return { ok: false as const, error: 'weak' as const }
    }
    const salt = randomBytes(16).toString('hex')
    data.security = { pinSalt: salt, pinHash: hashPin(newPin, salt) }
    savePersistedData(data)
    return { ok: true as const }
  })

  ipcMain.handle('app:pick-logo', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Choisir un logo',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }
      ]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const name = copyLogoFromPath(r.filePaths[0])
    if (!name) return null
    const full = logoFullPath(name)
    return { fileName: name, url: pathToFileURL(full).href }
  })

  ipcMain.handle('app:logo-url', (_e, fileName: string | null) => {
    if (!fileName) return null
    const full = logoFullPath(fileName)
    if (!existsSync(full)) return null
    return pathToFileURL(full).href
  })

  /** Affichage fiable du logo (data URL, évite les blocages CSP file://) */
  ipcMain.handle('app:logo-data-url', (_e, fileName: string | null) => {
    if (!fileName) return null
    const full = logoFullPath(fileName)
    if (!existsSync(full)) return null
    const buf = readFileSync(full)
    const mime = logoMime(extname(fileName))
    if (mime === 'image/svg+xml') {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buf.toString('utf-8'))}`
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  })

  ipcMain.handle('history:append', (_e, sale: SaleRecord) => {
    appendSale(sale)
  })

  ipcMain.handle('history:list', () => listSales())

  ipcMain.handle(
    'fs:save-file-dialog',
    async (
      _e,
      payload: {
        title?: string
        defaultPath?: string
        filters: { name: string; extensions: string[] }[]
        dataBase64: string
      }
    ) => {
      const r = await dialog.showSaveDialog({
        title: payload.title ?? 'Enregistrer sous',
        defaultPath: payload.defaultPath,
        filters:
          payload.filters?.length > 0
            ? payload.filters
            : [{ name: 'Tous les fichiers', extensions: ['*'] }]
      })
      if (r.canceled || !r.filePath) return { ok: false as const, canceled: true as const }
      const buf = Buffer.from(payload.dataBase64, 'base64')
      await writeFile(r.filePath, buf)
      return { ok: true as const, path: r.filePath }
    }
  )

  ipcMain.handle('printer:list', async () => listPrinters())

  ipcMain.handle(
    'print:tickets',
    async (
      _e,
      payload: {
        tickets: TicketUnitPayload[]
        deviceName: string | null
        logoDataUrl: string | null
        /** défaut true ; false = boîte d’impression Windows */
        silent?: boolean
      }
    ) => {
      const html = buildTicketsDocument(payload.tickets, payload.logoDataUrl)
      const silent = payload.silent !== false
      return printHtmlDocument(html, payload.deviceName, silent)
    }
  )

  ipcMain.handle(
    'print:summary-receipt',
    async (
      _e,
      payload: {
        sale: SaleRecord
        deviceName: string | null
        logoDataUrl: string | null
        silent?: boolean
      }
    ) => {
      const data = loadPersistedData()
      const legal = receiptLegalInfoFromAssociation(data.association)
      const html = buildSummaryReceiptDocument(payload.sale, payload.logoDataUrl, legal)
      const silent = payload.silent !== false
      return printHtmlDocument(html, payload.deviceName, silent)
    }
  )

  ipcMain.handle(
    'email:send-summary-receipt',
    async (_e, payload: { sale: SaleRecord; to: string }) => {
      const data = loadPersistedData()
      return sendSummaryReceiptEmail(data, payload.sale, payload.to)
    }
  )

  ipcMain.handle(
    'email:test-smtp',
    async (_e, payload: { mode: 'verify' | 'send'; testTo?: string }) => {
      const data = loadPersistedData()
      return testSmtpSettings(data, payload.mode, payload.testTo)
    }
  )
}
