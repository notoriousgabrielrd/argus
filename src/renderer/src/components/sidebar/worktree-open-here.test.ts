import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openWorktreeHere } from './worktree-open-here'

const {
  mockState,
  activateAndRevealWorktreeMock,
  launchAgentInNewTabMock,
  openNewTerminalTabInActiveWorkspaceMock,
  createTabMock,
  setActiveTabTypeMock
} = vi.hoisted(() => ({
  mockState: {
    tabsByWorktree: {} as Record<string, { id: string }[]>,
    activeGroupIdByWorktree: {} as Record<string, string>,
    groupsByWorktree: {} as Record<string, { id: string }[]>
  },
  activateAndRevealWorktreeMock: vi.fn(),
  launchAgentInNewTabMock: vi.fn(),
  openNewTerminalTabInActiveWorkspaceMock: vi.fn(async () => {}),
  createTabMock: vi.fn(),
  setActiveTabTypeMock: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      ...mockState,
      openNewTerminalTabInActiveWorkspace: openNewTerminalTabInActiveWorkspaceMock,
      createTab: createTabMock,
      setActiveTabType: setActiveTabTypeMock
    })
  }
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: activateAndRevealWorktreeMock
}))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: launchAgentInNewTabMock
}))

describe('openWorktreeHere', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.tabsByWorktree = {}
    mockState.activeGroupIdByWorktree = {}
    mockState.groupsByWorktree = {}
    activateAndRevealWorktreeMock.mockReturnValue({ primaryTabId: null })
  })

  it('activates the worktree then launches Claude in a new tab', async () => {
    await openWorktreeHere('wt-1', 'claude')
    expect(activateAndRevealWorktreeMock).toHaveBeenCalledWith('wt-1')
    expect(launchAgentInNewTabMock).toHaveBeenCalledWith({
      agent: 'claude',
      worktreeId: 'wt-1',
      launchSource: 'sidebar'
    })
  })

  it('does nothing when activation is refused', async () => {
    activateAndRevealWorktreeMock.mockReturnValue(false)
    await openWorktreeHere('wt-1', 'claude')
    expect(launchAgentInNewTabMock).not.toHaveBeenCalled()
    expect(openNewTerminalTabInActiveWorkspaceMock).not.toHaveBeenCalled()
  })

  it('opens a terminal in the active group of an already-populated worktree', async () => {
    mockState.tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] }
    mockState.activeGroupIdByWorktree = { 'wt-1': 'group-a' }
    await openWorktreeHere('wt-1', 'terminal')
    expect(openNewTerminalTabInActiveWorkspaceMock).toHaveBeenCalledWith('group-a')
    expect(createTabMock).not.toHaveBeenCalled()
  })

  it('reuses the shell seeded by activating an empty worktree', async () => {
    activateAndRevealWorktreeMock.mockImplementation(() => {
      mockState.tabsByWorktree = { 'wt-1': [{ id: 'seeded' }] }
      return { primaryTabId: 'seeded' }
    })
    await openWorktreeHere('wt-1', 'terminal')
    expect(openNewTerminalTabInActiveWorkspaceMock).not.toHaveBeenCalled()
    expect(createTabMock).not.toHaveBeenCalled()
  })

  it('falls back to createTab when the worktree has no tab group', async () => {
    mockState.tabsByWorktree = { 'wt-1': [{ id: 'tab-1' }] }
    await openWorktreeHere('wt-1', 'terminal')
    expect(createTabMock).toHaveBeenCalledWith('wt-1')
    expect(setActiveTabTypeMock).toHaveBeenCalledWith('terminal')
  })
})
