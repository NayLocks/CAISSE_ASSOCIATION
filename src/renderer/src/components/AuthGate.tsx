import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useAppState } from '@renderer/state/AppStateContext'
import { AuthUiContext } from '@renderer/state/AuthUiContext'
import { useAssociationSession } from '@renderer/state/AssociationSessionContext'
import BootLoading from '@renderer/components/BootLoading'
import PinPanel from '@renderer/components/PinPanel'

export default function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const { data, loading, refreshData } = useAppState()
  const { switchAssociation } = useAssociationSession()
  const [sessionOk, setSessionOk] = useState(false)
  const [lockScreen, setLockScreen] = useState(false)

  const needsSetup = data.security.pinHash === null

  /** Après remise à zéro des données, le PIN est effacé : réafficher l’écran de création. */
  useEffect(() => {
    if (needsSetup && sessionOk) {
      setSessionOk(false)
      setLockScreen(false)
    }
  }, [needsSetup, sessionOk])

  const onSetupDone = useCallback(async () => {
    await refreshData()
    setSessionOk(true)
  }, [refreshData])

  const onLoginDone = useCallback(() => {
    setSessionOk(true)
    setLockScreen(false)
  }, [])

  const requestLock = useCallback(() => {
    setLockScreen(true)
  }, [])

  useEffect(() => {
    if (loading) {
      void window.caisse.setClientDisplaySessionOpen(false)
      return
    }
    const open = sessionOk && !lockScreen
    void window.caisse.setClientDisplaySessionOpen(open)
  }, [loading, sessionOk, lockScreen])

  if (loading) {
    return <BootLoading message="Chargement de la session…" />
  }

  const showSetup = !sessionOk && needsSetup
  const showLogin = (!sessionOk && !needsSetup) || lockScreen

  return (
    <AuthUiContext.Provider value={{ requestLock }}>
      {/* Pendant le verrouillage, ne pas monter l’UI sous-jacente : focus clavier + saisie PIN fiables */}
      {sessionOk && !lockScreen ? children : null}
      {showSetup && (
        <PinPanel
          mode="setup"
          onSuccess={onSetupDone}
          onBack={lockScreen ? undefined : switchAssociation}
        />
      )}
      {showLogin && (
        <PinPanel
          mode="login"
          title={lockScreen ? 'Application verrouillée' : undefined}
          onSuccess={onLoginDone}
          onBack={lockScreen ? undefined : switchAssociation}
        />
      )}
    </AuthUiContext.Provider>
  )
}
