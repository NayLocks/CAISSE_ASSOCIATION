import { useAppState } from '@renderer/state/AppStateContext'
import type { UiTheme } from '@renderer/themeStorage'

type Props = {
  uiTheme: UiTheme
  onUiThemeChange: (t: UiTheme) => void
}

export default function AppearanceView({ uiTheme, onUiThemeChange }: Props): JSX.Element {
  const { data, patchData } = useAppState()
  const clientTheme = data.clientDisplayTheme ?? 'light'

  return (
    <div className="page page-scroll">
      <div className="page-inner">
        <h2 className="page-title">Apparence</h2>
        <p className="page-desc">
          Thème de <strong>l’application caisse</strong> et de l’<strong>écran affichage client</strong>{' '}
          (navigateur / deuxième écran), indépendamment l’un de l’autre.
        </p>

        <div className="card form-card settings-card">
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

        <div className="card form-card settings-card">
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
