import './lib/sentry.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mycscompanion/ui/src/globals.css'
import { Sentry } from './lib/sentry.js'
import { App } from './App'

function FallbackComponent(): React.ReactElement {
  return <div>Something went wrong. Please refresh the page.</div>
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Sentry.ErrorBoundary fallback={FallbackComponent}>
        <App />
      </Sentry.ErrorBoundary>
    </StrictMode>,
  )
}
