import type { WorkspaceSessionState } from '../../../shared/types'

/**
 * Persists the worktree column row, and only when there is one worth persisting.
 *
 * Absent means "single column, derived from activeWorktreeId", so a user who never opens a
 * second column writes exactly the session an older build would — no migration, and nothing for
 * a paired client that does not understand columns to misread.
 */
export function buildWorktreeColumnSessionData(snapshot: {
  visibleWorktreeIds?: readonly string[]
  worktreeColumnRatios?: readonly number[]
}): Pick<WorkspaceSessionState, 'visibleWorktreeIds' | 'worktreeColumnRatios'> {
  if ((snapshot.visibleWorktreeIds?.length ?? 0) <= 1) {
    return {}
  }
  return {
    visibleWorktreeIds: [...(snapshot.visibleWorktreeIds ?? [])],
    worktreeColumnRatios: [...(snapshot.worktreeColumnRatios ?? [])]
  }
}
