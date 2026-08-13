import React, { useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { TabGroupLayoutNode } from '../../../../shared/types'
import { useAppStore } from '@/store'
import { useBrowserAutomationVisibilityForAny } from '../browser-pane/browser-automation-visibility'
import { useBrowserMobileDriverForAny } from '@/lib/pane-manager/browser-mobile-driver-state'
import TerminalPaneOverlayLayer from '../terminal-pane/TerminalPaneOverlayLayer'
import { RetainedBrowserPaneOverlayLayer } from '../browser-pane/BrowserPaneOverlayLayer'
import EmulatorPaneOverlayLayer from '../emulator-pane/EmulatorPaneOverlayLayer'
import TabGroupSplitLayout from '../tab-group/TabGroupSplitLayout'
import AiVaultSessionDropLayer from '../tab-group/AiVaultSessionDropLayer'
import type { ActivityTerminalPortalTarget } from '../activity/activity-terminal-portal'
import { MIN_WORKTREE_COLUMN_RATIO } from '@/store/slices/worktree-columns'

/**
 * The workspace body: worktree columns side by side, plus the mounted-but-off-screen surfaces.
 *
 * Argus has always mounted every worktree it has visited — each one gets a full
 * `WorktreeSplitSurface`, and only the active one escaped `hidden`. This lays the visible ones
 * out in a row instead of stacking them.
 *
 * Two ideas that used to be one prop:
 *
 *   - **visible** is plural. A visible surface paints, is measured, and its PTYs are sized to
 *     the column that holds them.
 *   - **focused** is singular. It owns keyboard input, the surrounding chrome, and the PTY
 *     input claim. It is always one of the visible ones.
 *
 * Off-screen surfaces keep the original `absolute inset-0` treatment so they cannot reflow a
 * column, which is what the stacking was for in the first place.
 */

export type WorktreeColumnSurface = {
  worktreeId: string
  worktreePath: string
  layout: TabGroupLayoutNode
  focusedGroupId?: string
  shouldMeasureHiddenWorktree: boolean
  shouldColdParkTerminalPanes: boolean
  isForceParked: boolean
  backgroundMountTabIds: ReadonlySet<string> | null
  activationDeferredMountTabIds: ReadonlySet<string> | null
}

export default function WorktreeColumnRow({
  visibleWorktreeIds,
  focusedWorktreeId,
  columnRatios,
  surfacesByWorktreeId,
  activityTerminalPortals,
  onFocusWorktree,
  onResizeColumns
}: {
  visibleWorktreeIds: readonly string[]
  focusedWorktreeId: string | null
  columnRatios: readonly number[]
  /** Every mounted surface, visible or not, keyed by worktree id. */
  surfacesByWorktreeId: ReadonlyMap<string, WorktreeColumnSurface>
  activityTerminalPortals: ActivityTerminalPortalTarget[]
  onFocusWorktree: (worktreeId: string) => void
  onResizeColumns: (ratios: number[]) => void
}): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null)
  const visible = new Set(visibleWorktreeIds)
  const hiddenSurfaces = [...surfacesByWorktreeId.values()].filter(
    (surface) => !visible.has(surface.worktreeId)
  )

  const startResize = useCallback(
    (dividerIndex: number, event: React.PointerEvent<HTMLDivElement>) => {
      const row = rowRef.current
      if (!row || visibleWorktreeIds.length < 2) {
        return
      }
      event.preventDefault()
      const rowWidth = row.getBoundingClientRect().width
      if (rowWidth <= 0) {
        return
      }
      const startX = event.clientX
      const startRatios = [...columnRatios]
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)

      const onMove = (moveEvent: PointerEvent): void => {
        // Why only the adjacent pair moves: dragging one divider must not resize columns on the
        // far side of the row, which is how the tab-group divider behaves too.
        const delta = (moveEvent.clientX - startX) / rowWidth
        const left = startRatios[dividerIndex] + delta
        const right = startRatios[dividerIndex + 1] - delta
        if (left < MIN_WORKTREE_COLUMN_RATIO || right < MIN_WORKTREE_COLUMN_RATIO) {
          return
        }
        const next = [...startRatios]
        next[dividerIndex] = left
        next[dividerIndex + 1] = right
        onResizeColumns(next)
      }
      const onUp = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [columnRatios, onResizeColumns, visibleWorktreeIds.length]
  )

  return (
    <div ref={rowRef} className="relative flex flex-1 min-w-0 min-h-0 overflow-hidden">
      {visibleWorktreeIds.map((worktreeId, index) => {
        const surface = surfacesByWorktreeId.get(worktreeId)
        if (!surface) {
          return null
        }
        const isFocused = worktreeId === focusedWorktreeId
        return (
          <React.Fragment key={`worktree-column-${worktreeId}`}>
            {index > 0 ? (
              <div
                role="separator"
                aria-orientation="vertical"
                className="relative z-10 w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-['']"
                onPointerDown={(event) => startResize(index - 1, event)}
              />
            ) : null}
            <div
              className="relative flex min-w-0 min-h-0 overflow-hidden"
              style={{ flex: `${columnRatios[index] ?? 1} 1 0%` }}
              // Why capture: a click anywhere in an unfocused column should focus it before the
              // pane's own handlers run, so the first click is not swallowed by a terminal.
              onPointerDownCapture={isFocused ? undefined : () => onFocusWorktree(worktreeId)}
              data-worktree-column={worktreeId}
              data-worktree-column-focused={isFocused ? 'true' : 'false'}
            >
              <WorktreeSplitSurface
                {...surface}
                isVisible
                isFocused={isFocused}
                activityTerminalPortals={activityTerminalPortals}
              />
            </div>
          </React.Fragment>
        )
      })}
      {hiddenSurfaces.map((surface) => (
        <WorktreeSplitSurface
          key={`worktree-hidden-${surface.worktreeId}`}
          {...surface}
          isVisible={false}
          isFocused={false}
          activityTerminalPortals={activityTerminalPortals}
        />
      ))}
    </div>
  )
}

