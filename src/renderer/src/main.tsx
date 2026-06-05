import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyUiThemeToDocument, readStoredUiTheme } from './themeStorage'
import { applyUiDesignToDocument, readStoredUiDesign } from './designSystemStorage'
import { applyCaisseDensityToDocument, readCaisseDensity } from './caisseDensityStorage'
import App from './App'
import './App.css'

applyUiThemeToDocument(readStoredUiTheme())
applyUiDesignToDocument(readStoredUiDesign())
applyCaisseDensityToDocument(readCaisseDensity())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
