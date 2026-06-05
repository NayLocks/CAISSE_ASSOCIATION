import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppStateProvider, useAppState } from '@renderer/state/AppStateContext'
import { useAuthUi } from '@renderer/state/AuthUiContext'
import { AssociationSessionContext, useAssociationSession } from '@renderer/state/AssociationSessionContext'
import AuthGate from '@renderer/components/AuthGate'
import AssociationPicker from '@renderer/components/AssociationPicker'
import EventPicker from '@renderer/components/EventPicker'
import LicenseView from '@renderer/views/LicenseView'
import CaisseView from '@renderer/views/CaisseView'
import AssociationView from '@renderer/views/AssociationView'
import EventsView from '@renderer/views/EventsView'
import ArticlesView from '@renderer/views/ArticlesView'
import HistoryView from '@renderer/views/HistoryView'
import CategoriesView from '@renderer/views/CategoriesView'
import PrintingView from '@renderer/views/PrintingView'
import EmailReceiptView from '@renderer/views/EmailReceiptView'
import ClientDisplayView from '@renderer/views/ClientDisplayView'
import RemoteCaisseView from '@renderer/views/RemoteCaisseView'
import StockView from '@renderer/views/StockView'
import SumUpView from '@renderer/views/SumUpView'
import SettingsView from '@renderer/views/SettingsView'
import DataBackupView from '@renderer/views/DataBackupView'
import AppearanceView from '@renderer/views/AppearanceView'
import DiscountMotifsView from '@renderer/views/DiscountMotifsView'
import { ShellNavProvider } from '@renderer/state/ShellNavContext'
import HeaderCashMenu from '@renderer/components/HeaderCashMenu'
import {
  applyUiThemeToDocument,
  readStoredUiTheme,
  writeStoredUiTheme,
  type UiTheme
} from '@renderer/themeStorage'
import {
  applyUiDesignToDocument,
  readStoredUiDesign,
  writeStoredUiDesign,
  type UiDesign
} from '@renderer/designSystemStorage'
import { isShellViewId, SHELL_NAV_GROUPS, type ShellViewId } from '@renderer/config/shellNav'
import { ToastProvider, useToast } from '@renderer/state/ToastContext'
import { eventMatchesShortcut, readKeyboardShortcuts } from '@renderer/utils/keyboardShortcutsStorage'

export type AppView = ShellViewId

