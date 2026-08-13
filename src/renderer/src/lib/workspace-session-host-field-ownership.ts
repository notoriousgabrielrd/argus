import type { WorkspaceSessionState } from '../../../shared/types'

export type WorkspaceSessionFieldOwnership =
  | 'global'
  | 'hostPrivate'
  | 'worktreeKeyed'
  | 'worktreeArray'
  | 'tabKeyed'
  | 'browserWorkspaceKeyed'
  | 'fileKeyed'
  | 'sleepingAgentKeyed'
  | 'paneKeyed'
  | 'surfaceTombstoneKeyed'

export const WORKSPACE_SESSION_FIELD_OWNERSHIP = {
  activeRepoId: 'global',
  activeWorktreeId: 'global',
  activeWorkspaceExecutionHostId: 'global',
  activeTabId: 'global',
  browserUrlHistory: 'global',
  // Why: SSH remains local-owned, so its connection identifiers stay in the local slice.
  activeConnectionIdsAtShutdown: 'global',
  tabsByWorktree: 'worktreeKeyed',
  openFilesByWorktree: 'worktreeKeyed',
  activeFileIdByWorktree: 'worktreeKeyed',
  activeBrowserTabIdByWorktree: 'worktreeKeyed',
  activeTabTypeByWorktree: 'worktreeKeyed',
  activeTabIdByWorktree: 'worktreeKeyed',
  // Why worktree-keyed, not global: a project-agent seat names a pane inside one worktree,
  // and seat names repeat across worktrees (each can have its own AUDITOR).
  seatAssignmentsByWorktree: 'worktreeKeyed',
  browserTabsByWorktree: 'worktreeKeyed',
  unifiedTabs: 'worktreeKeyed',
  tabGroups: 'worktreeKeyed',
  tabGroupLayouts: 'worktreeKeyed',
  activeGroupIdByWorktree: 'worktreeKeyed',
  lastVisitedAtByWorktreeId: 'worktreeKeyed',
  defaultTerminalTabsAppliedByWorktreeId: 'worktreeKeyed',
  activeWorkspaceKey: 'global',
  // Why global, not worktree-keyed: these describe how the window is composed, not per-worktree
  // data. A paired client that never opens a second column simply ignores them and keeps
  // rendering the one worktree activeWorktreeId names.
  visibleWorktreeIds: 'global',
  worktreeColumnRatios: 'global',
  activeWorktreeIdsOnShutdown: 'worktreeArray',
  terminalLayoutsByTabId: 'tabKeyed',
  remoteSessionIdsByTabId: 'tabKeyed',
  browserPagesByWorkspace: 'browserWorkspaceKeyed',
  markdownFrontmatterVisible: 'fileKeyed',
  sleepingAgentSessionsByPaneKey: 'sleepingAgentKeyed',
  terminalPtyIncarnationsByPaneKey: 'paneKeyed',
  // Why: this host-issued fence must never collide while unified renderer state merges equal repo ids across hosts.
  terminalTopologyRevisionByRepoId: 'hostPrivate',
  terminalSurfaceTombstonesByPaneKey: 'surfaceTombstoneKeyed'
} as const satisfies Record<keyof WorkspaceSessionState, WorkspaceSessionFieldOwnership>

// Why: an unclassified persisted field would otherwise disappear from every non-local host.
type MissingOwnership = Exclude<
  keyof WorkspaceSessionState,
  keyof typeof WORKSPACE_SESSION_FIELD_OWNERSHIP
>
const exhaustive: [MissingOwnership] extends [never] ? true : never = true
void exhaustive

export const GLOBAL_WORKSPACE_SESSION_FIELDS = (
  Object.keys(WORKSPACE_SESSION_FIELD_OWNERSHIP) as (keyof WorkspaceSessionState)[]
).filter((field) => WORKSPACE_SESSION_FIELD_OWNERSHIP[field] === 'global')
