import { BrowserWindow, ipcMain, dialog, shell, app } from 'electron'
import { randomBytes } from 'crypto'
import { pathToFileURL } from 'url'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import { extname, join } from 'path'
import { writeFile } from 'fs/promises'
import type { AppPersistedData } from '../shared/catalog'
import {
  receiptLegalInfoFromAssociation,
  factoryResetPersistedDataPreservingAssociationIdentity,
  clampReceiptLogoWidthPercent
} from '../shared/catalog.js'
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
  readAssociationLogoDataUrl,
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
import { appendSale, applyEventMetadataToSales, clearSalesHistory, listSales } from './salesHistory'
import {
  buildSummaryReceiptPrintHtmlPages,
  listPrinters,
  printReceiptHtmlPages,
  printUnitTicketsToDevice
} from './printWindow'
import { buildHoldSlipDocument, unitTicketDocumentOptionsFromAssociation } from './cashReceipt/receiptDocuments.js'
import { printReceiptDocument } from './cashReceipt/index.js'
import { printUnitTicketsEscpos } from './thermalEscpos/index.js'
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
  associationSyncPerformCheck,
  associationSyncPerformDownloadApply,
  associationSyncPerformUpload
} from './associationSyncOps.js'
import {
  associationAutoSyncUploadAfterSale,
  restartAssociationAutoSyncLoop,
  setAssociationAutoSyncCartGate
} from './associationAutoSync.js'
import {
  checkLicenseMatchesActiveAssociation,
  getAssociationAccessGate,
  getLicenseStatusForIpc,
  testWebLicenseLookupFromForm,
  validateNewAssociationLicense
} from './caisseLicenseVerifier.js'
import {
  getOrCreateMachineId,
  loadLicense,
  maskLicenseKey,
  resolveWebLicenseCredentials,
  clearLicenseOnlineOkCache,
  saveLicenseOnlineOkFromLicense,
  saveWebLicenseConfig
} from './licenseStore.js'
import {
  licenseExpiredByDate,
  normalizeWebLicenseKey,
  webLicenseActivateAssociationsIfNeeded,
  webLicenseLookup,
  webLicenseFetchMachineInventory,
  type MachineInventoryLicenseApiRow,
  findLicenseAssociationRowByCode,
  webLicenseAssociationCodeLookup,
  webLicenseAssociationCreate,
  isWebLicenseMachineAlreadyActiveFailure,
  webLicenseActivate
} from './webLicenseClient.js'
import {
  pruneLocalAssociationsNotOnServer,
  syncLocalAssociationsFromLicense
} from './syncAssociationsFromLicense.js'
import { normalizeLicenseAssociationCode } from '../shared/associationCode.js'
import { runLicenseDataRefresh } from './licenseDataRefresh.js'
import { checkAssociationRequestResponsesForModal } from './associationRequestNotification.js'
import {
  markAssociationRequestResponseDismissed,
  trackAssociationRequestId
} from './associationRequestTracker.js'
import { webUpdateCheck, webUpdateDownloadToPath } from './webUpdateClient.js'
import {
  WEB_LICENSE_API_PUBLIC_BASE,
  resolveWebLicencesPublicProjectCode
} from '../shared/webLicenseEndpoint.js'
import { isAdminMasterPin } from './adminUnlock.js'

type MachineInventoryIpcRow = {
  licenseKey: string
  maskedKey: string
  status: string
  expiresAt: string | null
  /** Déjà reliée à ce poste (activation enregistrée pour cette machine). */
  linkedOnMachine: boolean
  /** Le serveur propose encore au moins un créneau d’activation (liste « disponibles »). */
  hasFreeActivationSlots: boolean
}

