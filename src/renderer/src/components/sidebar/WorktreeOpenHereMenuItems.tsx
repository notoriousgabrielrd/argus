import React from 'react'
import { SquareTerminal } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { AgentIcon } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import { openWorktreeHere, type WorktreeOpenHereTarget } from './worktree-open-here'

function stopMenuPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation()
}

export const WORKTREE_OPEN_HERE_TARGETS: readonly WorktreeOpenHereTarget[] = ['claude', 'terminal']

function openHereLabel(target: WorktreeOpenHereTarget): string {
  return target === 'claude'
    ? translate('auto.components.sidebar.WorktreeOpenHereMenuItems.openHereClaude', 'Claude')
    : translate('auto.components.sidebar.WorktreeOpenHereMenuItems.openHereTerminal', 'Terminal')
}

/** In-Argus targets listed above the external apps: open a Claude or shell tab in the worktree. */
export function WorktreeOpenHereMenuItems({
  worktreeId,
  disabled
}: {
  worktreeId: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <>
      {WORKTREE_OPEN_HERE_TARGETS.map((target) => (
        <DropdownMenuItem
          key={target}
          data-open-here-target={target}
          onClick={stopMenuPropagation}
          onSelect={() => {
            void openWorktreeHere(worktreeId, target)
          }}
          disabled={disabled}
        >
          {target === 'claude' ? (
            <AgentIcon agent="claude" size={14} />
          ) : (
            <SquareTerminal className="size-3.5" />
          )}
          <span className="min-w-0 truncate">{openHereLabel(target)}</span>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
    </>
  )
}
