import { createContext, useContext } from 'react'

export type AssociationSessionContextValue = {
  /** Retour à l’écran de choix d’association (ferme la session courante côté données). */
  switchAssociation: () => void
}

export const AssociationSessionContext = createContext<AssociationSessionContextValue | null>(null)

export function useAssociationSession(): AssociationSessionContextValue {
  const ctx = useContext(AssociationSessionContext)
  if (!ctx) throw new Error('useAssociationSession hors provider')
  return ctx
}