function mergeMachineLicenseInventoryRows(
  available: MachineInventoryLicenseApiRow[],
  usedOnMachine: MachineInventoryLicenseApiRow[]
): MachineInventoryIpcRow[] {
  const map = new Map<string, MachineInventoryIpcRow>()
  const putUsed = (r: MachineInventoryLicenseApiRow) => {
    const k = normalizeWebLicenseKey(r.license_key)
    if (!k) return
    const prev = map.get(k)
    if (prev) {
      prev.linkedOnMachine = true
      prev.status = r.status || prev.status
      if (r.expires_at) prev.expiresAt = r.expires_at
    } else {
      map.set(k, {
        licenseKey: k,
        maskedKey: maskLicenseKey(k),
        status: r.status,
        expiresAt: r.expires_at,
        linkedOnMachine: true,
        hasFreeActivationSlots: false
      })
    }
  }
  const putAvail = (r: MachineInventoryLicenseApiRow) => {
    const k = normalizeWebLicenseKey(r.license_key)
    if (!k) return
    const prev = map.get(k)
    if (prev) {
      prev.hasFreeActivationSlots = true
      prev.status = r.status || prev.status
      if (r.expires_at) prev.expiresAt = r.expires_at
    } else {
      map.set(k, {
        licenseKey: k,
        maskedKey: maskLicenseKey(k),
        status: r.status,
        expiresAt: r.expires_at,
        linkedOnMachine: false,
        hasFreeActivationSlots: true
      })
    }
  }
  for (const r of usedOnMachine) putUsed(r)
  for (const r of available) putAvail(r)
  return [...map.values()].sort((a, b) => a.licenseKey.localeCompare(b.licenseKey))
}

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
    (
      _e,
      payload:
        | {
            enabled?: boolean
            regenerateToken?: boolean
            tokenRequired?: boolean
            /** 1 = jeton exigé, 0 = jeton non exigé (fiable si `false` JSON / IPC est mal transmis) */
            remoteCaisseRequireToken?: 0 | 1
          }
        | undefined
    ) => {
      const d = loadPersistedData()
      if (payload?.enabled !== undefined) d.remoteCaisseEnabled = Boolean(payload.enabled)
      if (payload != null && typeof payload === 'object') {
        const p = payload as { remoteCaisseRequireToken?: unknown; tokenRequired?: unknown }
        if (p.remoteCaisseRequireToken === 0 || p.remoteCaisseRequireToken === 1) {
          d.remoteCaisseTokenRequired = p.remoteCaisseRequireToken === 1
        } else if ('tokenRequired' in p && typeof p.tokenRequired === 'boolean') {
          d.remoteCaisseTokenRequired = p.tokenRequired
        }
      }
      if (payload?.regenerateToken) d.remoteCaisseToken = randomBytes(24).toString('hex')
      if (
        d.remoteCaisseEnabled &&
        d.remoteCaisseTokenRequired !== false &&
        !d.remoteCaisseToken
      ) {
        d.remoteCaisseToken = randomBytes(24).toString('hex')
      }
      savePersistedData(d)
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('remote-caisse:refresh-data')
      }
      return {
        ok: true as const,
        token: d.remoteCaisseToken,
        enabled: d.remoteCaisseEnabled,
        tokenRequired: Boolean(d.remoteCaisseTokenRequired !== false)
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
    const visible = enriched
      .filter((x) => x.licenseAllowed)
      .map((x) => ({
        id: x.id,
        displayName: x.displayName,
        licenseAssociationCode: x.licenseAssociationCode
      }))
    const last =
      lastSelectedId && visible.some((x) => x.id === lastSelectedId) ? lastSelectedId : null
    const withLogos = visible.map((x) => ({
      ...x,
      logoDataUrl: readAssociationLogoDataUrl(x.id)
    }))
    return { ok: true as const, items: withLogos, lastSelectedId: last }
  })

  ipcMain.handle('associations:create', async (_e, payload: unknown) => {
    let displayName = ''
    let licenseAssociationCode: string | null | undefined
    let adminRequest = false
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
      if (o['adminRequest'] === true) adminRequest = true
    }
    const proposed = normalizeLicenseAssociationCode(
      typeof licenseAssociationCode === 'string' ? licenseAssociationCode : ''
    )
    if (!proposed) {
      return {
        ok: false as const,
        error: 'invalid_code' as const,
        message:
          'Indiquez un code association valide : 1 à 32 caractères (lettres, chiffres, tiret ou souligné), sans espaces.'
      }
    }
    const cred = resolveWebLicenseCredentials(loadLicense())
    if (!cred) {
      return {
        ok: false as const,
        error: 'license' as const,
        message: 'Aucune licence enregistrée. Complétez « Licence & activation » avant de créer une association.'
      }
    }

    const look0 = await webLicenseLookup(cred)
    if (!look0.ok) {
      return {
        ok: false as const,
        error: 'server' as const,
        message: look0.message ?? look0.error ?? 'Le serveur de licences est injoignable ou a refusé la vérification.'
      }
    }
    if (String(look0.license.status).toLowerCase() === 'revoked') {
      return {
        ok: false as const,
        error: 'license' as const,
        message: 'Licence révoquée sur le serveur.'
      }
    }
    if (licenseExpiredByDate(look0.license.expires_at)) {
      return {
        ok: false as const,
        error: 'license' as const,
        message: 'Licence expirée.'
      }
    }

    const inLicense = findLicenseAssociationRowByCode(look0.license, proposed)
    const codeCatalog = await webLicenseAssociationCodeLookup(cred, proposed)
    const inProjectCatalog = codeCatalog.ok && codeCatalog.exists
    const catalogName =
      inProjectCatalog && codeCatalog.ok && 'association' in codeCatalog && codeCatalog.association
        ? String((codeCatalog.association as { name?: string }).name ?? '').trim()
        : ''
    const codeAlreadyOnServer = inLicense != null || inProjectCatalog
    const serverDisplayName =
      inLicense != null
        ? String(inLicense.name ?? '').trim() || '—'
        : catalogName || '—'
    if (codeAlreadyOnServer && !adminRequest) {
      const orphanOnly = inLicense == null && inProjectCatalog
      return {
        ok: false as const,
        error: 'code_exists' as const,
        code: proposed,
        serverName: serverDisplayName,
        message: orphanOnly
          ? `Le code « ${proposed} » correspond à une fiche déjà enregistrée sur le serveur (${serverDisplayName}) mais n’est pas encore rattaché à cette clé de licence. Vous pouvez demander à l’administrateur d’y associer cette clé.`
          : `Le code « ${proposed} » est déjà enregistré sur le serveur pour l’association « ${serverDisplayName} ».`
      }
    }

    if (codeAlreadyOnServer && adminRequest) {
      const v = await validateNewAssociationLicense('', licenseAssociationCode, {
        adminNotifyForExistingCode: true
      })
      if (!v.ok) {
        return { ok: false as const, error: 'license' as const, message: v.reason }
      }
      const srv = await webLicenseAssociationCreate(cred, {
        name: displayName.trim().slice(0, 200) || 'Association',
        code: proposed,
        notifyAdmin: true
      })
      if (!srv.ok) {
        return {
          ok: false as const,
          error: 'server' as const,
          message: srv.message ?? (typeof srv.error === 'string' ? srv.error : undefined) ?? 'Le serveur n’a pas pu enregistrer la demande.'
        }
      }
      const okSrv = srv as { ok: true; message?: string; request_id?: number }
      const rid = typeof okSrv.request_id === 'number' && okSrv.request_id > 0 ? okSrv.request_id : null
      if (rid != null) {
        trackAssociationRequestId(rid)
      }
      const customMsg = typeof okSrv.message === 'string' ? okSrv.message : ''
      return {
        ok: true as const,
        result: 'admin_notified' as const,
        requestId: rid,
        message:
          (customMsg && customMsg.trim()) ||
          'Votre demande a été transmise à l’administrateur. Vous serez informé après traitement côté serveur.'
      }
    }

    const v = await validateNewAssociationLicense('', licenseAssociationCode, {
      requireRemoteNewAssociation: true
    })
    if (!v.ok) {
      return { ok: false as const, error: 'license' as const, message: v.reason }
    }
    const srv = await webLicenseAssociationCreate(cred, {
      name: displayName.trim().slice(0, 200) || 'Association',
      code: proposed
    })
    if (!srv.ok) {
      return {
        ok: false as const,
        error: 'server' as const,
        message: srv.message ?? srv.error ?? 'Le serveur a refusé la création de l’association.'
      }
    }
    const codeFromServer =
      srv.association && typeof srv.association.code === 'string'
        ? normalizeLicenseAssociationCode(srv.association.code)
        : proposed
    const finalCode = codeFromServer ?? proposed
    const r = createAssociation(displayName.trim().slice(0, 120) || 'Nouvelle caisse', finalCode)
    const machine = getOrCreateMachineId()
    const act = await webLicenseActivate(cred, machine, finalCode)
    if (!act.ok && !isWebLicenseMachineAlreadyActiveFailure(act)) {
      return {
        ok: false as const,
        error: 'activate' as const,
        message:
          act.message ??
          'L’association a été créée sur le serveur mais l’activation de ce poste a échoué. Réessayez depuis « Licence & activation ».'
      }
    }
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

  ipcMain.handle('association-request:check', async () => checkAssociationRequestResponsesForModal())

  ipcMain.handle('association-request:dismiss', async (_e, requestId: unknown) => {
    const id = typeof requestId === 'number' ? requestId : Number(requestId)
    if (!Number.isFinite(id) || id <= 0) {
      return { ok: false as const }
    }
    markAssociationRequestResponseDismissed(id)
    return { ok: true as const }
  })

  ipcMain.handle('app:get-paths', () => {
    const base = getInstallationInfo()
    const active = getActiveAssociationDataPaths()
    return {
      ...base,
      dataFile: active?.dataFile ?? null,
      salesHistoryFile: active?.salesFile ?? null,
      appVersion: app.getVersion()
    }
  })

  ipcMain.handle('license:get', () => getLicenseStatusForIpc())

  ipcMain.handle('license:set', async (_e, payload: unknown) => {
    try {
      if (payload === null || typeof payload !== 'object') {
        return { ok: false as const, message: 'Format de licence invalide.' }
      }
      const p = payload as Record<string, unknown>
      if ('web' in p && p.web === null) {
        saveWebLicenseConfig(null)
        return { ok: true as const }
      }
      let o: Record<string, unknown>
      if ('web' in p && p.web !== undefined && p.web !== null && typeof p.web === 'object') {
        o = p.web as Record<string, unknown>
      } else if (typeof p.projectCode === 'string' || typeof p.licenseKey === 'string') {
        o = p
      } else {
        return { ok: false as const, message: 'Format de licence invalide.' }
      }
      const prev = loadLicense().web
      const merged = {
        projectCode: resolveWebLicencesPublicProjectCode(),
        licenseKey:
          (typeof o.licenseKey === 'string' && o.licenseKey.trim()
            ? normalizeWebLicenseKey(String(o.licenseKey))
            : '') || (prev?.licenseKey ? normalizeWebLicenseKey(prev.licenseKey) : '')
      }
      const cred = resolveWebLicenseCredentials({
        machineId: loadLicense().machineId,
        web: merged
      })
      if (!cred) {
        return {
          ok: false as const,
          message: 'Renseignez la clé de licence.'
        }
      }
      const look = await webLicenseLookup(cred)
      if (!look.ok) {
        return {
          ok: false as const,
          message: look.message ?? look.error ?? 'Le serveur a refusé la vérification (license-lookup).'
        }
      }
      syncLocalAssociationsFromLicense(look.license)
      pruneLocalAssociationsNotOnServer(look.license)
      const machine = getOrCreateMachineId()
      const batch = await webLicenseActivateAssociationsIfNeeded(cred, machine, look.license)
      if (!batch.ok) {
        return {
          ok: false as const,
          message: batch.message ?? 'Activation sur le serveur refusée (license-activate).'
        }
      }
      saveWebLicenseConfig(merged)
      return { ok: true as const }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false as const, message: `Erreur lors de l’enregistrement : ${msg}` }
    }
  })

  ipcMain.handle('license:refresh-data', () => runLicenseDataRefresh())

  ipcMain.handle(
    'license:test-api',
    async (_e, payload: { projectCode?: string; licenseKey?: string } | unknown) => {
      const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      const prev = loadLicense().web
      const projectCode = resolveWebLicencesPublicProjectCode()
      const licenseKeyRaw = typeof o.licenseKey === 'string' ? o.licenseKey.trim() : ''
      const licenseKey =
        licenseKeyRaw.length > 0
          ? normalizeWebLicenseKey(licenseKeyRaw)
          : prev?.licenseKey
            ? normalizeWebLicenseKey(prev.licenseKey)
            : ''
      const cred = resolveWebLicenseCredentials({
        machineId: loadLicense().machineId,
        web: { projectCode, licenseKey }
      })
      if (!cred) {
        return {
          ok: false as const,
          message: 'Renseignez la clé pour lancer le test.'
        }
      }
      return testWebLicenseLookupFromForm(cred)
    }
  )

  ipcMain.handle('license:machine-inventory', async (_e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const adminPasswordRaw = typeof o.adminPassword === 'string' ? o.adminPassword : ''
    const adminPassword = adminPasswordRaw.trim()
    if (!adminPassword) {
      return { ok: false as const, message: 'Saisissez le code administrateur du serveur de licences.', code: 'missing_admin' }
    }
    const projectCode = resolveWebLicencesPublicProjectCode()
    const machineId = getOrCreateMachineId()
    const inv = await webLicenseFetchMachineInventory({
      apiBaseUrl: WEB_LICENSE_API_PUBLIC_BASE,
      projectCode,
      adminPassword,
      machineId
    })
    if (!inv.ok) {
      const msg =
        inv.message ??
        (inv.error === 'forbidden'
          ? 'Code administrateur refusé par le serveur.'
          : 'Impossible de récupérer l’inventaire des licences.')
      return {
        ok: false as const,
        message: msg,
        ...(typeof inv.error === 'string' ? { code: inv.error } : {})
      }
    }
    const rows = mergeMachineLicenseInventoryRows(inv.available_licenses, inv.used_on_this_machine)
    return { ok: true as const, rows, machineId }
  })

  ipcMain.handle('license:check-association', () => checkLicenseMatchesActiveAssociation())

  ipcMain.handle('update:check', async (_e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const projectCode = resolveWebLicencesPublicProjectCode()
    const currentVersion =
      typeof o.currentVersion === 'string' && o.currentVersion.trim() !== ''
        ? o.currentVersion.trim()
        : app.getVersion()
    const r = await webUpdateCheck(WEB_LICENSE_API_PUBLIC_BASE, projectCode, currentVersion)
    if (!r.ok) {
      return { ok: false as const, message: r.message ?? 'Erreur lors de la vérification de mise à jour.' }
    }
    return {
      ok: true as const,
      update_available: r.update_available,
      version_compare: r.version_compare,
      version_compare_failed: r.version_compare_failed,
      latest: r.latest,
      download_endpoint: r.download_endpoint
    }
  })

  ipcMain.handle('update:download', async (e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const ridRaw = o.releaseId
    const releaseId =
      typeof ridRaw === 'number' && Number.isFinite(ridRaw)
        ? Math.floor(ridRaw)
        : typeof ridRaw === 'string'
          ? parseInt(ridRaw, 10)
          : NaN
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return { ok: false as const, message: 'Identifiant de version (release_id) invalide.' }
    }
    const projectCode = resolveWebLicencesPublicProjectCode()
    const suggestedRaw =
      typeof o.suggestedFilename === 'string' && o.suggestedFilename.trim()
        ? o.suggestedFilename.trim().replace(/[/\\]/g, '_')
        : `mise-a-jour-${releaseId}.msi`
    const win = BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Enregistrer l’installateur',
      defaultPath: suggestedRaw
    })
    if (canceled || !filePath) {
      return { ok: false as const, cancelled: true as const, message: 'Téléchargement annulé.' }
    }
    const dl = await webUpdateDownloadToPath({
      apiBaseUrl: WEB_LICENSE_API_PUBLIC_BASE,
      projectCode,
      releaseId,
      destPath: filePath
    })
    if (!dl.ok) {
      try {
        unlinkSync(filePath)
      } catch {
        /* ignore */
      }
      return { ok: false as const, message: dl.message }
    }
    shell.showItemInFolder(filePath)
    return { ok: true as const, filePath }
  })

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

  ipcMain.handle('association-sync:check', async () => associationSyncPerformCheck())

  ipcMain.handle('association-sync:upload', async (_e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const pin = typeof o.pin === 'string' ? o.pin : ''
    return associationSyncPerformUpload(pin)
  })

  ipcMain.handle('association-sync:download-apply', async (_e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const pin = typeof o.pin === 'string' ? o.pin : ''
    return associationSyncPerformDownloadApply(pin)
  })

  ipcMain.handle('association-sync:set-cart-gate', (_e, payload: unknown) => {
    const o = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    setAssociationAutoSyncCartGate({
      hasCartLines: o.hasCartLines === true,
      paymentOpen: o.paymentOpen === true
    })
    return { ok: true as const }
  })

  ipcMain.handle('association-sync:restart-loop', () => {
    restartAssociationAutoSyncLoop()
    return { ok: true as const }
  })

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
    void associationAutoSyncUploadAfterSale()
  })

  ipcMain.handle('history:list', () => listSales())

  ipcMain.handle(
    'history:sync-event-metadata',
    (
      _e,
      payload: { eventId: string; eventName: string; eventDate: string; eventNotes: string }
    ) =>
      applyEventMetadataToSales(payload.eventId, {
        eventName: payload.eventName,
        eventDate: payload.eventDate,
        eventNotes: payload.eventNotes
      })
  )

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
      const silent = payload.silent !== false
      const persisted = loadPersistedData()
      const docOpts = unitTicketDocumentOptionsFromAssociation(persisted.association)
      if (persisted.printing.unitTicketEngine === 'escpos_raw') {
        return printUnitTicketsEscpos(payload.tickets, payload.deviceName, {
          ...docOpts,
          logoDataUrl: payload.logoDataUrl,
          escposPaperWidth: persisted.printing.escposPaperWidth,
          escposCutMode: persisted.printing.escposCutMode,
          escposCutInverted: persisted.printing.escposCutInverted
        })
      }
      return printUnitTicketsToDevice(
        payload.tickets,
        payload.logoDataUrl,
        payload.deviceName,
        silent,
        docOpts
      )
    }
  )

  ipcMain.handle(
    'print:hold-slip',
    async (
      _e,
      payload: {
        ticketLabel: string
        associationName: string
        eventName: string
        atIso: string
        deviceName: string | null
        logoDataUrl: string | null
        silent?: boolean
      }
    ) => {
      try {
        const data = loadPersistedData()
        const docOpts = unitTicketDocumentOptionsFromAssociation(data.association)
        const html = buildHoldSlipDocument(
          {
            ticketLabel: payload.ticketLabel.trim(),
            associationName: payload.associationName,
            eventName: payload.eventName,
            atIso: payload.atIso
          },
          payload.logoDataUrl,
          docOpts
        )
        const silent = payload.silent !== false
        return await printReceiptDocument(html, payload.deviceName, silent)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
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
      try {
        const data = loadPersistedData()
        const legal = receiptLegalInfoFromAssociation(data.association)
        const pages = buildSummaryReceiptPrintHtmlPages(payload.sale, payload.logoDataUrl, legal, {
          logoWidthPercent: clampReceiptLogoWidthPercent(data.association.receiptLogoWidthPercent)
        })
        const silent = payload.silent !== false
        return await printReceiptHtmlPages(pages, payload.deviceName, silent)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { ok: false, error: msg }
      }
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
