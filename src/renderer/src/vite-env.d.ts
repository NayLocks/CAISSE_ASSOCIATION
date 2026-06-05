/// <reference types="vite/client" />

import type { AppPersistedData } from '@shared/catalog'
import type { RemoteCaisseMirror } from '@shared/remoteCaisseMirror'
import type { ClientDisplayState, ClientPaymentDetail } from '@shared/clientDisplay'
import type { SaleRecord } from '@shared/sales'
import type { TicketUnitPayload } from '@shared/ticket'

interface CaisseAPI {
  version: string
  listAssociations: () => Promise<{
    ok: true
    items: {
      id: string
      displayName: string
      licenseAssociationCode: string | null
      logoDataUrl: string | null
    }[]
    lastSelectedId: string | null
  }>
  createAssociation: (payload: {
    displayName: string
    licenseAssociationCode: string
    adminRequest?: boolean
  }) => Promise<
    | { ok: true; id: string }
    | { ok: true; result: 'admin_notified'; message: string; requestId: number | null }
    | {
        ok: false
        error: 'license' | 'invalid_code' | 'server' | 'activate' | 'code_exists'
        message: string
        code?: string
        serverName?: string
      }
  >
  associationRequestCheck: () => Promise<
    | { show: false }
    | { show: true; requestId: number; title: string; message: string; status: 'approved' | 'rejected' }
  >
  associationRequestDismiss: (requestId: number) => Promise<{ ok: true } | { ok: false }>
  setActiveAssociation: (id: string) => Promise<
    { ok: true } | { ok: false; error: 'invalid' | 'license'; message?: string }
  >
  clearActiveAssociation: () => Promise<{ ok: true }>
  removeAssociation: (payload: {
    id: string
    pin: string
  }) => Promise<
    | { ok: true }
    | {
        ok: false
        error: 'invalid' | 'wrong_pin' | 'no_pin' | 'not_found'
      }
  >
  getAppPaths: () => Promise<{
    userDataRoot: string
    exePath: string
    appPath: string
    dataFile: string | null
    salesHistoryFile: string | null
    appVersion: string
  }>
  updateCheck: (payload?: { currentVersion?: string }) => Promise<
    | {
        ok: true
        update_available: boolean | null
        version_compare: number | null
        version_compare_failed: boolean
        latest: {
          release_id: number
          version: string
          filename: string
          file_size: number
          created_at: string
        } | null
        download_endpoint: string
      }
    | { ok: false; message: string }
  >
  updateDownload: (payload: { releaseId: number; suggestedFilename?: string }) => Promise<
    { ok: true; filePath: string } | { ok: false; message: string; cancelled?: boolean }
  >
  getLicense: () => Promise<{
    hasKey: boolean
    maskedKey: string
    status: 'active' | 'inactive'
    displayStatus: 'inactive' | 'valid' | 'invalid' | 'unconfigured'
    mode: 'none' | 'web'
    verificationSource?: 'online' | 'offline_grace'
    offlineGrace?: { lastVerifiedAtMs: number; validUntilMs: number }
    reason?: string
    detail?: string
    payloadSummary?: {
      type: string
      expiresAt: string | null
      associationsLabel: string
    }
    webSettings?: {
      projectCode: string
      licenseKeyMasked: string
    }
  }>
  setLicense: (
    payload:
      | { web: null }
      | { web: { licenseKey: string; projectCode?: string } }
      | { licenseKey: string; projectCode?: string }
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  testLicenseApi: (payload: {
    licenseKey: string
    projectCode?: string
  }) => Promise<{ ok: true; message: string } | { ok: false; message: string }>
  licenseMachineInventory: (payload: { adminPassword: string }) => Promise<
    | {
        ok: true
        rows: {
          licenseKey: string
          maskedKey: string
          status: string
          expiresAt: string | null
          linkedOnMachine: boolean
          hasFreeActivationSlots: boolean
        }[]
        machineId: string
      }
    | { ok: false; message: string; code?: string }
  >
  licenseCheckAssociation: () => Promise<{ ok: true } | { ok: false; reason: string }>
  refreshLicenseData: () => Promise<{ ok: true; message: string } | { ok: false; message: string }>
  getData: () => Promise<AppPersistedData>
  setData: (data: AppPersistedData) => Promise<void>
  openExternal: (url: string) => Promise<{ ok: true }>
  showAlert: (payload: {
    message: string
    title?: string
    type?: 'info' | 'warning' | 'error'
  }) => Promise<void>
  showConfirm: (payload: {
    message: string
    title?: string
    confirmLabel?: string
    cancelLabel?: string
  }) => Promise<boolean>
  pickProductImage: () => Promise<{ fileName: string; url: string } | null>
  getProductImageDataUrl: (fileName: string | null) => Promise<string | null>
  unlinkProductImage: (fileName: string | null) => Promise<{ ok: true }>
  sumupCreateCheckout: (payload: {
    amountCents: number
    checkoutReference: string
    description?: string
  }) => Promise<
    | { ok: true; flow: 'reader'; clientTransactionId: string }
    | { ok: true; flow: 'online'; checkoutId: string; nextUrl?: string }
    | { ok: false; error: string | 'not_configured' }
  >
  sumupCheckoutStatus: (
    checkoutId: string
  ) => Promise<
    | { ok: true; status: string; paid: boolean; error?: string }
    | { ok: false; error: 'not_configured' }
  >
  sumupTransactionStatus: (clientTransactionId: string) => Promise<
    | { ok: true; poll: 'paid' | 'pending' | 'failed'; detail?: string }
    | { ok: true; poll: 'error'; message: string }
    | { ok: false; error: 'not_configured' }
  >
  sumupListReaders: () => Promise<
    | {
        ok: true
        items: { id: string; name: string; status: string; model: string | null }[]
      }
    | { ok: false; error: string | 'not_configured' }
  >
  sumupCancelPayment: (payload?: { onlineCheckoutId?: string }) => Promise<
    { ok: true } | { ok: false; error: string | 'not_configured' }
  >
  pickLogo: () => Promise<{ fileName: string; url: string } | null>
  logoUrl: (fileName: string | null) => Promise<string | null>
  getLogoDataUrl: (fileName: string | null) => Promise<string | null>
  appendSale: (sale: SaleRecord) => Promise<void>
  listSales: () => Promise<SaleRecord[]>
  syncEventSalesMetadata: (payload: {
    eventId: string
    eventName: string
    eventDate: string
    eventNotes: string
  }) => Promise<{ updated: number }>
  listPrinters: () => Promise<{ name: string; displayName: string }[]>
  printTickets: (payload: {
    tickets: TicketUnitPayload[]
    deviceName: string | null
    logoDataUrl: string | null
    silent?: boolean
  }) => Promise<{ ok: boolean; error?: string }>
  printHoldSlip: (payload: {
    ticketLabel: string
    associationName: string
    eventName: string
    atIso: string
    deviceName: string | null
    logoDataUrl: string | null
    silent?: boolean
  }) => Promise<{ ok: boolean; error?: string }>
  printSummaryReceipt: (payload: {
    sale: SaleRecord
    deviceName: string | null
    logoDataUrl: string | null
    silent?: boolean
  }) => Promise<{ ok: boolean; error?: string }>
  sendSummaryReceiptEmail: (payload: {
    sale: SaleRecord
    to: string
  }) => Promise<{ ok: true } | { ok: false; error: string }>
  testEmailSmtp: (payload: {
    mode: 'verify' | 'send'
    testTo?: string
  }) => Promise<{ ok: true; message: string } | { ok: false; error: string }>
  saveFileWithDialog: (payload: {
    title?: string
    defaultPath?: string
    filters: { name: string; extensions: string[] }[]
    dataBase64: string
  }) => Promise<{ ok: true; path: string } | { ok: false; canceled?: boolean }>
  verifyPin: (pin: string) => Promise<{ ok: boolean }>
  setInitialPin: (pin: string) => Promise<
    { ok: true } | { ok: false; error: 'already_set' | 'weak' }
  >
  changePin: (
    oldPin: string,
    newPin: string
  ) => Promise<{ ok: true } | { ok: false; error: 'no_pin' | 'wrong_old' | 'weak' }>
  factoryReset: () => Promise<{ ok: true }>
  factoryResetAssociation: () => Promise<{ ok: true }>
  pushClientDisplay: (state: ClientDisplayState) => Promise<{ ok: true }>
  patchClientDisplayTheme: (theme: 'dark' | 'light') => Promise<{ ok: true }>
  getClientDisplayInfo: () => Promise<{ port: number; urls: string[] }>
  setClientDisplaySessionOpen: (open: boolean) => Promise<{ ok: true }>
  setClientDisplayRemoteEnabled: (enabled: boolean) => Promise<{ ok: true }>
  getClientDisplayFlags: () => Promise<{ remoteEnabled: boolean; sessionOpen: boolean }>
  getTabletPaymentOverlay: () => Promise<{
    active: boolean
    detail: ClientPaymentDetail | null
  }>
  onTabletPaymentOverlay: (cb: () => void) => () => void
  getRemoteCaisseInfo: () => Promise<{ port: number; urls: string[] }>
  remoteCaisseGetMirror: () => Promise<RemoteCaisseMirror>
  remoteCaissePublishState: (state: RemoteCaisseMirror) => Promise<{ ok: boolean }>
  remoteCaisseSetConfig: (payload: {
    enabled?: boolean
    regenerateToken?: boolean
    tokenRequired?: boolean
    remoteCaisseRequireToken?: 0 | 1
  }) => Promise<{ ok: true; token: string | null; enabled: boolean; tokenRequired: boolean }>
  onRemoteCaisseStateSync: (cb: (state: RemoteCaisseMirror) => void) => () => void
  onRemoteCaisseRefreshData: (cb: () => void) => () => void
  onRemoteCaisseSaleDone: (cb: (p: { orderNumber: number; totalCents: number }) => void) => () => void
  backupExportFull: () => Promise<
    | { ok: true; path: string }
    | { ok: false; canceled: true }
    | { ok: false; error: string }
  >
  backupExportCurrent: () => Promise<
    | { ok: true; path: string }
    | { ok: false; canceled: true }
    | { ok: false; error: string }
  >
  backupExportToFolder: (folderPath: string) => Promise<
    { ok: true; path: string } | { ok: false; error: string }
  >
  backupPickFolder: () => Promise<{ ok: true; path: string } | { ok: false; canceled: true }>
  backupPickImportFile: () => Promise<
    { ok: true; filePath: string } | { ok: false; canceled: true }
  >
  backupApplyImport: (payload: {
    filePath: string
    mode: 'full' | 'replace' | 'new'
    pin: string
  }) => Promise<{ ok: true; reload: boolean } | { ok: false; error: string }>
  associationSyncCheck: () => Promise<
    | {
        ok: true
        localRevision: number | null
        check: {
          has_server_snapshot: boolean
          server_revision: number | null
          client_current_revision: number | null
          needs_download: boolean | null
          client_is_aligned_with_server: boolean | null
          file_size: number | null
          sha256_hex: string | null
          updated_at: string | null
          download_endpoint?: string | null
          hint?: string | null
        }
      }
    | { ok: false; message: string; code?: string }
  >
  associationSyncUpload: (payload: { pin: string }) => Promise<
    { ok: true; revision: number; message: string } | { ok: false; message: string; code?: string }
  >
  associationSyncDownloadApply: (payload: { pin: string }) => Promise<
    { ok: true; revision: number; message: string } | { ok: false; message: string; code?: string }
  >
  associationSyncSetCartGate: (payload: {
    hasCartLines: boolean
    paymentOpen: boolean
  }) => Promise<{ ok: true }>
  associationSyncRestartLoop: () => Promise<{ ok: true }>
  onAssociationAutoSyncStatus: (cb: (payload: { banner: string | null }) => void) => () => void
  onAssociationSyncDataApplied: (cb: () => void) => () => void
}

declare global {
  interface Window {
    caisse: CaisseAPI
  }
}

export {}
