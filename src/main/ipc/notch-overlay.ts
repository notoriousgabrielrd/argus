import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import {
  closeNotchOverlay,
  isNotchOverlayRenderer,
  openNotchOverlay,
  setNotchOverlayExpanded
} from '../window/notch-overlay-window'
import { revealDashboardAgentInMainWindow } from './dashboard-popout'
import { isDashboardRevealAgentArgs } from './dashboard-payload-validation'

export function isNotchOverlayEnabled(store: Store): boolean {
  return process.platform === 'darwin' && store.getSettings().experimentalMacNotchOverlay === true
}

function syncNotchOverlay(store: Store): void {
  if (isNotchOverlayEnabled(store)) {
    openNotchOverlay()
  } else {
    closeNotchOverlay()
  }
}

export function registerNotchOverlayHandlers(store: Store): void {
  ipcMain.removeHandler('notchOverlay:setExpanded')
  ipcMain.removeHandler('notchOverlay:revealAgent')

  void app.whenReady().then(() => syncNotchOverlay(store))
  store.onSettingsChanged((updates) => {
    if ('experimentalMacNotchOverlay' in updates) {
      syncNotchOverlay(store)
    }
  })

  ipcMain.handle('notchOverlay:setExpanded', (event, args: unknown): void => {
    if (!isNotchOverlayRenderer(event.sender) || !args || typeof args !== 'object') {
      return
    }
    const { expanded } = args as { expanded?: unknown }
    if (typeof expanded !== 'boolean') {
      return
    }
    setNotchOverlayExpanded(expanded)
  })

  ipcMain.handle('notchOverlay:revealAgent', (event, args: unknown): void => {
    if (!isNotchOverlayRenderer(event.sender) || !isDashboardRevealAgentArgs(args)) {
      return
    }
    // Why: the panel collapses before the main window comes forward so it never covers what it just revealed.
    setNotchOverlayExpanded(false)
    revealDashboardAgentInMainWindow(args)
  })
}
