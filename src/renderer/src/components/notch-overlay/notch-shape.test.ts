import { describe, expect, it } from 'vitest'
import { notchLayout, notchPillPath } from './notch-shape'

describe('notchPillPath', () => {
  it('is flush on top and rounds only the bottom corners', () => {
    expect(notchPillPath(100, 40, 12)).toBe(
      'M 0 0 L 100 0 L 100 28 Q 100 40 88 40 L 12 40 Q 0 40 0 28 Z'
    )
  })
})

describe('notchLayout', () => {
  it('hugs the notch when idle, adds a status line when active, and opens the dashboard', () => {
    expect(
      notchLayout({
        notchWidth: 190,
        notchHeight: 33,
        expanded: false,
        active: false,
        expandedContentHeight: 0
      })
    ).toEqual({ width: 190, height: 33, pillCorner: 10 })
    expect(
      notchLayout({
        notchWidth: 190,
        notchHeight: 33,
        expanded: false,
        active: true,
        expandedContentHeight: 0
      })
    ).toEqual({ width: 190, height: 33, pillCorner: 10 })
    expect(
      notchLayout({
        notchWidth: 190,
        notchHeight: 33,
        expanded: true,
        active: true,
        expandedContentHeight: 150
      })
    ).toEqual({ width: 360, height: 199, pillCorner: 20 })
    // No real notch (external monitor): idle collapses to a 1px sliver.
    expect(
      notchLayout({
        notchWidth: 0,
        notchHeight: 33,
        expanded: false,
        active: false,
        expandedContentHeight: 0
      })
    ).toEqual({ width: 1, height: 33, pillCorner: 10 })
  })
})
