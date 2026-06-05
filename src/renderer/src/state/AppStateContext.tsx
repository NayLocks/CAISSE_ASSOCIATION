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
    const d = await window.caisse.getData()
    setDataState(d)
  }, [])

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
