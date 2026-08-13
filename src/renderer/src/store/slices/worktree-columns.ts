/**
 * Visible worktree columns — which workspaces are on screen, left to right.
 *
 * Argus renders one workspace at a time, but the renderer has always *mounted* many: every
 * mounted worktree gets its own `WorktreeSplitSurface`, stacked with `absolute inset-0`, and
 * only the active one escapes `hidden`. Columns turn that stack into a row.
 *
 * Two ideas that used to be one:
 *
 *   - **visible** is now plural — every column paints and is measured.
 *   - **focused** stays singular — `activeWorktreeId` still owns keyboard input, the chrome,
 *     and the PTY input claim. The focused worktree is always one of the visible ones.
 *
 * An empty list means "single column", derived from `activeWorktreeId`. That is the default, so
 * a session written before columns existed — and a client that never opens a second one — reads
 * back as exactly today's behavior with no migration.
 */

/** Columns cost real xterm + WebGL + PTY viewport, so the row is bounded rather than open. */
export const MAX_VISIBLE_WORKTREE_COLUMNS = 3

export type WorktreeColumnState = {
  /** Explicit column order. Empty means single-column, derived from the focused worktree. */
  visibleWorktreeIds: readonly string[]
  activeWorktreeId: string | null
}

/**
 * The columns to render, in order. Never returns an empty list while a worktree is focused, and
 * always contains the focused worktree.
 */
export function resolveVisibleWorktreeIds(state: WorktreeColumnState): string[] {
  if (state.visibleWorktreeIds.length === 0) {
    return state.activeWorktreeId ? [state.activeWorktreeId] : []
  }
  const columns = [...state.visibleWorktreeIds]
  // Why: focus can move to a worktree outside the row (deep link, activation from the sidebar
  // while columns are open). Rather than render a focused-but-invisible workspace, adopt it.
  if (state.activeWorktreeId && !columns.includes(state.activeWorktreeId)) {
    columns.push(state.activeWorktreeId)
  }
  return columns
}

export function isSingleColumn(state: WorktreeColumnState): boolean {
  return resolveVisibleWorktreeIds(state).length <= 1
}

/**
 * Opens `worktreeId` as a column and focuses it.
 *
 * Already-open columns are focused in place rather than duplicated. At the cap, the oldest
 * column that is not the one being focused is dropped, so the gesture always succeeds instead
 * of silently doing nothing.
 */
export function openWorktreeColumn(
  state: WorktreeColumnState,
  worktreeId: string,
  options: { after?: string | null } = {}
): { visibleWorktreeIds: string[]; activeWorktreeId: string } {
  const columns = resolveVisibleWorktreeIds(state)
  if (columns.includes(worktreeId)) {
    return { visibleWorktreeIds: columns, activeWorktreeId: worktreeId }
  }
  const anchor = options.after ?? state.activeWorktreeId
  const anchorIndex = anchor ? columns.indexOf(anchor) : -1
  const next = [...columns]
  next.splice(anchorIndex === -1 ? next.length : anchorIndex + 1, 0, worktreeId)
  while (next.length > MAX_VISIBLE_WORKTREE_COLUMNS) {
    const evictIndex = next.findIndex((id) => id !== worktreeId)
    next.splice(evictIndex === -1 ? 0 : evictIndex, 1)
  }
  return { visibleWorktreeIds: next, activeWorktreeId: worktreeId }
}

/**
 * Closes a column. Returns the row plus who to focus next.
 *
 * Closing the last column collapses to single-column rather than leaving nothing focused: a
 * workspace with no visible column and a non-null `activeWorktreeId` would render blank.
 */
