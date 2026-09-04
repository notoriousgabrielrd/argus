import { useAppStore } from '@/store'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'

export type WorktreeOpenHereTarget = 'claude' | 'terminal'

function terminalTabCount(worktreeId: string): number {
  return useAppStore.getState().tabsByWorktree[worktreeId]?.length ?? 0
}

/** Activate the worktree, then open a Claude or plain shell tab inside it. */
export async function openWorktreeHere(
  worktreeId: string,
  target: WorktreeOpenHereTarget
): Promise<void> {
  const tabsBefore = terminalTabCount(worktreeId)
  if (activateAndRevealWorktree(worktreeId) === false) {
    return
  }
  if (target === 'claude') {
    launchAgentInNewTab({
      agent: 'claude',
      worktreeId,
      launchSource: 'sidebar'
    })
    return
  }
  // Why: activating an empty worktree already seeds its first shell; a second one would be noise.
  if (terminalTabCount(worktreeId) > tabsBefore) {
    return
  }
  const store = useAppStore.getState()
  const groupId =
    store.activeGroupIdByWorktree[worktreeId] ?? store.groupsByWorktree[worktreeId]?.[0]?.id
  if (groupId) {
    await store.openNewTerminalTabInActiveWorkspace(groupId)
    return
  }
  store.createTab(worktreeId)
  store.setActiveTabType('terminal')
}
