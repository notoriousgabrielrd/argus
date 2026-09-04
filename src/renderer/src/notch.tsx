import './assets/main.css'

import { StrictMode } from 'react'
import { NotchOverlayRoot } from './components/notch-overlay/NotchOverlayRoot'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/RecoverableRenderErrorBoundary'
import {
  installRendererCrashDiagnostics,
  recordRendererCrashBreadcrumb
} from './lib/crash-diagnostics'
import { applyDocumentTheme } from './lib/document-theme'
import { I18nProvider } from './i18n/I18nProvider'
import { translate } from './i18n/i18n'
import { getOrCreateRendererRoot } from './lib/react-renderer-root'

// Why: a separate BrowserWindow with its own React root — same bootstrap as popout.tsx, minus settings sync.
recordRendererCrashBreadcrumb('notch_bootstrap_started', { dev: import.meta.env.DEV })
installRendererCrashDiagnostics('notch-overlay')

// Why: the overlay blends into the notch, so it is always dark and the page behind the panel is see-through.
applyDocumentTheme('dark', { disableTransitions: true })
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'
document.body.style.overflow = 'hidden'

const rootElement = document.getElementById('root')
if (!rootElement) {
  recordRendererCrashBreadcrumb('notch_root_missing')
  throw new Error('Notch overlay root element not found.')
}

getOrCreateRendererRoot(rootElement, import.meta.hot?.data).render(
  <StrictMode>
    <I18nProvider>
      <RecoverableRenderErrorBoundary
        boundaryId="notch-overlay.root"
        surface="notch-overlay"
        title={translate(
          'notchOverlay.recoverableError.title',
          'Argus notch overlay hit an error.'
        )}
        description={translate(
          'notchOverlay.recoverableError.description',
          'The overlay could not finish rendering. Retry to remount it.'
        )}
      >
        <NotchOverlayRoot />
      </RecoverableRenderErrorBoundary>
    </I18nProvider>
  </StrictMode>
)
recordRendererCrashBreadcrumb('notch_bootstrap_rendered')
