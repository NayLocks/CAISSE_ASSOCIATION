import { createContext, useContext } from 'react'

export type AuthUiContextValue = {
  requestLock: () => void
}

export const AuthUiContext = createContext<AuthUiContextValue | null>(null)

export function useAuthUi(): AuthUiContextValue {
  const ctx = useContext(AuthUiContext)
  if (!ctx) throw new Error('useAuthUi hors AuthGate')
  return ctx
}
