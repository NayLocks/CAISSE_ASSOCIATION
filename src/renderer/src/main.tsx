import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyUiThemeToDocument, readStoredUiTheme } from './themeStorage'
import App from './App'
import './App.css'

applyUiThemeToDocument(readStoredUiTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
