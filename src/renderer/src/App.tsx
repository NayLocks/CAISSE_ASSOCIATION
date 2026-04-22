import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { AppStateProvider, useAppState } from '@renderer/state/AppStateContext'
import { useAuthUi } from '@renderer/state/AuthUiContext'
import { AssociationSessionContext } from '@renderer/state/AssociationSessionContext'
import AuthGate from '@renderer/components/AuthGate'
import AssociationPicker from '@renderer/components/AssociationPicker'
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
import AppearanceView from '@renderer/views/AppearanceView'
import { ShellNavProvider } from '@renderer/state/ShellNavContext'
import HeaderCashMenu from '@renderer/components/HeaderCashMenu'
import {
  applyUiThemeToDocument,
  readStoredUiTheme,
  writeStoredUiTheme,
  type UiTheme
} from '@renderer/themeStorage'
import { SHELL_NAV_GROUPS, type ShellViewId } from '@renderer/config/shellNav'

export type AppView = ShellViewId

function Shell(): JSX.Element {
  const { data, setData, logoHref } = useAppState()
  const { requestLock } = useAuthUi()
  const [view, setView] = useState<AppView>('caisse')
  const [licenseAssocWarn, setLicenseAssocWarn] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => readStoredUiTheme())
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

  const onEventChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value || null
      setData((prev) => ({ ...prev, selectedEventId: id }))
    },
    [setData]
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
              onClick={() => setView(id)}
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
    <ShellNavProvider goToCaisse={() => setView('caisse')}>
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
                <select
                  className="event-select"
                  value={data.selectedEventId ?? ''}
                  onChange={onEventChange}
                >
                  <option value="">— Événement —</option>
                  {data.events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                      {ev.date ? ` (${ev.date})` : ''}
                      {ev.closed ? ' — clôturé' : ''}
                    </option>
                  ))}
                </select>
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
              <AppearanceView uiTheme={uiTheme} onUiThemeChange={setUiTheme} />
            )}
            {view === 'settings' && <SettingsView />}
          </div>
        </div>
      </div>
    </ShellNavProvider>
  )
}

export default function App(): JSX.Element {
  const [assocKey, setAssocKey] = useState<string | null>(null)
  const [licenseScreen, setLicenseScreen] = useState(false)

  const handleSelectAssociation = useCallback(async (id: string) => {
    const r = await window.caisse.setActiveAssociation(id)
    if (r.ok) setAssocKey(id)
    else if (r.error === 'license') {
      window.alert(
        r.message ??
          'Cette association n’est pas autorisée par la licence enregistrée sur cet ordinateur.'
      )
    }
  }, [])

  const switchAssociation = useCallback(() => {
    setAssocKey(null)
    setLicenseScreen(false)
    void window.caisse.clearActiveAssociation()
  }, [])

  if (!assocKey) {
    if (licenseScreen) {
      return <LicenseView onBack={() => setLicenseScreen(false)} />
    }
    return (
      <AssociationPicker
        onOpen={handleSelectAssociation}
        onOpenLicense={() => setLicenseScreen(true)}
      />
    )
  }

  return (
    <AssociationSessionContext.Provider value={{ switchAssociation }}>
      <AppStateProvider key={assocKey}>
        <AuthGate>
          <Shell />
        </AuthGate>
      </AppStateProvider>
    </AssociationSessionContext.Provider>
  )
}
