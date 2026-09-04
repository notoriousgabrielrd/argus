import { useCallback, useEffect, useState } from 'react'
import { Plus, TerminalSquare, X } from 'lucide-react'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import TerminalPane from '@/components/terminal-pane/TerminalPane'
import { closeTerminalTab } from '@/components/terminal/terminal-tab-actions'
import { translate } from '@/i18n/i18n'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import type { TerminalTab } from '../../../shared/types'

// Why: `?? []` in the selector would mint a fresh array reference on every
// store write, defeating Zustand's reference-equality check and re-rendering
// on unrelated updates (app-store-performance/no-fresh-selector-result).
const EMPTY_TABS: TerminalTab[] = []

/**
 * Main-area terminal that needs no active project. Reuses the floating
 * terminal's sentinel worktree and tabs (main process resolves it to `$HOME`,
 * no repo/worktree record) so "open a terminal" works with or without a
 * workspace open, and the floating overlay and this docked view show the
 * same sessions.
 */
export default function GlobalTerminalPage(): React.JSX.Element {
  // Why: App.tsx keeps this page mounted (CSS-hidden) once opened, so it must
  // know when it's the hidden one to suspend the active pane's renderer —
  // mirrors the floating terminal's `isActive && open` gate on TerminalPane.
  const pageVisible = useAppStore((s) => s.activeView === 'global-terminal')
  const tabs = useAppStore((s) => s.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? EMPTY_TABS)
  const createTab = useAppStore((s) => s.createTab)
  const floatingTerminalCwd = useAppStore((s) => s.settings?.floatingTerminalCwd ?? '')
  // Why not Escape-to-close (unlike Automations/Artifacts): this page's main
  // content is a live terminal, where Escape is routine input (vim, TUIs).
  // A window-level Escape handler would swallow that; only the explicit
  // close button below leaves the page.
  const closeGlobalTerminalPage = useAppStore((s) => s.closeGlobalTerminalPage)
  // Why: e.g. jumping here from an Agents vault session — the page owns its
  // active tab as local state, so it needs this store field to know which
  // tab an outside action wants focused, then clears it once applied.
  const pendingTabId = useAppStore((s) => s.pendingGlobalTerminalTabId)
  const clearPendingTabFocus = useAppStore((s) => s.clearPendingGlobalTerminalTabFocus)
  const [cwd, setCwd] = useState<string | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingTabId) {
      return
    }
    if (tabs.some((tab) => tab.id === pendingTabId)) {
      setActiveTabId(pendingTabId)
    }
    clearPendingTabFocus()
  }, [pendingTabId, tabs, clearPendingTabFocus])

  useEffect(() => {
    let cancelled = false
    void window.api.app.getFloatingTerminalCwd({ path: floatingTerminalCwd }).then((nextCwd) => {
      if (!cancelled) {
        setCwd(nextCwd)
      }
    })
    return () => {
      cancelled = true
    }
  }, [floatingTerminalCwd])

  const handleNewTab = useCallback((): void => {
    const tab = createTab(FLOATING_TERMINAL_WORKTREE_ID)
    setActiveTabId(tab.id)
  }, [createTab])

  // Why one effect: auto-creating the first tab and keeping activeTabId valid
  // both react to `tabs` — splitting them let a second effect's stale
  // closure over the pre-mutation `tabs` clobber the first's fresh
  // setActiveTabId within the same commit.
  useEffect(() => {
    if (tabs.length === 0) {
      if (cwd) {
        handleNewTab()
      } else {
        setActiveTabId(null)
      }
      return
    }
    if (!activeTabId || !tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs.at(-1)!.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Why: handleNewTab's identity is stable (only depends on createTab), so omitting it avoids a spurious extra dependency entry without changing behavior.
  }, [tabs, cwd, activeTabId])

  const handleCloseTab = useCallback(
    (tabId: string): void => {
      const index = tabs.findIndex((tab) => tab.id === tabId)
      const fallback = tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? null
      if (tabId === activeTabId) {
        setActiveTabId(fallback)
      }
      closeTerminalTab(tabId)
    },
    [tabs, activeTabId]
  )

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-editor-surface">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={closeGlobalTerminalPage}
              aria-label={translate(
                'auto.components.GlobalTerminalPage.close',
                'Close global terminal'
              )}
            >
              <X className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.GlobalTerminalPage.close', 'Close global terminal')}
          </TooltipContent>
        </Tooltip>
        <div className="mx-1 h-4 w-px shrink-0 bg-border/50" aria-hidden />
        <TerminalSquare className="size-4 shrink-0 text-muted-foreground" />
        <div
          data-testid="terminal-tab-strip"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              data-current={tab.id === activeTabId ? 'true' : undefined}
              className={cn(
                'group flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
                tab.id === activeTabId
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              <span className="max-w-40 truncate">{tab.customTitle ?? tab.title}</span>
              {tabs.length > 1 && (
                <X
                  className="size-3 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleCloseTab(tab.id)
                  }}
                />
              )}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleNewTab}
          title={translate('auto.components.GlobalTerminalPage.newTab', 'New terminal')}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1">
        {cwd &&
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={`${tab.id}-${tab.generation ?? 0}`}
                className={isActive ? 'absolute inset-0' : 'absolute inset-0 hidden'}
                aria-hidden={!isActive}
              >
                <TerminalPane
                  tabId={tab.id}
                  worktreeId={FLOATING_TERMINAL_WORKTREE_ID}
                  cwd={cwd}
                  isActive={isActive}
                  isVisible={isActive && pageVisible}
                  onPtyExit={(ptyId) =>
                    closeTerminalTab(tab.id, { reason: 'pty-exit', lifecyclePtyId: ptyId })
                  }
                  onCloseTab={() => handleCloseTab(tab.id)}
                />
              </div>
            )
          })}
      </div>
    </div>
  )
}
