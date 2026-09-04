// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { useAiVaultOriginalPaneActions } from './ai-vault-original-pane-actions'

const mocks = vi.hoisted(() => ({
  findOriginalAiVaultSessionPane: vi.fn(),
  activateAndRevealWorktree: vi.fn(),
  activateTabAndFocusPane: vi.fn(),
  requestGlobalTerminalTabFocus: vi.fn(),
  openGlobalTerminalPage: vi.fn(),
  setActiveTabType: vi.fn(),
  toastError: vi.fn()
}))

const storeState = {
  agentStatusByPaneKey: {},
  retainedAgentsByPaneKey: {},
  sleepingAgentSessionsByPaneKey: {},
  tabsByWorktree: {},
  terminalLayoutsByTabId: {},
  requestGlobalTerminalTabFocus: mocks.requestGlobalTerminalTabFocus,
  openGlobalTerminalPage: mocks.openGlobalTerminalPage,
  setActiveTabType: mocks.setActiveTabType
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(storeState), {
    getState: () => storeState
  })
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError }
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activateAndRevealWorktree
}))

vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))

vi.mock('./ai-vault-original-pane', () => ({
  findOriginalAiVaultSessionPane: mocks.findOriginalAiVaultSessionPane
}))

vi.mock('./ai-vault-original-pane-index', () => ({
  createLazyAiVaultOriginalPaneIndex: () => () => null,
  findAiVaultSessionLiveStateInIndex: () => null,
  findOriginalAiVaultSessionPaneInIndex: () => null
}))

let container: HTMLDivElement
let root: Root
let jumpToOriginalPane: ((session: AiVaultSession) => void) | null = null

function Harness(): null {
  const actions = useAiVaultOriginalPaneActions()
  jumpToOriginalPane = actions.jumpToOriginalPane
  return null
}

function session(): AiVaultSession {
  return { sessionId: 's1' } as AiVaultSession
}

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root.render(<Harness />)
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('useAiVaultOriginalPaneActions.jumpToOriginalPane', () => {
  it('routes a global-terminal-hosted session to the global terminal page instead of worktree activation', () => {
    mocks.findOriginalAiVaultSessionPane.mockReturnValue({
      paneKey: 'pane-1',
      worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
      tabId: 'tab-1',
      leafId: 'leaf-1'
    })

    jumpToOriginalPane?.(session())

    expect(mocks.requestGlobalTerminalTabFocus).toHaveBeenCalledWith('tab-1')
    expect(mocks.openGlobalTerminalPage).toHaveBeenCalledTimes(1)
    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
    expect(mocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('still activates a real worktree for a normal session', () => {
    mocks.findOriginalAiVaultSessionPane.mockReturnValue({
      paneKey: 'pane-2',
      worktreeId: 'repo1::worktree1',
      tabId: 'tab-2',
      leafId: 'leaf-2'
    })
    mocks.activateAndRevealWorktree.mockReturnValue(true)

    jumpToOriginalPane?.(session())

    expect(mocks.activateAndRevealWorktree).toHaveBeenCalledWith('repo1::worktree1')
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('terminal')
    expect(mocks.activateTabAndFocusPane).toHaveBeenCalledWith('tab-2', 'leaf-2', {
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    expect(mocks.requestGlobalTerminalTabFocus).not.toHaveBeenCalled()
    expect(mocks.openGlobalTerminalPage).not.toHaveBeenCalled()
  })

  it('shows an error toast when no original pane is found', () => {
    mocks.findOriginalAiVaultSessionPane.mockReturnValue(null)

    jumpToOriginalPane?.(session())

    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(mocks.requestGlobalTerminalTabFocus).not.toHaveBeenCalled()
    expect(mocks.activateAndRevealWorktree).not.toHaveBeenCalled()
  })
})
