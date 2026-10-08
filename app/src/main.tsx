import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/screens.css'
import './styles/mobile.css'
import { App } from './app/App'
import { AppStateProvider } from './app/state'
import { startBackfill } from './api/enrich'
import { initAuth } from './sync/auth'
import { startSync } from './sync/engine'
import { initTheme } from './theme'

initTheme()
startSync()
void initAuth()
startBackfill()

// Hash router: GitHub Pages returns 404 for sub-paths.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </HashRouter>
  </StrictMode>,
)
