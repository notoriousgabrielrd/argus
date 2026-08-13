/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TabGroupLayoutNode } from '../../../../shared/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Why mocked: this test is about the row — which surfaces are visible, which one is focused, and
// what a click does. The pane internals own their own tests and would drag in xterm/WebGL.
const surfaceProps: { worktreeId: string; isWorktreeActive: boolean; isWorktreeFocused?: boolean }[] =
  []
vi.mock('../terminal-pane/TerminalPaneOverlayLayer', () => ({
  default: (props: { worktreeId: string; isWorktreeActive: boolean; isWorktreeFocused?: boolean }) => {
    surfaceProps.push(props)
    return null
  }
}))
vi.mock('../tab-group/TabGroupSplitLayout', () => ({ default: () => null }))
vi.mock('../browser-pane/BrowserPaneOverlayLayer', () => ({
  RetainedBrowserPaneOverlayLayer: () => null
}))
vi.mock('../emulator-pane/EmulatorPaneOverlayLayer', () => ({ default: () => null }))
const dropLayerEnabled: boolean[] = []
vi.mock('../tab-group/AiVaultSessionDropLayer', () => ({
  default: ({ enabled }: { enabled: boolean }) => {
    dropLayerEnabled.push(enabled)
    return null
  }
}))
vi.mock('../browser-pane/browser-automation-visibility', () => ({
  useBrowserAutomationVisibilityForAny: () => false
}))
vi.mock('@/lib/pane-manager/browser-mobile-driver-state', () => ({
  useBrowserMobileDriverForAny: () => false
}))
vi.mock('@/store', () => ({
  useAppStore: () => []
}))

import WorktreeColumnRow, { type WorktreeColumnSurface } from './WorktreeColumnRow'

const LAYOUT: TabGroupLayoutNode = { type: 'leaf', groupId: 'group-1' }

function surface(worktreeId: string): WorktreeColumnSurface {
  return {
    worktreeId,
    worktreePath: `/repo/${worktreeId}`,
    layout: LAYOUT,
    shouldMeasureHiddenWorktree: false,
    shouldColdParkTerminalPanes: false,
    isForceParked: false,
    backgroundMountTabIds: null,
    activationDeferredMountTabIds: null
  }
}

let container: HTMLDivElement
let root: Root

function render(props: {
  visibleWorktreeIds: string[]
  focusedWorktreeId: string | null
  mounted: string[]
  onFocusWorktree?: (worktreeId: string) => void
}): void {
  const surfaces = new Map(props.mounted.map((id) => [id, surface(id)]))
  act(() => {
    root.render(
      <WorktreeColumnRow
        visibleWorktreeIds={props.visibleWorktreeIds}
        focusedWorktreeId={props.focusedWorktreeId}
        columnRatios={props.visibleWorktreeIds.map(() => 1 / props.visibleWorktreeIds.length)}
        surfacesByWorktreeId={surfaces}
        activityTerminalPortals={[]}
        onFocusWorktree={props.onFocusWorktree ?? (() => {})}
        onResizeColumns={() => {}}
      />
    )
  })
}

function columns(): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-worktree-column]')]
}

describe('WorktreeColumnRow', () => {
  beforeEach(() => {
    surfaceProps.length = 0
    dropLayerEnabled.length = 0
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders one column, visible and focused — the pre-columns behavior', () => {
    render({ visibleWorktreeIds: ['wt-1'], focusedWorktreeId: 'wt-1', mounted: ['wt-1'] })

    expect(columns()).toHaveLength(1)
    expect(columns()[0].dataset.worktreeColumnFocused).toBe('true')
    expect(surfaceProps).toEqual([
      expect.objectContaining({ worktreeId: 'wt-1', isWorktreeActive: true, isWorktreeFocused: true })
    ])
  })

  it('renders two columns side by side, with exactly one focused', () => {
    render({
      visibleWorktreeIds: ['wt-1', 'wt-2'],
      focusedWorktreeId: 'wt-2',
      mounted: ['wt-1', 'wt-2']
    })

    expect(columns().map((column) => column.dataset.worktreeColumn)).toEqual(['wt-1', 'wt-2'])
    // Both paint; only one owns input. This is the split the whole feature rests on.
    expect(surfaceProps.every((props) => props.isWorktreeActive)).toBe(true)
    expect(surfaceProps.filter((props) => props.isWorktreeFocused)).toHaveLength(1)
    expect(
      surfaceProps.find((props) => props.isWorktreeFocused)?.worktreeId
    ).toBe('wt-2')
  })

  it('gives the drop target to the focused column only', () => {
    render({
      visibleWorktreeIds: ['wt-1', 'wt-2'],
      focusedWorktreeId: 'wt-1',
      mounted: ['wt-1', 'wt-2']
    })

    expect(dropLayerEnabled.filter(Boolean)).toHaveLength(1)
  })

  it('keeps mounted-but-off-screen worktrees rendered and out of the row', () => {
    render({
      visibleWorktreeIds: ['wt-1'],
      focusedWorktreeId: 'wt-1',
      mounted: ['wt-1', 'wt-hidden']
    })

    expect(columns()).toHaveLength(1)
    const hidden = surfaceProps.find((props) => props.worktreeId === 'wt-hidden')
    expect(hidden).toMatchObject({ isWorktreeActive: false, isWorktreeFocused: false })
  })

  it('places a divider between columns but never before the first', () => {
    render({
      visibleWorktreeIds: ['wt-1', 'wt-2', 'wt-3'],
      focusedWorktreeId: 'wt-1',
      mounted: ['wt-1', 'wt-2', 'wt-3']
    })

    expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2)
  })

  it('focuses an unfocused column on pointer down, before the pane can swallow it', () => {
    const onFocusWorktree = vi.fn()
    render({
      visibleWorktreeIds: ['wt-1', 'wt-2'],
      focusedWorktreeId: 'wt-1',
      mounted: ['wt-1', 'wt-2'],
      onFocusWorktree
    })

    act(() => {
      columns()[1].dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    })

    expect(onFocusWorktree).toHaveBeenCalledWith('wt-2')
  })

  it('does not re-focus the column that already has focus', () => {
    const onFocusWorktree = vi.fn()
    render({
      visibleWorktreeIds: ['wt-1', 'wt-2'],
      focusedWorktreeId: 'wt-1',
      mounted: ['wt-1', 'wt-2'],
      onFocusWorktree
    })

    act(() => {
      columns()[0].dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    })

    expect(onFocusWorktree).not.toHaveBeenCalled()
  })

  it('skips a visible worktree with no mounted surface instead of rendering an empty column', () => {
    render({ visibleWorktreeIds: ['wt-1', 'wt-gone'], focusedWorktreeId: 'wt-1', mounted: ['wt-1'] })

    expect(columns()).toHaveLength(1)
  })
})