export function closeWorktreeColumn(
  state: WorktreeColumnState,
  worktreeId: string
): { visibleWorktreeIds: string[]; activeWorktreeId: string | null } {
  const columns = resolveVisibleWorktreeIds(state)
  const index = columns.indexOf(worktreeId)
  if (index === -1 || columns.length <= 1) {
    return { visibleWorktreeIds: [], activeWorktreeId: state.activeWorktreeId }
  }
  const next = columns.filter((id) => id !== worktreeId)
  const wasFocused = state.activeWorktreeId === worktreeId
  // Why the neighbor to the left: closing the rightmost column should not jump focus across the
  // row. Falling back to index 0 covers closing the leftmost.
  const nextActive = wasFocused
    ? (next[Math.max(0, index - 1)] ?? next[0] ?? null)
    : state.activeWorktreeId
  return {
    visibleWorktreeIds: next.length <= 1 ? [] : next,
    activeWorktreeId: nextActive
  }
}

/**
 * Applies a focus change to the row.
 *
 * With one column this is a plain switch — the row follows focus and stays implicit. With
 * columns open, focusing a worktree that is not on screen swaps it into the focused column
 * rather than growing the row: that keeps the worktree palette meaning "change what I am looking
 * at", while opening a column stays an explicit gesture.
 */
export function focusWorktreeColumn(
  state: WorktreeColumnState,
  worktreeId: string | null
): string[] {
  if (!worktreeId || state.visibleWorktreeIds.length === 0) {
    return []
  }
  const columns = resolveVisibleWorktreeIds(state)
  if (columns.includes(worktreeId)) {
    return columns
  }
  const focusedIndex = state.activeWorktreeId ? columns.indexOf(state.activeWorktreeId) : -1
  if (focusedIndex === -1) {
    return columns
  }
  const next = [...columns]
  next[focusedIndex] = worktreeId
  return next
}

/**
 * Which column gestures a worktree currently offers.
 *
 * Why here and not inline in the menu: the cap is enforced at the gesture rather than by letting
 * `openWorktreeColumn` evict — silently dropping the left-most column when the user asks for one
 * too many reads as a bug, not a limit. Keeping the rule beside the row logic keeps it testable.
 */
export function worktreeColumnMenuState(
  state: WorktreeColumnState,
  worktreeId: string
): { canOpen: boolean; canClose: boolean } {
  const columns = resolveVisibleWorktreeIds(state)
  const isOpen = columns.includes(worktreeId)
  return {
    canOpen: !isOpen && columns.length < MAX_VISIBLE_WORKTREE_COLUMNS,
    canClose: isOpen && columns.length > 1
  }
}

/** Drops columns whose worktree no longer exists (removal, repo unregister). */
export function pruneWorktreeColumns(
  visibleWorktreeIds: readonly string[],
  existsWorktreeId: (worktreeId: string) => boolean
): string[] {
  const next = visibleWorktreeIds.filter((id) => existsWorktreeId(id))
  return next.length === visibleWorktreeIds.length ? [...visibleWorktreeIds] : next
}

/** Re-keys a column after a worktree rename, which changes the id. */
export function renameWorktreeColumn(
  visibleWorktreeIds: readonly string[],
  oldWorktreeId: string,
  newWorktreeId: string
): string[] {
  if (!visibleWorktreeIds.includes(oldWorktreeId)) {
    return [...visibleWorktreeIds]
  }
  return visibleWorktreeIds.map((id) => (id === oldWorktreeId ? newWorktreeId : id))
}

/** Even split by default; explicit ratios are clamped so no column can be squeezed to nothing. */
export const MIN_WORKTREE_COLUMN_RATIO = 0.15

export function normalizeWorktreeColumnRatios(
  ratios: readonly number[] | undefined,
  columnCount: number
): number[] {
  if (columnCount <= 0) {
    return []
  }
  const even = 1 / columnCount
  if (!ratios || ratios.length !== columnCount) {
    return Array.from({ length: columnCount }, () => even)
  }
  const clamped = ratios.map((ratio) =>
    Number.isFinite(ratio) ? Math.max(MIN_WORKTREE_COLUMN_RATIO, ratio) : even
  )
  const total = clamped.reduce((sum, ratio) => sum + ratio, 0)
  return total > 0
    ? clamped.map((ratio) => ratio / total)
    : Array.from({ length: columnCount }, () => even)
}
