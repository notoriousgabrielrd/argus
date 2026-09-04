/**
 * Geometry ported from DailyNotch (temps-to-clone/daily-notch-tracker): a black pill with a
 * square top flush against the screen edge and generously rounded bottom corners, plus an
 * open-top "tray" outline inset inside it that hugs left, bottom and right.
 */

/** Height of the status line at the bottom edge of the collapsed active pill. The pill never
    outgrows the notch band — no ears, no overhang — so menu-bar items and the window's tab
    strip below stay visible. */
export const COLLAPSED_STATUS_LINE_PX = 3
export const EXPANDED_WIDTH_PX = 360
export const PILL_CORNER_COLLAPSED_PX = 10
export const PILL_CORNER_EXPANDED_PX = 20

export function notchPillPath(width: number, height: number, bottomRadius: number): string {
  const br = Math.min(bottomRadius, width / 2)
  return [
    'M 0 0',
    `L ${width} 0`,
    `L ${width} ${height - br}`,
    `Q ${width} ${height} ${width - br} ${height}`,
    `L ${br} ${height}`,
    `Q 0 ${height} 0 ${height - br}`,
    'Z'
  ].join(' ')
}

export type NotchLayout = {
  width: number
  height: number
  pillCorner: number
}

/** Idle hugs the notch (invisible); active adds a status line below it; expanded is the dashboard. */
export function notchLayout(args: {
  notchWidth: number
  notchHeight: number
  expanded: boolean
  active: boolean
  expandedContentHeight: number
}): NotchLayout {
  if (args.expanded) {
    return {
      width: EXPANDED_WIDTH_PX,
      height: args.notchHeight + 4 + args.expandedContentHeight + 12,
      pillCorner: PILL_CORNER_EXPANDED_PX
    }
  }
  if (args.active) {
    return {
      width: Math.max(args.notchWidth, 1),
      height: args.notchHeight,
      pillCorner: PILL_CORNER_COLLAPSED_PX
    }
  }
  // Idle hugs the real notch (invisible); with no notch there is nothing to show.
  return {
    width: Math.max(args.notchWidth, 1),
    height: args.notchHeight,
    pillCorner: PILL_CORNER_COLLAPSED_PX
  }
}
