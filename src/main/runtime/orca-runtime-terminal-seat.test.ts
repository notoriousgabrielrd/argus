import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSessionState } from '../../shared/types'
import { clearProjectAgentCache, PROJECT_AGENTS_DIR } from '../argus/project-agent-definitions'
import { OrcaRuntimeService } from './orca-runtime'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

const WORKTREE_ID = 'repo::/w'

type SeatInternals = {
  resolveSeatPaneForHandle: (handle: string) => {
    leafId: string
    tabId: string
    worktreeId: string
  }
  getResolvedWorktreeMap: () => Promise<Map<string, { id: string; path: string }>>
  isSeatOccupantLive: (leafId: string) => boolean
  handleForSeatOccupant: (leafId: string) => string | null
  resolveWorktreeSelector: (selector: string) => Promise<{ id: string; path: string }>
}

describe('OrcaRuntimeService project-agent seats', () => {
  let workspace: string
  let session: WorkspaceSessionState
  let runtime: OrcaRuntimeService
  let liveLeafIds: Set<string>

  function seedPane(handle: string, leafId: string): void {
    const internals = runtime as unknown as SeatInternals
    vi.spyOn(internals, 'resolveSeatPaneForHandle').mockImplementation((requested) => ({
      leafId: requested === handle ? leafId : `leaf-for-${requested}`,
      tabId: 'tab-1',
      worktreeId: WORKTREE_ID
    }))
  }

  beforeEach(async () => {
    clearProjectAgentCache()
    workspace = await mkdtemp(join(tmpdir(), 'argus-runtime-seats-'))
    const agentsDir = join(workspace, PROJECT_AGENTS_DIR)
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, 'auditor.md'), '---\nname: AUDITOR\ndescription: a\n---\n')
    await writeFile(join(agentsDir, 'engineer.md'), '---\nname: ENGINEER\ndescription: e\n---\n')

    session = { tabsByWorktree: { [WORKTREE_ID]: [] } } as unknown as WorkspaceSessionState
    // RuntimeStore is module-private to orca-runtime; borrow it from the constructor.
    const store = {
      getWorkspaceSession: () => session,
      setWorkspaceSession: (next: WorkspaceSessionState) => {
        session = next
      }
    } as unknown as ConstructorParameters<typeof OrcaRuntimeService>[0]
    runtime = new OrcaRuntimeService(store)

    liveLeafIds = new Set(['leaf-1', 'leaf-2'])
    const internals = runtime as unknown as SeatInternals
    vi.spyOn(internals, 'getResolvedWorktreeMap').mockResolvedValue(
      new Map([[WORKTREE_ID, { id: WORKTREE_ID, path: workspace }]])
    )
    vi.spyOn(internals, 'resolveWorktreeSelector').mockResolvedValue({
      id: WORKTREE_ID,
      path: workspace
    })
    vi.spyOn(internals, 'isSeatOccupantLive').mockImplementation((leafId) =>
      liveLeafIds.has(leafId)
    )
    vi.spyOn(internals, 'handleForSeatOccupant').mockImplementation((leafId) =>
      liveLeafIds.has(leafId) ? `term-${leafId}` : null
    )
    vi.spyOn(
      runtime as unknown as { getWorkspaceSessionHostIdForWorktree: (id: string) => string },
      'getWorkspaceSessionHostIdForWorktree'
    ).mockReturnValue('local')
    vi.spyOn(
      runtime as unknown as { tryGetWorkspaceSessionHostIdForWorktree: (id: string) => string },
      'tryGetWorkspaceSessionHostIdForWorktree'
    ).mockReturnValue('local')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    clearProjectAgentCache()
    await rm(workspace, { recursive: true, force: true })
  })

  it('persists the assignment keyed by seat name', async () => {
    seedPane('term-1', 'leaf-1')

    const result = await runtime.assignTerminalSeat('term-1', 'AUDITOR')

    expect(result.seat).toBe('AUDITOR')
    expect(session.seatAssignmentsByWorktree).toEqual({ [WORKTREE_ID]: { AUDITOR: 'leaf-1' } })
  })

  it('accepts a lowercase seat and stores the canonical name', async () => {
    seedPane('term-1', 'leaf-1')

    const result = await runtime.assignTerminalSeat('term-1', 'auditor')

    expect(result.seat).toBe('AUDITOR')
    expect(session.seatAssignmentsByWorktree?.[WORKTREE_ID]).toEqual({ AUDITOR: 'leaf-1' })
  })

  it('refuses a name the workspace does not define, naming what it does define', async () => {
    seedPane('term-1', 'leaf-1')

    await expect(runtime.assignTerminalSeat('term-1', 'DESIGNER')).rejects.toThrow(
      /unknown_project_agent:DESIGNER:.*AUDITOR/
    )
    expect(session.seatAssignmentsByWorktree).toBeUndefined()
  })

  it('points at the project directory when the workspace defines no agents', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'argus-bare-'))
    try {
      const internals = runtime as unknown as SeatInternals
      vi.spyOn(internals, 'getResolvedWorktreeMap').mockResolvedValue(
        new Map([[WORKTREE_ID, { id: WORKTREE_ID, path: bare }]])
      )
      seedPane('term-1', 'leaf-1')

      await expect(runtime.assignTerminalSeat('term-1', 'AUDITOR')).rejects.toThrow(
        /no_project_agents:.*\.claude/
      )
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  })

  it('protests when the seat is held by another terminal', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'AUDITOR')
    seedPane('term-2', 'leaf-2')

    await expect(runtime.assignTerminalSeat('term-2', 'AUDITOR')).rejects.toThrow(
      /already assigned/
    )
    expect(session.seatAssignmentsByWorktree?.[WORKTREE_ID]).toEqual({ AUDITOR: 'leaf-1' })
  })

  it('takes the seat with force and names the terminal that lost it', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'AUDITOR')
    seedPane('term-2', 'leaf-2')

    const result = await runtime.assignTerminalSeat('term-2', 'AUDITOR', { force: true })

    expect(result.displacedHandle).toBe('term-leaf-1')
    expect(session.seatAssignmentsByWorktree?.[WORKTREE_ID]).toEqual({ AUDITOR: 'leaf-2' })
  })

  it('vacates the seat a pane already held', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'ENGINEER')

    const result = await runtime.assignTerminalSeat('term-1', 'AUDITOR')

    expect(result.vacatedSeat).toBe('ENGINEER')
    expect(session.seatAssignmentsByWorktree?.[WORKTREE_ID]).toEqual({ AUDITOR: 'leaf-1' })
  })

  it('resolves seat:NAME to the occupying terminal', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'AUDITOR')

    await expect(runtime.resolveTerminalSeat('AUDITOR', `id:${WORKTREE_ID}`)).resolves.toEqual({
      handle: 'term-leaf-1',
      seat: 'AUDITOR'
    })
  })

  it('reports an unassigned seat instead of resolving to some other terminal', async () => {
    await expect(runtime.resolveTerminalSeat('ENGINEER', `id:${WORKTREE_ID}`)).rejects.toThrow(
      /seat_not_assigned:ENGINEER/
    )
  })

  it('drops a seat whose pane is gone, so it cannot resolve to a dead leaf', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'AUDITOR')

    liveLeafIds.delete('leaf-1')

    await expect(runtime.resolveTerminalSeat('AUDITOR', `id:${WORKTREE_ID}`)).rejects.toThrow(
      /seat_not_assigned/
    )
  })

  it('releases the seat on unassign and leaves other seats alone', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'AUDITOR')
    seedPane('term-2', 'leaf-2')
    await runtime.assignTerminalSeat('term-2', 'ENGINEER')
    seedPane('term-1', 'leaf-1')

    const result = await runtime.clearTerminalSeat('term-1')

    expect(result.seat).toBe('AUDITOR')
    expect(session.seatAssignmentsByWorktree?.[WORKTREE_ID]).toEqual({ ENGINEER: 'leaf-2' })
  })

  it('reports no seat for an unseated terminal', async () => {
    seedPane('term-1', 'leaf-1')

    await expect(runtime.clearTerminalSeat('term-1')).resolves.toMatchObject({ seat: null })
  })

  it('lists every defined agent with its occupant, vacant ones included', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'AUDITOR')

    const listed = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)

    expect(listed.seats).toEqual([
      { seat: 'AUDITOR', description: 'a', tools: [], handle: 'term-leaf-1' },
      { seat: 'ENGINEER', description: 'e', tools: [], handle: null }
    ])
  })
})
