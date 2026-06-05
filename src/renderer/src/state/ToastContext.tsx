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

export type ToastVariant = 'info' | 'error' | 'success'

export type ToastInput = {
  message: string
  variant?: ToastVariant
  /** Durée avant disparition automatique. */
  durationMs?: number
}

type ToastItem = ToastInput & { id: number }

export type ToastContextValue = {
  showToast: (input: string | ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastIdSeq = 1

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, number>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const tid = timers.current.get(id)
    if (tid != null) window.clearTimeout(tid)
    timers.current.delete(id)
  }, [])

  const showToast = useCallback(
    (input: string | ToastInput) => {
      const message = typeof input === 'string' ? input : input.message
      const variant: ToastVariant =
        typeof input === 'string' ? 'info' : (input.variant ?? 'info')
      const durationMs =
        typeof input === 'string'
          ? variant === 'error'
            ? 12000
            : variant === 'success'
              ? 4500
              : 5200
          : (input.durationMs ??
            (variant === 'error' ? 12000 : variant === 'success' ? 4500 : 5200))
      const id = toastIdSeq++
      const item: ToastItem = { id, message, variant, durationMs }
      setToasts((prev) => [...prev, item])
      const tid = window.setTimeout(() => dismiss(id), durationMs)
      timers.current.set(id, tid)
    },
    [dismiss]
  )

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current.clear()
    },
    []
  )

  const value = useMemo((): ToastContextValue => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="polite" aria-relevant="additions text">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`toast toast--${t.variant}`}>
            <button
              type="button"
              className="toast-dismiss"
              aria-label="Fermer la notification"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
            <div className="toast-message">{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast doit être utilisé sous ToastProvider')
  return ctx
}
