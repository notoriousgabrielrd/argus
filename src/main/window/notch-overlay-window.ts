import {
  app,
  BrowserWindow,
  screen,
  type Display,
  type Rectangle,
  type WebContents
} from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'

const NOTCH_OVERLAY_PARTITION = 'orca-notch-overlay'
// Why: the built-in display on notch Macs reports a taller menu bar (32–38pt) than notch-less ones (24–25pt).
const NOTCH_MENU_BAR_MIN_HEIGHT = 30
const FALLBACK_MENU_BAR_HEIGHT = 24
// DailyNotch dashboard footprint: 620pt wide; the renderer draws the smaller idle/active
// pills inside this fixed window and animates them itself.
const EXPANDED_WIDTH = 400
const EXPANDED_MIN_HEIGHT = 44
const EXPANDED_MAX_HEIGHT = 210

export type NotchGeometry = {
  menuBarHeight: number
  hasNotch: boolean
  /** Width of the hardware notch in points, or 0 on displays without one. */
  notchWidth: number
}

// Fallback notch width for a notched display whose exact gap Electron can't report.
const FALLBACK_NOTCH_WIDTH = 190

export function detectNotchGeometry(display: Pick<Display, 'bounds' | 'workArea'>): NotchGeometry {
  const menuBarHeight = Math.max(0, display.workArea.y - display.bounds.y)
  const hasNotch = menuBarHeight >= NOTCH_MENU_BAR_MIN_HEIGHT
  return {
    menuBarHeight: menuBarHeight > 0 ? menuBarHeight : FALLBACK_MENU_BAR_HEIGHT,
    hasNotch,
    notchWidth: hasNotch ? FALLBACK_NOTCH_WIDTH : 0
  }
}

/** Top-centered rect: the collapsed strip covers the notch band, the expanded panel hangs below it. */
export function computeNotchOverlayBounds(
  display: Pick<Display, 'bounds' | 'workArea'>,
  expanded: { contentHeight: number } | null
): Rectangle {
  const { menuBarHeight } = detectNotchGeometry(display)
  const width = EXPANDED_WIDTH
  const height = expanded
    ? menuBarHeight +
      Math.min(
        EXPANDED_MAX_HEIGHT,
        Math.max(EXPANDED_MIN_HEIGHT, Math.round(expanded.contentHeight))
      )
    : menuBarHeight
  return {
    x: Math.round(display.bounds.x + (display.bounds.width - width) / 2),
    y: display.bounds.y,
    width,
    height
  }
}

let notchOverlayWindow: BrowserWindow | null = null
const openListeners = new Set<(open: boolean) => void>()

export function getNotchOverlayWindow(): BrowserWindow | null {
  return notchOverlayWindow &&
    !notchOverlayWindow.isDestroyed() &&
    !notchOverlayWindow.webContents.isDestroyed()
    ? notchOverlayWindow
    : null
}

export function isNotchOverlayRenderer(sender: WebContents): boolean {
  return getNotchOverlayWindow()?.webContents === sender
}

export function onNotchOverlayOpenChanged(listener: (open: boolean) => void): () => void {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

type AnchorDisplayCandidate = Pick<Display, 'bounds' | 'workArea'> & { internal?: boolean }

/** The built-in panel owns the notch; the primary display may be an external monitor. */
export function pickNotchAnchorDisplay<T extends AnchorDisplayCandidate>(
  displays: readonly T[],
  primary: T
): T {
  return (
    displays.find((display) => display.internal === true) ??
    displays.find((display) => detectNotchGeometry(display).hasNotch) ??
    primary
  )
}

function anchorDisplay(): Display {
  return pickNotchAnchorDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay())
}

// Why: window resizes are not animatable, so the window always spans the fully expanded
// panel and the renderer animates the black surface inside it. While collapsed the
// transparent remainder is click-through (mousemove is still forwarded for hover detection).
function applyBounds(window: BrowserWindow): void {
  window.setBounds(
    computeNotchOverlayBounds(anchorDisplay(), { contentHeight: EXPANDED_MAX_HEIGHT })
  )
}

function applyMouseMode(window: BrowserWindow, expanded: boolean): void {
  window.setIgnoreMouseEvents(!expanded, { forward: true })
}

/** Open the panel below the notch (hover) or let it fold back into the strip. */
export function setNotchOverlayExpanded(expanded: boolean): void {
  const window = getNotchOverlayWindow()
  if (!window) {
    return
  }
  applyMouseMode(window, expanded)
  window.webContents.send('notchOverlay:expandedChanged', expanded)
}

function loadNotchOverlay(window: BrowserWindow): void {
  // Why: the renderer sizes its strip row to the menu bar so the counts sit level with the notch.
  const geometry = detectNotchGeometry(anchorDisplay())
  const search = `bar=${geometry.menuBarHeight}&notch=${geometry.notchWidth}`
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/notch.html?${search}`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/notch.html'), { search })
  }
}

export function openNotchOverlay(): BrowserWindow | null {
  if (process.platform !== 'darwin') {
    return null
  }
  const existing = getNotchOverlayWindow()
  if (existing) {
    return existing
  }
  const window = new BrowserWindow({
    ...computeNotchOverlayBounds(anchorDisplay(), { contentHeight: EXPANDED_MAX_HEIGHT }),
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Why: the strip is glanceable chrome, not a document — it must never steal focus from the user's app.
    focusable: false,
    acceptFirstMouse: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      partition: NOTCH_OVERLAY_PARTITION,
      webviewTag: false
    }
  })
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  // Why: 'screen-saver' is the only level that paints above the menu bar band where the notch sits.
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.setWindowButtonVisibility?.(false)
  applyMouseMode(window, false)
  notchOverlayWindow = window

  const onDisplayChanged = (): void => {
    const live = getNotchOverlayWindow()
    if (live) {
      applyBounds(live)
    }
  }
  screen.on('display-metrics-changed', onDisplayChanged)
  screen.on('display-added', onDisplayChanged)
  screen.on('display-removed', onDisplayChanged)

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) {
      window.showInactive()
    }
  })
  window.on('closed', () => {
    screen.removeListener('display-metrics-changed', onDisplayChanged)
    screen.removeListener('display-added', onDisplayChanged)
    screen.removeListener('display-removed', onDisplayChanged)
    if (notchOverlayWindow === window) {
      notchOverlayWindow = null
    }
    for (const listener of openListeners) {
      listener(false)
    }
  })

  loadNotchOverlay(window)
  for (const listener of openListeners) {
    listener(true)
  }
  return window
}

export function closeNotchOverlay(): void {
  const window = getNotchOverlayWindow()
  if (window) {
    window.close()
  }
  notchOverlayWindow = null
}

app.on('before-quit', () => {
  closeNotchOverlay()
})
