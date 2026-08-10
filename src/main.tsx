import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { log, restorePersistedLogs } from './log/logger.ts'

// Bring back what earlier sessions logged, then note that we booted. The
// restore is deliberately not awaited — the app must render whether or not
// IndexedDB cooperates.
void restorePersistedLogs()
log.info('ui', 'app started', { url: location.pathname })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
