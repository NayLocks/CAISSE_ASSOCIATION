import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import BootLoading from '@renderer/components/BootLoading'
import { useGlobalFocusRepair, isFormFieldFocused } from '@renderer/hooks/useGlobalFocusRepair'
import { repairStaleFocus } from '@renderer/utils/blurActiveElement'
import type { AppPersistedData } from '@shared/catalog'

type AppStateContextValue = {
  data: AppPersistedData
  loading: boolean
  setData: (updater: (prev: AppPersistedData) => AppPersistedData) => void
  patchData: (partial: Partial<AppPersistedData>) => void
  logoHref: string | null
  refreshData: () => Promise<void>
}

const AppStateContext = createContext<AppStateContextValue | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }): JSX.Element {
  const [data, setDataState] = useState<AppPersistedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [logoHref, setLogoHref] = useState<string | null>(null)
  const skipSave = useRef(true)
  const refreshPendingRef = useRef(false)
  const refreshFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useGlobalFocusRepair()

  useEffect(() => {
    void window.caisse.getData().then((d) => {
      setDataState(d)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const f = data?.association.logoFile ?? null
    if (!f) {
      setLogoHref(null)
      return
    }
    void window.caisse.getLogoDataUrl(f).then(setLogoHref)
  }, [data?.association.logoFile])

  useEffect(() => {
    if (!data || loading) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    const t = window.setTimeout(() => {
      void window.caisse.setData(data)
    }, 450)
    return () => window.clearTimeout(t)
  }, [data, loading])

  const setData = useCallback((updater: (prev: AppPersistedData) => AppPersistedData) => {
    setDataState((prev) => {
      if (!prev) return prev
      return updater(prev)
    })
  }, [])

  const patchData = useCallback((partial: Partial<AppPersistedData>) => {
    setDataState((prev) => {
      if (!prev) return prev
      return { ...prev, ...partial } as AppPersistedData
    })
  }, [])

  const refreshData = useCallback(async () => {
    const apply = async (): Promise<void> => {
      if (isFormFieldFocused()) {
        refreshPendingRef.current = true
        return
      }
      refreshPendingRef.current = false
      const d = await window.caisse.getData()
      setDataState(d)
      repairStaleFocus()
    }
    await apply()
  }, [])

  useEffect(() => {
    const flushPendingRefresh = (): void => {
      if (!refreshPendingRef.current || isFormFieldFocused()) return
      if (refreshFlushTimerRef.current) clearTimeout(refreshFlushTimerRef.current)
      refreshFlushTimerRef.current = setTimeout(() => {
        refreshFlushTimerRef.current = null
        void refreshData()
      }, 120)
    }

    document.addEventListener('focusout', flushPendingRefresh, true)
    return () => {
      document.removeEventListener('focusout', flushPendingRefresh, true)
      if (refreshFlushTimerRef.current) clearTimeout(refreshFlushTimerRef.current)
    }
  }, [refreshData])

  useEffect(() => {
    const off = window.caisse.onRemoteCaisseRefreshData(() => {
      void refreshData()
    })
    return off
  }, [refreshData])

  const value = useMemo((): AppStateContextValue | null => {
    if (!data) return null
    return {
      data,
      loading,
      setData,
      patchData,
      logoHref,
      refreshData
    }
  }, [data, loading, setData, patchData, logoHref, refreshData])

  if (!value) {
    return <BootLoading />
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState hors provider')
  return ctx
}
