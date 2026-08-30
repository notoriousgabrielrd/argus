import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn() },
  BrowserWindow: vi.fn(),
  screen: {
    getPrimaryDisplay: vi.fn(),
    getAllDisplays: vi.fn(() => []),
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('./privileged-window-navigation', () => ({
  installPrivilegedWindowNavigationPolicy: vi.fn()
}))

import {
  computeNotchOverlayBounds,
  detectNotchGeometry,
  pickNotchAnchorDisplay
} from './notch-overlay-window'

const notchDisplay = {
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  workArea: { x: 0, y: 37, width: 1512, height: 945 }
}
const plainDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 25, width: 1920, height: 1055 }
}

describe('detectNotchGeometry', () => {
  it('reads the menu bar height from the work area offset and flags tall bars as notched', () => {
    expect(detectNotchGeometry(notchDisplay)).toEqual({
      menuBarHeight: 37,
      hasNotch: true,
      notchWidth: 190
    })
    expect(detectNotchGeometry(plainDisplay)).toEqual({
      menuBarHeight: 25,
      hasNotch: false,
      notchWidth: 0
    })
  })

  it('falls back to a default bar height when the work area reports no offset', () => {
    const display = { bounds: plainDisplay.bounds, workArea: plainDisplay.bounds }
    expect(detectNotchGeometry(display)).toEqual({
      menuBarHeight: 24,
      hasNotch: false,
      notchWidth: 0
    })
  })
})

describe('computeNotchOverlayBounds', () => {
  it('centers the strip over the notch band at the dashboard width', () => {
    expect(computeNotchOverlayBounds(notchDisplay, null)).toEqual({
      x: 556,
      y: 0,
      width: 400,
      height: 37
    })
  })

  it('hangs the expanded panel below the bar, clamped to the allowed height', () => {
    expect(computeNotchOverlayBounds(notchDisplay, { contentHeight: 200 })).toEqual({
      x: 556,
      y: 0,
      width: 400,
      height: 237
    })
    expect(computeNotchOverlayBounds(notchDisplay, { contentHeight: 10 }).height).toBe(37 + 44)
    expect(computeNotchOverlayBounds(notchDisplay, { contentHeight: 5000 }).height).toBe(37 + 210)
  })

  it('offsets by the display origin', () => {
    const display = {
      bounds: { x: 100, y: 50, width: 1000, height: 800 },
      workArea: { x: 100, y: 87, width: 1000, height: 763 }
    }
    expect(computeNotchOverlayBounds(display, null)).toMatchObject({ x: 400, y: 50 })
  })
})

describe('pickNotchAnchorDisplay', () => {
  it('prefers the internal display even when an external monitor is primary', () => {
    const external = { ...plainDisplay, internal: false }
    const builtIn = { ...notchDisplay, internal: true }
    expect(pickNotchAnchorDisplay([external, builtIn], external)).toBe(builtIn)
  })

  it('falls back to the notch heuristic, then to the primary display', () => {
    expect(pickNotchAnchorDisplay([plainDisplay, notchDisplay], plainDisplay)).toBe(notchDisplay)
    expect(pickNotchAnchorDisplay([plainDisplay], plainDisplay)).toBe(plainDisplay)
  })
})
