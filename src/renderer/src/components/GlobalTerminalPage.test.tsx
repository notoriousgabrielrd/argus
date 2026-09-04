// @vitest-environment happy-dom

import { act, useSyncExternalStore, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalTab } from '../../../shared/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import GlobalTerminalPage from './GlobalTerminalPage'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

// Why useSyncExternalStore: a plain `(selector) => selector(snapshot)` mock
// (as used elsewhere for mostly-static stores) can't reflect a mutation the
// component didn't itself cause a re-render for — e.g. closing a background
// tab, which only touches tabsByWorktree, not this component's own state.
// The real Zustand hook re-renders on any selected-slice change; this
// listener-based mock reproduces that instead of masking the gap.
const store = vi.hoisted(() => ({
  tabsByWorktree: {} as Record<string, TerminalTab[]>,
  activeView: 'global-terminal' as string,
  pendingGlobalTerminalTabId: null as string | null,
  nextId: 0,
  listeners: new Set<() => void>()
}))

function notifyStore(): void {
  for (const listener of store.listeners) {
    listener()
  }
}

const mocks = vi.hoisted(() => ({
  createTab: vi.fn(),
  closeTerminalTab: vi.fn(),
  closeGlobalTerminalPage: vi.fn(),
  clearPendingGlobalTerminalTabFocus: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: <T,>(selector: (state: unknown) => T): T =>
    useSyncExternalStore(
      (listener) => {
        store.listeners.add(listener)
        return () => store.listeners.delete(listener)
      },
      () =>
        selector({
          tabsByWorktree: store.tabsByWorktree,
          activeView: store.activeView,
          pendingGlobalTerminalTabId: store.pendingGlobalTerminalTabId,
          createTab: mocks.createTab,
          closeGlobalTerminalPage: mocks.closeGlobalTerminalPage,
          clearPendingGlobalTerminalTabFocus: mocks.clearPendingGlobalTerminalTabFocus,
          settings: { floatingTerminalCwd: '~' }
        })
    )
}))

vi.mock('@/components/terminal-pane/TerminalPane', () => ({
  default: (props: { tabId: string; isActive: boolean; isVisible?: boolean; cwd?: string }) => (
    <div
      data-testid="terminal-pane"
      data-tab-id={props.tabId}
      data-active={props.isActive}
      data-visible={props.isVisible}
      data-cwd={props.cwd}
    />
  )
}))

vi.mock('@/components/terminal/terminal-tab-actions', () => ({
  closeTerminalTab: mocks.closeTerminalTab
}))

let container: HTMLDivElement
let root: Root

function makeTab(id: string): TerminalTab {
  return {
    id,
    ptyId: null,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    title: `Terminal ${id}`,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: Date.now()
  }
}

function addTab(): TerminalTab {
  store.nextId += 1
  const tab = makeTab(String(store.nextId))
  store.tabsByWorktree = {
    ...store.tabsByWorktree,
    [FLOATING_TERMINAL_WORKTREE_ID]: [
      ...(store.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []),
      tab
    ]
  }
  notifyStore()
  return tab
}

async function flush(): Promise<void> {
  // Why a macrotask: React's passive-effect scheduler can run on a
  // MessageChannel/setTimeout tick rather than a microtask, so a promise
  // resolving inside an effect (cwd load -> auto-create tab) needs a real
  // tick to fully settle before the DOM reflects it.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(<GlobalTerminalPage />)
  })
  await flush()
}

function panes(): NodeListOf<HTMLDivElement> {
  return container.querySelectorAll<HTMLDivElement>('[data-testid="terminal-pane"]')
}

function newTerminalButton(): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((button) => button.title === 'New terminal')
}

function tabCloseButtons(): SVGElement[] {
  return [
    ...(container
      .querySelector('[data-testid="terminal-tab-strip"]')
      ?.querySelectorAll<SVGElement>('svg.lucide-x') ?? [])
  ]
}

