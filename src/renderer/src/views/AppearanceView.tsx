import { useAppState } from '@renderer/state/AppStateContext'
import type { UiDesign } from '@renderer/designSystemStorage'
import type { UiTheme } from '@renderer/themeStorage'
import {
  applyCaisseDensityToDocument,
  readCaisseDensity,
  writeCaisseDensity,
  type CaisseDensity
} from '@renderer/caisseDensityStorage'
import { useEffect, useState } from 'react'

type Props = {
  uiTheme: UiTheme
  onUiThemeChange: (t: UiTheme) => void
  uiDesign: UiDesign
  onUiDesignChange: (d: UiDesign) => void
}

export default function AppearanceView({
  uiTheme,
  onUiThemeChange,
  uiDesign,
  onUiDesignChange
}: Props): JSX.Element {
  const { data, patchData } = useAppState()
  const clientTheme = data.clientDisplayTheme ?? 'light'
  const [caisseDensity, setCaisseDensity] = useState<CaisseDensity>(() => readCaisseDensity())

  useEffect(() => {
    applyCaisseDensityToDocument(caisseDensity)
    writeCaisseDensity(caisseDensity)
  }, [caisseDensity])

  return (
    <div className="page page-scroll">
      <div className="page-inner page-inner--full">
        <div className="page-head" style={{ marginBottom: '1rem' }}>
          <div>
            <h2 className="page-title">Apparence</h2>
            <p className="page-desc">
              Thème de <strong>l’application caisse</strong>, <strong>design global</strong> (classique ou refonte
              « Atelier ») et de l’<strong>écran affichage client</strong> (navigateur / deuxième écran),
              indépendamment les uns des autres.
            </p>
          </div>
        </div>

        <div className="card form-card settings-card settings-card--full">
          <h3 className="card-title">Design de l’interface</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            <strong>Classique</strong> : ambiance terminal / ambre d’origine. <strong>Atelier</strong> : refonte complète
            (typo large, bleu marine et accents cyan, menus en cartes flottantes, boutons en pastilles, tableaux et
            modales retravaillés). Mémorisé sur cet ordinateur — le bouton en bas du menu latéral fait la même bascule.
          </p>
          <div className="settings-design-toggle" role="group" aria-label="Design de l’interface">
            <button
              type="button"
              className={`settings-design-btn${uiDesign === 'classic' ? ' active' : ''}`}
              onClick={() => onUiDesignChange('classic')}
            >
              Classique
            </button>
            <button
              type="button"
              className={`settings-design-btn${uiDesign === 'next' ? ' active' : ''}`}
              onClick={() => onUiDesignChange('next')}
            >
              Atelier (nouveau)
            </button>
          </div>
        </div>

        <div className="card form-card settings-card settings-card--full">
          <h3 className="card-title">Grille caisse</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            <strong>Confort</strong> : tuiles habituelles. <strong>Compact</strong> : plus d’articles visibles
            (petit écran tactile).
          </p>
          <div className="settings-theme-toggle" role="group" aria-label="Densité grille caisse">
            <button
              type="button"
              className={`settings-theme-btn${caisseDensity === 'comfortable' ? ' active' : ''}`}
              onClick={() => setCaisseDensity('comfortable')}
            >
              Confort
            </button>
            <button
              type="button"
              className={`settings-theme-btn${caisseDensity === 'compact' ? ' active' : ''}`}
              onClick={() => setCaisseDensity('compact')}
            >
              Compact
            </button>
          </div>
        </div>

        <div className="card form-card settings-card settings-card--full">
          <h3 className="card-title">Caisse</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Couleurs de cette application (menu, caisse, paramètres…). Mémorisé sur cet ordinateur.
          </p>
          <div className="settings-theme-toggle" role="group" aria-label="Thème caisse">
            <button
              type="button"
              className={`settings-theme-btn${uiTheme === 'dark' ? ' active' : ''}`}
              onClick={() => onUiThemeChange('dark')}
            >
              Sombre
            </button>
            <button
              type="button"
              className={`settings-theme-btn${uiTheme === 'light' ? ' active' : ''}`}
              onClick={() => onUiThemeChange('light')}
            >
              Clair
            </button>
          </div>
        </div>

        <div className="card form-card settings-card settings-card--full">
          <h3 className="card-title">Affichage client</h3>
          <p className="page-desc" style={{ marginBottom: '0.75rem' }}>
            Couleurs de la page ouverte sur le navigateur (URL affichage client). Enregistré dans les données
            de <strong>cette association</strong> et appliqué en temps réel avec le panier.
          </p>
          <div className="settings-theme-toggle" role="group" aria-label="Thème affichage client">
            <button
              type="button"
              className={`settings-theme-btn${clientTheme === 'dark' ? ' active' : ''}`}
              onClick={() => patchData({ clientDisplayTheme: 'dark' })}
            >
              Sombre
            </button>
            <button
              type="button"
              className={`settings-theme-btn${clientTheme === 'light' ? ' active' : ''}`}
              onClick={() => patchData({ clientDisplayTheme: 'light' })}
            >
              Clair
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
