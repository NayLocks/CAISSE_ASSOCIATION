import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('caisse', {
  version: '1.6.0',
  listAssociations: () =>
    ipcRenderer.invoke('associations:list') as Promise<{
      ok: true
      items: {
        id: string
        displayName: string
        licenseAssociationCode: string | null
        licenseAllowed: boolean
        licenseReason: string | null
      }[]
      lastSelectedId: string | null
    }>,
  createAssociation: (payload: { displayName: string; licenseAssociationCode: string }) =>
    ipcRenderer.invoke('associations:create', payload) as Promise<
      { ok: true; id: string } | { ok: false; error: 'license'; message: string }
    >,
  setActiveAssociation: (id: string) =>
    ipcRenderer.invoke('associations:set-active', id) as Promise<
      { ok: true } | { ok: false; error: 'invalid' | 'license'; message?: string }
    >,
  clearActiveAssociation: () =>
    ipcRenderer.invoke('associations:clear-active') as Promise<{ ok: true }>,
  removeAssociation: (payload: { id: string; pin: string }) =>
    ipcRenderer.invoke('associations:remove', payload) as Promise<
      | { ok: true }
      | {
          ok: false
          error: 'invalid' | 'wrong_pin' | 'no_pin' | 'not_found'
        }
    >,
  getAppPaths: () =>
    ipcRenderer.invoke('app:get-paths') as Promise<{
      userDataRoot: string
      exePath: string
      appPath: string
      dataFile: string | null
      salesHistoryFile: string | null
    }>,
  getLicense: () =>
    ipcRenderer.invoke('license:get') as Promise<{
      hasKey: boolean
      maskedKey: string
      status: 'active' | 'inactive'
      displayStatus: 'inactive' | 'valid' | 'invalid' | 'unconfigured'
      mode: 'none' | 'long' | 'short'
      reason?: string
      detail?: string
      payloadSummary?: {
        type: string
        expiresAt: string | null
        associationsLabel: string
      }
      keysHint?: string
    }>,
  setLicense: (key: string) => ipcRenderer.invoke('license:set', key) as Promise<{ ok: true }>,
  licenseCheckAssociation: () =>
    ipcRenderer.invoke('license:check-association') as Promise<
      { ok: true } | { ok: false; reason: string }
    >,
  getData: () => ipcRenderer.invoke('app:get-data'),
  setData: (data: unknown) => ipcRenderer.invoke('app:set-data', data),
  factoryReset: () => ipcRenderer.invoke('app:factory-reset') as Promise<{ ok: true }>,
  factoryResetAssociation: () =>
    ipcRenderer.invoke('app:factory-reset-association') as Promise<{ ok: true }>,
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url) as Promise<{ ok: true }>,
  showAlert: (payload: {
    message: string
    title?: string
    type?: 'info' | 'warning' | 'error'
  }) => ipcRenderer.invoke('app:show-alert', payload) as Promise<void>,
  showConfirm: (payload: {
    message: string
    title?: string
    confirmLabel?: string
    cancelLabel?: string
  }) => ipcRenderer.invoke('app:show-confirm', payload) as Promise<boolean>,
  pickProductImage: () =>
    ipcRenderer.invoke('app:pick-product-image') as Promise<{
      fileName: string
      url: string
    } | null>,
  getProductImageDataUrl: (fileName: string | null) =>
    ipcRenderer.invoke('app:product-image-data-url', fileName) as Promise<string | null>,
  unlinkProductImage: (fileName: string | null) =>
    ipcRenderer.invoke('app:unlink-product-image', fileName) as Promise<{ ok: true }>,
  sumupCreateCheckout: (payload: {
    amountCents: number
    checkoutReference: string
    description?: string
  }) =>
    ipcRenderer.invoke('sumup:create-checkout', payload) as Promise<
      | { ok: true; flow: 'reader'; clientTransactionId: string }
      | { ok: true; flow: 'online'; checkoutId: string; nextUrl?: string }
      | { ok: false; error: string | 'not_configured' }
    >,
  sumupCheckoutStatus: (checkoutId: string) =>
    ipcRenderer.invoke('sumup:checkout-status', checkoutId) as Promise<
      | { ok: true; status: string; paid: boolean; error?: string }
      | { ok: false; error: 'not_configured' }
    >,
  sumupTransactionStatus: (clientTransactionId: string) =>
    ipcRenderer.invoke('sumup:transaction-status', clientTransactionId) as Promise<
      | { ok: true; poll: 'paid' | 'pending' | 'failed'; detail?: string }
      | { ok: true; poll: 'error'; message: string }
      | { ok: false; error: 'not_configured' }
    >,
  sumupListReaders: () =>
    ipcRenderer.invoke('sumup:list-readers') as Promise<
      | {
          ok: true
          items: { id: string; name: string; status: string; model: string | null }[]
        }
      | { ok: false; error: string | 'not_configured' }
    >,
  sumupCancelPayment: (payload?: { onlineCheckoutId?: string }) =>
    ipcRenderer.invoke('sumup:cancel-payment', payload ?? {}) as Promise<
      { ok: true } | { ok: false; error: string | 'not_configured' }
    >,
  verifyPin: (pin: string) =>
    ipcRenderer.invoke('auth:verify-pin', pin) as Promise<{ ok: boolean }>,
  setInitialPin: (pin: string) =>
    ipcRenderer.invoke('auth:set-initial-pin', pin) as Promise<
      { ok: true } | { ok: false; error: 'already_set' | 'weak' }
    >,
  changePin: (oldPin: string, newPin: string) =>
    ipcRenderer.invoke('auth:change-pin', oldPin, newPin) as Promise<
      { ok: true } | { ok: false; error: 'no_pin' | 'wrong_old' | 'weak' }
    >,
  pickLogo: () =>
    ipcRenderer.invoke('app:pick-logo') as Promise<{ fileName: string; url: string } | null>,
  logoUrl: (fileName: string | null) =>
    ipcRenderer.invoke('app:logo-url', fileName) as Promise<string | null>,
  getLogoDataUrl: (fileName: string | null) =>
    ipcRenderer.invoke('app:logo-data-url', fileName) as Promise<string | null>,
  appendSale: (sale: unknown) => ipcRenderer.invoke('history:append', sale),
  listSales: () => ipcRenderer.invoke('history:list'),
  listPrinters: () =>
    ipcRenderer.invoke('printer:list') as Promise<{ name: string; displayName: string }[]>,
  printTickets: (payload: unknown) =>
    ipcRenderer.invoke('print:tickets', payload) as Promise<{ ok: boolean; error?: string }>,
  printSummaryReceipt: (payload: unknown) =>
    ipcRenderer.invoke('print:summary-receipt', payload) as Promise<{ ok: boolean; error?: string }>,
  sendSummaryReceiptEmail: (payload: { sale: unknown; to: string }) =>
    ipcRenderer.invoke('email:send-summary-receipt', payload) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  testEmailSmtp: (payload: { mode: 'verify' | 'send'; testTo?: string }) =>
    ipcRenderer.invoke('email:test-smtp', payload) as Promise<
      { ok: true; message: string } | { ok: false; error: string }
    >,
  pushClientDisplay: (state: unknown) =>
    ipcRenderer.invoke('client-display:push', state) as Promise<{ ok: true }>,
  patchClientDisplayTheme: (theme: 'dark' | 'light') =>
    ipcRenderer.invoke('client-display:patch-theme', theme) as Promise<{ ok: true }>,
  getClientDisplayInfo: () =>
    ipcRenderer.invoke('client-display:get-info') as Promise<{ port: number; urls: string[] }>,
  setClientDisplaySessionOpen: (open: boolean) =>
    ipcRenderer.invoke('client-display:set-session-open', open) as Promise<{ ok: true }>,
  setClientDisplayRemoteEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('client-display:set-remote-enabled', enabled) as Promise<{ ok: true }>,
  getClientDisplayFlags: () =>
    ipcRenderer.invoke('client-display:get-flags') as Promise<{
      remoteEnabled: boolean
      sessionOpen: boolean
    }>,
  getTabletPaymentOverlay: () =>
    ipcRenderer.invoke('client-display:get-tablet-overlay') as Promise<{
      active: boolean
      detail: import('@shared/clientDisplay').ClientPaymentDetail | null
    }>,
  onTabletPaymentOverlay: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('remote-caisse:tablet-payment-overlay', fn)
    return () => ipcRenderer.removeListener('remote-caisse:tablet-payment-overlay', fn)
  },
  getRemoteCaisseInfo: () =>
    ipcRenderer.invoke('remote-caisse:get-info') as Promise<{ port: number; urls: string[] }>,
  remoteCaisseGetMirror: () => ipcRenderer.invoke('remote-caisse:get-mirror'),
  remoteCaissePublishState: (state: unknown) =>
    ipcRenderer.invoke('remote-caisse:publish-state', state) as Promise<{ ok: boolean }>,
  remoteCaisseSetConfig: (payload: { enabled?: boolean; regenerateToken?: boolean }) =>
    ipcRenderer.invoke('remote-caisse:set-config', payload) as Promise<{
      ok: true
      token: string | null
      enabled: boolean
    }>,
  onRemoteCaisseStateSync: (cb: (state: unknown) => void) => {
    const fn = (_e: unknown, state: unknown) => cb(state)
    ipcRenderer.on('remote-caisse:state-sync', fn)
    return () => ipcRenderer.removeListener('remote-caisse:state-sync', fn)
  },
  onRemoteCaisseRefreshData: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('remote-caisse:refresh-data', fn)
    return () => ipcRenderer.removeListener('remote-caisse:refresh-data', fn)
  },
  onRemoteCaisseSaleDone: (cb: (p: { orderNumber: number; totalCents: number }) => void) => {
    const fn = (_e: unknown, p: { orderNumber: number; totalCents: number }) => cb(p)
    ipcRenderer.on('remote-caisse:sale-done', fn)
    return () => ipcRenderer.removeListener('remote-caisse:sale-done', fn)
  },
  backupExportFull: () =>
    ipcRenderer.invoke('backup:export-full') as Promise<
      | { ok: true; path: string }
      | { ok: false; canceled: true }
      | { ok: false; error: string }
    >,
  backupExportCurrent: () =>
    ipcRenderer.invoke('backup:export-current') as Promise<
      | { ok: true; path: string }
      | { ok: false; canceled: true }
      | { ok: false; error: string }
    >,
  backupExportToFolder: (folderPath: string) =>
    ipcRenderer.invoke('backup:export-to-folder', folderPath) as Promise<
      { ok: true; path: string } | { ok: false; error: string }
    >,
  backupPickFolder: () =>
    ipcRenderer.invoke('backup:pick-folder') as Promise<
      { ok: true; path: string } | { ok: false; canceled: true }
    >,
  backupPickImportFile: () =>
    ipcRenderer.invoke('backup:pick-import-file') as Promise<
      { ok: true; filePath: string } | { ok: false; canceled: true }
    >,
  backupApplyImport: (payload: {
    filePath: string
    mode: 'full' | 'replace' | 'new'
    pin: string
  }) =>
    ipcRenderer.invoke('backup:apply-import', payload) as Promise<
      { ok: true; reload: boolean } | { ok: false; error: string }
    >,
  saveFileWithDialog: (payload: {
    title?: string
    defaultPath?: string
    filters: { name: string; extensions: string[] }[]
    dataBase64: string
  }) =>
    ipcRenderer.invoke('fs:save-file-dialog', payload) as Promise<
      { ok: true; path: string } | { ok: false; canceled?: boolean }
    >
})