function pageCloseButton(): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Close global terminal'
  )
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // Why pre-seeded with an empty array, not {}: the component's selector
  // falls back to `?? []`, which would mint a fresh array reference on every
  // getSnapshot() call while this key is absent and defeat
  // useSyncExternalStore's change detection (see the store mock above).
  store.tabsByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [] }
  store.activeView = 'global-terminal'
  store.pendingGlobalTerminalTabId = null
  store.nextId = 0
  mocks.createTab.mockReset().mockImplementation((worktreeId: string) => {
    store.nextId += 1
    const tab = makeTab(String(store.nextId))
    store.tabsByWorktree = {
      ...store.tabsByWorktree,
      [worktreeId]: [...(store.tabsByWorktree[worktreeId] ?? []), tab]
    }
    notifyStore()
    return tab
  })
  mocks.closeTerminalTab.mockReset().mockImplementation((tabId: string) => {
    store.tabsByWorktree = {
      ...store.tabsByWorktree,
      [FLOATING_TERMINAL_WORKTREE_ID]: (
        store.tabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []
      ).filter((tab) => tab.id !== tabId)
    }
    notifyStore()
  })
  mocks.closeGlobalTerminalPage.mockReset()
  mocks.clearPendingGlobalTerminalTabFocus.mockReset().mockImplementation(() => {
    store.pendingGlobalTerminalTabId = null
    notifyStore()
  })
  ;(globalThis as { window: { api: unknown } }).window.api = {
    app: { getFloatingTerminalCwd: vi.fn().mockResolvedValue('/Users/test') }
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  store.listeners.clear()
  vi.clearAllMocks()
})

describe('GlobalTerminalPage', () => {
  it('creates a terminal in the shared sentinel worktree when none exists yet', async () => {
    await render()

    expect(mocks.createTab).toHaveBeenCalledWith(FLOATING_TERMINAL_WORKTREE_ID)
    expect(panes()).toHaveLength(1)
    expect(panes()[0].dataset.cwd).toBe('/Users/test')
    expect(panes()[0].dataset.active).toBe('true')
  })

  it('does not spawn a second tab when one already exists', async () => {
    addTab()
    await render()

    expect(mocks.createTab).not.toHaveBeenCalled()
    expect(panes()).toHaveLength(1)
  })

  it('opens a new tab and switches to it, keeping the previous tab mounted but hidden', async () => {
    const first = addTab()
    await render()

    await act(async () => {
      newTerminalButton()?.click()
    })
    await flush()

    expect(panes()).toHaveLength(2)
    const activePane = [...panes()].find((pane) => pane.dataset.active === 'true')
    expect(activePane?.dataset.tabId).not.toBe(first.id)
    const hiddenPane = [...panes()].find((pane) => pane.dataset.tabId === first.id)
    expect(hiddenPane?.dataset.active).toBe('false')
  })

  it('closes a tab and activates a remaining one', async () => {
    const first = addTab()
    const second = addTab()
    await render()

    const closeButtons = tabCloseButtons()
    expect(closeButtons.length).toBeGreaterThan(0)
    await act(async () => {
      closeButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flush()

    expect(mocks.closeTerminalTab).toHaveBeenCalledWith(first.id)
    expect(panes()).toHaveLength(1)
    expect(panes()[0].dataset.tabId).toBe(second.id)
  })

  it('hides the close control when only one tab remains', async () => {
    addTab()
    await render()

    expect(tabCloseButtons()).toHaveLength(0)
  })

  it('leaves the page through the header close button', async () => {
    addTab()
    await render()

    await act(async () => {
      pageCloseButton()?.click()
    })
    await flush()

    expect(mocks.closeGlobalTerminalPage).toHaveBeenCalledTimes(1)
  })

  it('focuses a tab requested from outside (e.g. the Agents vault) and clears the request', async () => {
    const first = addTab()
    addTab()
    await render()
    expect(panes().length).toBe(2)

    store.pendingGlobalTerminalTabId = first.id
    await act(async () => {
      notifyStore()
    })
    await flush()

    expect(mocks.clearPendingGlobalTerminalTabFocus).toHaveBeenCalledTimes(1)
    const activePane = [...panes()].find((pane) => pane.dataset.active === 'true')
    expect(activePane?.dataset.tabId).toBe(first.id)
  })

  it('stays mounted but suspends the active pane when the surrounding view is hidden', async () => {
    addTab()
    await render()
    expect(panes()[0].dataset.active).toBe('true')

    store.activeView = 'terminal'
    await act(async () => {
      notifyStore()
    })
    await flush()

    // Why active but not visible: App.tsx keeps this page mounted and only
    // CSS-hides it, so the tab stays "active" but its pane must stop
    // rendering (isVisible false) instead of unmounting and losing the PTY.
    expect(panes()[0].dataset.active).toBe('true')
    expect(panes()[0].dataset.visible).toBe('false')
  })
})