export const WorktreeSplitSurface = React.memo(function WorktreeSplitSurface({
  worktreeId,
  worktreePath,
  layout,
  focusedGroupId,
  isVisible,
  isFocused,
  shouldMeasureHiddenWorktree,
  shouldColdParkTerminalPanes,
  isForceParked,
  activityTerminalPortals,
  backgroundMountTabIds,
  activationDeferredMountTabIds
}: WorktreeColumnSurface & {
  /** Paints and is measured. Plural — every column is visible. */
  isVisible: boolean
  /** Owns keyboard input and the PTY input claim. Singular across the whole row. */
  isFocused: boolean
  activityTerminalPortals: ActivityTerminalPortalTarget[]
}): React.JSX.Element {
  const browserPageIds = useAppStore(
    useShallow((state) =>
      (state.browserTabsByWorktree[worktreeId] ?? []).flatMap((tab) =>
        tab.pageIds && tab.pageIds.length > 0 ? tab.pageIds : [tab.activePageId ?? tab.id]
      )
    )
  )
  const hasAutomationVisibleBrowser = useBrowserAutomationVisibilityForAny(browserPageIds)
  const hasMobileDrivenBrowser = useBrowserMobileDriverForAny(browserPageIds)
  const shouldKeepPaintable =
    shouldMeasureHiddenWorktree || hasAutomationVisibleBrowser || hasMobileDrivenBrowser

  return (
    <div
      className={
        isVisible
          ? 'absolute inset-0 flex'
          : shouldKeepPaintable
            ? 'absolute inset-0 flex opacity-0 pointer-events-none'
            : 'absolute inset-0 hidden'
      }
      // Why: paintable-but-hidden webviews must be inert so they stay unreachable by Tab / assistive tech.
      inert={!isVisible}
      aria-hidden={!isVisible}
    >
      <TabGroupSplitLayout
        layout={layout}
        worktreeId={worktreeId}
        focusedGroupId={focusedGroupId}
        isWorktreeActive={isVisible}
      />
      <TerminalPaneOverlayLayer
        worktreeId={worktreeId}
        worktreePath={worktreePath}
        isWorktreeActive={isVisible}
        // Why focus, not visibility: an unfocused column still paints and is sized, but it must
        // not claim terminal input — two columns claiming it would race over one keyboard.
        isWorktreeFocused={isFocused}
        coldParkTerminalPanes={shouldColdParkTerminalPanes}
        isForceParked={isForceParked}
        shouldMeasureHiddenWorktree={shouldMeasureHiddenWorktree}
        activityTerminalPortals={activityTerminalPortals}
        backgroundMountTabIds={backgroundMountTabIds}
        activationDeferredMountTabIds={activationDeferredMountTabIds}
      />
      {/* Why: once eligible, retain slot DOM so hidden worktrees keep their Electron guests alive (STA-3228). */}
      <RetainedBrowserPaneOverlayLayer
        worktreeId={worktreeId}
        isWorktreeActive={isVisible}
        mountEligible={
          isVisible ||
          backgroundMountTabIds === null ||
          hasAutomationVisibleBrowser ||
          hasMobileDrivenBrowser
        }
      />
      {isVisible || backgroundMountTabIds === null ? (
        <EmulatorPaneOverlayLayer worktreeId={worktreeId} isWorktreeActive={isVisible} />
      ) : null}
      {/* Why focus: a drop target has to be unambiguous, so only the focused column accepts. */}
      <AiVaultSessionDropLayer worktreeId={worktreeId} enabled={isFocused} />
    </div>
  )
})
