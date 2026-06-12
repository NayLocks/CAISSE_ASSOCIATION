import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('caisse', {
  version: '1.0.2',
  listAssociations: () =>
    ipcRenderer.invoke('associations:list') as Promise<{
      ok: true
      /** Profils autorisés par la licence (les autres ne sont pas listés). */
      items: {
        id: string
        displayName: string
        licenseAssociationCode: string | null
        /** Présent si le profil a un logo (data URL, écran d’accueil). */
        logoDataUrl: string | null
      }[]
      lastSelectedId: string | null
    }>,
  createAssociation: (payload: {
    displayName: string
    licenseAssociationCode: string
    /** Après `code_exists` : envoi d’une demande à l’administrateur (API `notify_admin`). */
    adminRequest?: boolean
  }) =>
    ipcRenderer.invoke('associations:create', payload) as Promise<
      | { ok: true; id: string }
      | { ok: true; result: 'admin_notified'; message: string; requestId: number | null }
      | {
          ok: false
          error: 'license' | 'invalid_code' | 'server' | 'activate' | 'code_exists'
          message: string
          code?: string
          serverName?: string
        }
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
  associationRequestCheck: () =>
    ipcRenderer.invoke('association-request:check') as Promise<
      | { show: false }
      | { show: true; requestId: number; title: string; message: string; status: 'approved' | 'rejected' }
    >,
  associationRequestDismiss: (requestId: number) =>
    ipcRenderer.invoke('association-request:dismiss', requestId) as Promise<{ ok: true } | { ok: false }>,
  getAppPaths: () =>
    ipcRenderer.invoke('app:get-paths') as Promise<{
      userDataRoot: string
      exePath: string
      appPath: string
      dataFile: string | null
      salesHistoryFile: string | null
      appVersion: string
    }>,
  updateCheck: (payload?: { currentVersion?: string }) =>
    ipcRenderer.invoke('update:check', payload ?? {}) as Promise<
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
    >,
  updateDownload: (payload: { releaseId: number; suggestedFilename?: string }) =>
    ipcRenderer.invoke('update:download', payload) as Promise<
      | { ok: true; filePath: string }
      | { ok: false; message: string; cancelled?: boolean }
    >,
  getLicense: () =>
    ipcRenderer.invoke('license:get') as Promise<{
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
    }>,
  setLicense: (
    payload:
      | { web: null }
      | { web: { licenseKey: string; projectCode?: string } }
      | { licenseKey: string; projectCode?: string }
  ) => ipcRenderer.invoke('license:set', payload) as Promise<{ ok: true } | { ok: false; message: string }>,
  testLicenseApi: (payload: { licenseKey: string; projectCode?: string }) =>
    ipcRenderer.invoke('license:test-api', payload) as Promise<
      { ok: true; message: string } | { ok: false; message: string }
    >,
  licenseMachineInventory: (payload: { adminPassword: string }) =>
    ipcRenderer.invoke('license:machine-inventory', payload) as Promise<
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
    >,
  licenseCheckAssociation: () =>
    ipcRenderer.invoke('license:check-association') as Promise<
      { ok: true } | { ok: false; reason: string }
    >,
  refreshLicenseData: () =>
    ipcRenderer.invoke('license:refresh-data') as Promise<
      { ok: true; message: string } | { ok: false; message: string }
    >,
  getData: () => ipcRenderer.invoke('app:get-data'),
  setData: (data: unknown) => ipcRenderer.invoke('app:set-data', data),
  setDataImmediate: (data: unknown) =>
    ipcRenderer.invoke('app:set-data-immediate', data) as Promise<{ ok: true }>,
  factoryReset: (pin: string) =>
    ipcRenderer.invoke('app:factory-reset', { pin }) as Promise<
      { ok: true } | { ok: false; message: string }
    >,
  factoryResetAssociation: (pin: string) =>
    ipcRenderer.invoke('app:factory-reset-association', { pin }) as Promise<
      { ok: true } | { ok: false; message: string }
    >,
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
    ipcRenderer.invoke('auth:verify-pin', pin) as Promise<{ ok: boolean; error?: 'admin_network' }>,
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
  syncEventSalesMetadata: (payload: {
    eventId: string
    eventName: string
    eventDate: string
    eventNotes: string
  }) =>
    ipcRenderer.invoke('history:sync-event-metadata', payload) as Promise<{ updated: number }>,
  listPrinters: () =>
    ipcRenderer.invoke('printer:list') as Promise<{ name: string; displayName: string }[]>,
  printTickets: (payload: unknown) =>
    ipcRenderer.invoke('print:tickets', payload) as Promise<{ ok: boolean; error?: string }>,
  printHoldSlip: (payload: unknown) =>
    ipcRenderer.invoke('print:hold-slip', payload) as Promise<{ ok: boolean; error?: string }>,
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
  remoteCaisseGetCartGate: () =>
    ipcRenderer.invoke('remote-caisse:get-cart-gate') as Promise<{ cartEditor: 'pc' | 'tablet' | null }>,
  remoteCaisseForceCartControl: () =>
    ipcRenderer.invoke('remote-caisse:force-cart-control') as Promise<{
      ok: true
      cartEditor: 'pc' | 'tablet' | null
      previousEditor: 'pc' | 'tablet' | null
      claimedBy: 'pc' | 'tablet'
    }>,
  remoteCaissePublishState: (state: unknown) =>
    ipcRenderer.invoke('remote-caisse:publish-state', state) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  remoteCaisseSetConfig: (payload: {
    enabled?: boolean
    regenerateToken?: boolean
    tokenRequired?: boolean
    remoteCaisseRequireToken?: 0 | 1
  }) =>
    ipcRenderer.invoke('remote-caisse:set-config', payload) as Promise<{
      ok: true
      token: string | null
      enabled: boolean
      tokenRequired: boolean
    }>,
  onRemoteCaisseStateSync: (cb: (state: unknown) => void) => {
    const fn = (_e: unknown, state: unknown) => cb(state)
    ipcRenderer.on('remote-caisse:state-sync', fn)
    return () => ipcRenderer.removeListener('remote-caisse:state-sync', fn)
  },
  onRemoteCartEditor: (cb: (editor: 'pc' | 'tablet' | null) => void) => {
    const fn = (_e: unknown, editor: 'pc' | 'tablet' | null) => cb(editor)
    ipcRenderer.on('remote-caisse:cart-editor', fn)
    return () => ipcRenderer.removeListener('remote-caisse:cart-editor', fn)
  },
  onRemoteCartControlForced: (
    cb: (p: {
      cartEditor: 'pc' | 'tablet' | null
      previousEditor: 'pc' | 'tablet' | null
      claimedBy: 'pc' | 'tablet'
    }) => void
  ) => {
    const fn = (_e: unknown, p: unknown) => cb(p as Parameters<typeof cb>[0])
    ipcRenderer.on('remote-caisse:cart-control-forced', fn)
    return () => ipcRenderer.removeListener('remote-caisse:cart-control-forced', fn)
  },
  onRemoteCaisseEventChanged: (
    cb: (p: {
      eventId: string | null
      eventName: string | null
      previousEventId: string | null
      previousEventName: string | null
    }) => void
  ) => {
    const fn = (_e: unknown, p: unknown) => cb(p as Parameters<typeof cb>[0])
    ipcRenderer.on('remote-caisse:event-changed', fn)
    return () => ipcRenderer.removeListener('remote-caisse:event-changed', fn)
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
  heldCartsGet: () =>
    ipcRenderer.invoke('held-carts:get') as Promise<
      | { ok: true; entries: import('../shared/heldCarts.js').StoredHeldCart[]; nextHoldTicketNum: number }
      | { ok: false; error: string }
    >,
  heldCartsSet: (state: import('../shared/heldCarts.js').HeldCartPersistedState) =>
    ipcRenderer.invoke('held-carts:set', state) as Promise<
      | { ok: true; entries: import('../shared/heldCarts.js').StoredHeldCart[]; nextHoldTicketNum: number }
      | { ok: false; error: string }
    >,
  heldCartsPlace: (payload: {
    displayName?: string
    totalCents: number
    lineCount: number
    mirror: import('../shared/remoteCaisseMirror.js').RemoteCaisseMirror
  }) =>
    ipcRenderer.invoke('held-carts:place', payload) as Promise<
      | {
          ok: true
          entry: import('../shared/heldCarts.js').StoredHeldCart
          state: import('../shared/heldCarts.js').HeldCartPersistedState
        }
      | { ok: false; error: string }
    >,
  heldCartsAdd: (payload: {
    displayName?: string
    totalCents: number
    lineCount: number
    mirror: import('../shared/remoteCaisseMirror.js').RemoteCaisseMirror
  }) =>
    ipcRenderer.invoke('held-carts:add', payload) as Promise<
      | {
          ok: true
          entry: import('../shared/heldCarts.js').StoredHeldCart
          state: import('../shared/heldCarts.js').HeldCartPersistedState
        }
      | { ok: false; error: string }
    >,
  heldCartsRemove: (id: string) =>
    ipcRenderer.invoke('held-carts:remove', id) as Promise<
      | { ok: true; entries: import('../shared/heldCarts.js').StoredHeldCart[]; nextHoldTicketNum: number }
      | { ok: false; error: string }
    >,
  onHeldCartsUpdated: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('held-carts:updated', fn)
    return () => ipcRenderer.removeListener('held-carts:updated', fn)
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
  associationSyncCheck: () =>
    ipcRenderer.invoke('association-sync:check') as Promise<
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
    >,
  associationSyncUpload: (payload: { pin: string }) =>
    ipcRenderer.invoke('association-sync:upload', payload) as Promise<
      { ok: true; revision: number; message: string } | { ok: false; message: string; code?: string }
    >,
  associationSyncDownloadApply: (payload: { pin: string }) =>
    ipcRenderer.invoke('association-sync:download-apply', payload) as Promise<
      { ok: true; revision: number; message: string } | { ok: false; message: string; code?: string }
    >,
  associationSyncSetCartGate: (payload: { hasCartLines: boolean; paymentOpen: boolean }) =>
    ipcRenderer.invoke('association-sync:set-cart-gate', payload) as Promise<{ ok: true }>,
  associationSyncRestartLoop: () =>
    ipcRenderer.invoke('association-sync:restart-loop') as Promise<{ ok: true }>,
  onAssociationAutoSyncStatus: (cb: (payload: { banner: string | null }) => void) => {
    const fn = (_e: unknown, payload: { banner: string | null }) => cb(payload)
    ipcRenderer.on('association-sync:auto-status', fn)
    return () => ipcRenderer.removeListener('association-sync:auto-status', fn)
  },
  onAssociationSyncDataApplied: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('association-sync:data-applied', fn)
    return () => ipcRenderer.removeListener('association-sync:data-applied', fn)
  },
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