function readInitialShellView(): AppView {
  try {
    const h = window.location.hash.replace(/^#/, '')
    if (isShellViewId(h)) return h
  } catch {
    /* ignore */
  }
  return 'caisse'
}

function Shell(): JSX.Element {
  const { data, setData, logoHref, refreshData } = useAppState()
  const { requestLock } = useAuthUi()
  const { switchAssociation } = useAssociationSession()
  const [view, setView] = useState<AppView>(readInitialShellView)

  const setViewAndHash = useCallback((v: AppView) => {
    setView(v)
    const next = `#${v}`
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', next)
    }
  }, [])

  useEffect(() => {
    const onHash = (): void => {
      const h = window.location.hash.replace(/^#/, '')
      if (isShellViewId(h)) setView(h)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (eventMatchesShortcut(e, readKeyboardShortcuts().gotoCaisse)) {
        e.preventDefault()
        setViewAndHash('caisse')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setViewAndHash])

  useEffect(() => {
    if (!window.location.hash) window.history.replaceState(null, '', '#caisse')
  }, [])

  const [licenseAssocWarn, setLicenseAssocWarn] = useState<string | null>(null)
  const [syncServerWarn, setSyncServerWarn] = useState<string | null>(null)
  const [updateAvailMsg, setUpdateAvailMsg] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => readStoredUiTheme())
  const [uiDesign, setUiDesign] = useState<UiDesign>(() => readStoredUiDesign())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('caisse-sidebar-collapsed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    applyUiThemeToDocument(uiTheme)
    writeStoredUiTheme(uiTheme)
  }, [uiTheme])

  useEffect(() => {
    applyUiDesignToDocument(uiDesign)
    writeStoredUiDesign(uiDesign)
  }, [uiDesign])

  useEffect(() => {
    const t = data.clientDisplayTheme ?? 'light'
    void window.caisse.patchClientDisplayTheme(t)
  }, [data.clientDisplayTheme])

  useEffect(() => {
    try {
      localStorage.setItem('caisse-sidebar-collapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.caisse.licenseCheckAssociation().then((r) => {
      if (cancelled) return
      setLicenseAssocWarn(!r.ok ? r.reason : null)
    })
    return () => {
      cancelled = true
    }
  }, [data.association.licenseAssociationCode])

  useEffect(() => {
    const offStatus = window.caisse.onAssociationAutoSyncStatus((p) => {
      setSyncServerWarn(p.banner)
    })
    const offApplied = window.caisse.onAssociationSyncDataApplied(() => {
      void refreshData()
    })
    return () => {
      offStatus()
      offApplied()
    }
  }, [refreshData])

  useEffect(() => {
    void window.caisse.getAppPaths().then((paths) => {
      void window.caisse.updateCheck({ currentVersion: paths.appVersion }).then((r) => {
        if (!r.ok || !r.update_available || !r.latest) {
          setUpdateAvailMsg(null)
          return
        }
        setUpdateAvailMsg(
          `Mise à jour ${r.latest.version} disponible (installée : ${paths.appVersion}). Redémarrez l’application pour l’installer au lancement.`
        )
      })
    })
  }, [])

  const timeStr = useMemo(
    () =>
      now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
    [now]
  )
  const dateStr = useMemo(
    () =>
      now.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      }),
    [now]
  )

  const title = data.association.name.trim() || 'Caisse - Association - Buvette'
  const subtitle = data.association.numero.trim()
    ? `N° ${data.association.numero}`
    : 'Encaissement buvette'

  const selectedEv = data.events.find((e) => e.id === data.selectedEventId)
  const sessionForSelected =
    data.selectedEventId && data.eventSessions[data.selectedEventId]
      ? data.eventSessions[data.selectedEventId]
      : null

  const eventPickerRows = useMemo(
    () =>
      data.events.map((ev) => ({
        id: ev.id,
        name: ev.name,
        date: ev.date ?? null,
        closed: ev.closed === true
      })),
    [data.events]
  )

  const sidebarNav = (
    <nav className="sidebar-nav" aria-label="Navigation principale">
      {SHELL_NAV_GROUPS.map((group) => (
        <div key={group.title} className="sidebar-nav-section">
          <div className="sidebar-nav-heading">{group.title}</div>
          {group.items.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`sidebar-nav-btn${view === id ? ' active' : ''}`}
              title={label}
              onClick={() => setViewAndHash(id)}
            >
              <span className="sidebar-nav-ico" aria-hidden>
                {icon}
              </span>
              <span className="sidebar-nav-label">{label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  )

  return (
    <ShellNavProvider goToCaisse={() => setViewAndHash('caisse')}>
      <div className="app">
        <aside className={`app-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
          <div className="sidebar-brand">
            {logoHref ? (
              <img src={logoHref} alt="" className="brand-logo sidebar-brand-logo" />
            ) : (
              <div className="brand-mark sidebar-brand-mark" aria-hidden>
                🍺
              </div>
            )}
            <div className="sidebar-brand-text">
              <div className="sidebar-brand-title">{title}</div>
              <div className="sidebar-brand-sub">{subtitle}</div>
            </div>
          </div>
          {sidebarNav}
          <div className="sidebar-nav-section sidebar-nav-logout">
            <div className="sidebar-nav-heading">Session</div>
            <button
              type="button"
              className="sidebar-nav-btn sidebar-logout-btn"
              title="Fermer la session de cette association et revenir à l’accueil (choix d’association)"
              onClick={() => {
                void window.caisse.setClientDisplaySessionOpen(false)
                switchAssociation()
              }}
            >
              <span className="sidebar-nav-ico" aria-hidden>
                🚪
              </span>
              <span className="sidebar-nav-label">Déconnexion</span>
            </button>
          </div>
          <div className="sidebar-design-block">
            <button
              type="button"
              className="sidebar-design-toggle"
              title={
                uiDesign === 'classic'
                  ? 'Activer le design Atelier (refonte visuelle)'
                  : 'Revenir au design classique'
              }
              onClick={() => setUiDesign((d) => (d === 'classic' ? 'next' : 'classic'))}
            >
              <span className="sidebar-design-ico" aria-hidden>
                {uiDesign === 'classic' ? '✦' : '◆'}
              </span>
              <span className="sidebar-design-label">
                {uiDesign === 'classic' ? 'Nouveau design' : 'Design classique'}
              </span>
            </button>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            title={sidebarCollapsed ? 'Afficher le menu' : 'Masquer le menu'}
            onClick={() => setSidebarCollapsed((c) => !c)}
          >
            <span className="sidebar-collapse-ico" aria-hidden>
              {sidebarCollapsed ? '»' : '«'}
            </span>
            <span className="sidebar-collapse-label">{sidebarCollapsed ? 'Menu' : 'Masquer'}</span>
          </button>
        </aside>

        <div className="app-main">
          <header className="header">
            <div className="header-left header-left-compact">
              <div className="brand brand-header-compact">
                {logoHref ? (
                  <img src={logoHref} alt="" className="brand-logo" />
                ) : (
                  <div className="brand-mark" aria-hidden>
                    🍺
                  </div>
                )}
                <div>
                  <h1>{title}</h1>
                  <p>{subtitle}</p>
                </div>
              </div>
            </div>
            <div className="header-right">
              <HeaderCashMenu
                orderCounter={data.orderCounter}
                selectedEventId={data.selectedEventId}
                eventName={selectedEv?.name ?? null}
                floatCents={sessionForSelected?.floatCents ?? null}
                sessionStarted={Boolean(sessionForSelected)}
                products={data.products}
              />
              <label className="event-select-wrap">
                <span className="sr-only">Événement actif</span>
                <EventPicker
                  value={data.selectedEventId}
                  events={eventPickerRows}
                  onChange={(id) => setData((prev) => ({ ...prev, selectedEventId: id }))}
                />
              </label>
              <button
                type="button"
                className="btn-lock"
                title="Verrouiller l’application (code PIN)"
                onClick={() => requestLock()}
              >
                <span className="btn-lock-icon" aria-hidden>
                  🔒
                </span>
                <span className="btn-lock-text">Verrouiller</span>
              </button>
              <div className="clock" title={dateStr}>
                {dateStr} · {timeStr}
              </div>
            </div>
          </header>

          {licenseAssocWarn && (
            <div className="license-app-banner" role="status">
              <strong>Licence :</strong> {licenseAssocWarn}
            </div>
          )}
          {syncServerWarn && (
            <div className="license-app-banner license-app-banner--sync" role="status">
              <strong>Synchro serveur :</strong> {syncServerWarn}
            </div>
          )}
          {updateAvailMsg && (
            <div className="license-app-banner license-app-banner--update" role="status">
              <strong>Mise à jour :</strong> {updateAvailMsg}
            </div>
          )}

          <div className={`view-root${view === 'caisse' ? '' : ' view-pad'}`}>
            {view === 'caisse' && <CaisseView />}
            {view === 'association' && <AssociationView />}
            {view === 'events' && <EventsView />}
            {view === 'categories' && <CategoriesView />}
            {view === 'articles' && <ArticlesView />}
            {view === 'stock' && <StockView />}
            {view === 'sumup' && <SumUpView />}
            {view === 'printing' && <PrintingView />}
            {view === 'emailReceipt' && <EmailReceiptView />}
            {view === 'clientDisplay' && <ClientDisplayView />}
            {view === 'remoteCaisse' && <RemoteCaisseView />}
            {view === 'history' && <HistoryView />}
            {view === 'appearance' && (
              <AppearanceView
                uiTheme={uiTheme}
                onUiThemeChange={setUiTheme}
                uiDesign={uiDesign}
                onUiDesignChange={setUiDesign}
              />
            )}
            {view === 'discountMotifs' && <DiscountMotifsView />}
            {view === 'dataBackup' && <DataBackupView />}
            {view === 'settings' && <SettingsView />}
          </div>
        </div>
      </div>
    </ShellNavProvider>
  )
}

function AppInner(): JSX.Element {
  const { showToast } = useToast()
  const [assocKey, setAssocKey] = useState<string | null>(null)
  const [licenseScreen, setLicenseScreen] = useState(false)
  const [assocRequestModal, setAssocRequestModal] = useState<{
    requestId: number
    title: string
    message: string
    status: 'approved' | 'rejected'
  } | null>(null)

  const handleSelectAssociation = useCallback(async (id: string) => {
    const r = await window.caisse.setActiveAssociation(id)
    if (r.ok) setAssocKey(id)
    else if (r.error === 'license') {
      showToast({
        variant: 'error',
        message:
          r.message ??
          'Cette association n’est pas autorisée par la licence enregistrée sur cet ordinateur.'
      })
    }
  }, [showToast])

  const switchAssociation = useCallback(() => {
    setAssocKey(null)
    setLicenseScreen(false)
    void window.caisse.clearActiveAssociation()
  }, [])

  const runAssociationRequestResponseCheck = useCallback(async () => {
    const r = await window.caisse.associationRequestCheck()
    if (r.show) {
      setAssocRequestModal({
        requestId: r.requestId,
        title: r.title,
        message: r.message,
        status: r.status
      })
    }
  }, [])

  useEffect(() => {
    void runAssociationRequestResponseCheck()
  }, [runAssociationRequestResponseCheck])

  const closeAssociationRequestModal = useCallback(async () => {
    if (!assocRequestModal) return
    const id = assocRequestModal.requestId
    setAssocRequestModal(null)
    await window.caisse.associationRequestDismiss(id)
    const r = await window.caisse.associationRequestCheck()
    if (r.show) {
      setAssocRequestModal({
        requestId: r.requestId,
        title: r.title,
        message: r.message,
        status: r.status
      })
    }
  }, [assocRequestModal])

  const requestResponseOverlay =
    assocRequestModal != null ? (
      <div
        className="assoc-picker-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assoc-req-resp-title"
      >
        <div
          className={
            'assoc-picker-modal card form-card pro-card-elevated' +
            (assocRequestModal.status === 'rejected' ? ' assoc-req-resp--reject' : '')
          }
        >
          <h3 id="assoc-req-resp-title" className="card-title">
            {assocRequestModal.title}
          </h3>
          <p
            className="page-desc assoc-req-resp-body"
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {assocRequestModal.message}
          </p>
          <div className="assoc-picker-modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => void closeAssociationRequestModal()}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    ) : null

  if (!assocKey) {
    if (licenseScreen) {
      return (
        <>
          {requestResponseOverlay}
          <LicenseView onBack={() => setLicenseScreen(false)} />
        </>
      )
    }
    return (
      <>
        {requestResponseOverlay}
        <AssociationPicker
          onOpen={handleSelectAssociation}
          onOpenLicense={() => setLicenseScreen(true)}
        />
      </>
    )
  }

  return (
    <>
      {requestResponseOverlay}
      <AssociationSessionContext.Provider value={{ switchAssociation }}>
        <AppStateProvider key={assocKey}>
          <AuthGate>
            <Shell />
          </AuthGate>
        </AppStateProvider>
      </AssociationSessionContext.Provider>
    </>
  )
}

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}
