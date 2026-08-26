import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceSessionState } from '../../shared/types'
import { PROJECT_ROSTER_FILENAME } from '../argus/agent-roster-loader'
import { clearProjectAgentCache, PROJECT_AGENTS_DIR } from '../argus/project-agent-definitions'
import { OrcaRuntimeService } from './orca-runtime'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  // Why an app path with no resources/argus/agents: these cases are about what the
  // *workspace* defines, and the baseline Argus ships would otherwise seat six roles
  // into every assertion. Layer precedence has its own suite.
  app: { getPath: vi.fn(() => '/tmp'), getAppPath: vi.fn(() => '/tmp/argus-no-bundle') }
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
  listTerminals: (
    worktree?: string,
    limit?: number,
    opts?: object
  ) => Promise<{ terminals: { handle: string; leafId: string }[] }>
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
    // Reassert per test: a nested block that points this at the checkout must not leak the
    // shipped baseline into the cases that are about what the workspace itself defines.
    vi.mocked(app.getAppPath).mockReturnValue('/tmp/argus-no-bundle')
    workspace = await mkdtemp(join(tmpdir(), 'argus-runtime-seats-'))
    const agentsDir = join(workspace, PROJECT_AGENTS_DIR)
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, 'auditor.md'), '---\nname: AUDITOR\ndescription: a\n---\n')
    await writeFile(join(agentsDir, 'engineer.md'), '---\nname: ENGINEER\ndescription: e\n---\n')

    session = { tabsByWorktree: { [WORKTREE_ID]: [] } } as unknown as WorkspaceSessionState
    // RuntimeStore is module-private to orca-runtime; borrow it from the constructor.
    const store = {
      getRepos: () => [],
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

    expect(listed.seats).toMatchObject([
      { seat: 'AUDITOR', description: 'a', tools: [], handle: 'term-leaf-1' },
      { seat: 'ENGINEER', description: 'e', tools: [], handle: null }
    ])
  })

  it('leaves seats unordered and role-less when the project ships no roster', async () => {
    const listed = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)

    expect(listed.roster).toBeUndefined()
    expect(listed.seats).toMatchObject([
      { seat: 'AUDITOR', role: '', reportsTo: null, depth: 0 },
      { seat: 'ENGINEER', role: '', reportsTo: null, depth: 0 }
    ])
  })

  // Regression: panes opened by the CLI against a workspace no window has synced are
  // absent from the leaf graph. Seats used to be pruned against that emptiness on every
  // read, and assign wrote the pruned map back — so seating one agent deleted the others,
  // and `seat:NAME` reported vacant while `terminal list` still showed the seat.
  describe('when no renderer graph has synced the worktree', () => {
    beforeEach(() => {
      const internals = runtime as unknown as SeatInternals
      // No graph and no live PTY records: liveness cannot see the pane, only the listing can.
      vi.spyOn(internals, 'isSeatOccupantLive').mockReturnValue(false)
      vi.spyOn(internals, 'handleForSeatOccupant').mockReturnValue(null)
      vi.spyOn(internals, 'listTerminals').mockResolvedValue({
        terminals: [
          { handle: 'term-leaf-1', leafId: 'leaf-1' },
          { handle: 'term-leaf-2', leafId: 'leaf-2' }
        ]
      })
    })

    it('keeps the seats it cannot see in the graph instead of deleting them', async () => {
      seedPane('term-1', 'leaf-1')
      await runtime.assignTerminalSeat('term-1', 'AUDITOR')
      seedPane('term-2', 'leaf-2')
      await runtime.assignTerminalSeat('term-2', 'ENGINEER')

      expect(session.seatAssignmentsByWorktree?.[WORKTREE_ID]).toEqual({
        AUDITOR: 'leaf-1',
        ENGINEER: 'leaf-2'
      })
    })

    it('resolves seat:NAME through the terminal listing', async () => {
      seedPane('term-1', 'leaf-1')
      await runtime.assignTerminalSeat('term-1', 'AUDITOR')

      await expect(runtime.resolveTerminalSeat('AUDITOR', `id:${WORKTREE_ID}`)).resolves.toEqual({
        handle: 'term-leaf-1',
        seat: 'AUDITOR'
      })
    })

    it('reports the occupant in the seat listing rather than showing it vacant', async () => {
      seedPane('term-1', 'leaf-1')
      await runtime.assignTerminalSeat('term-1', 'AUDITOR')

      const listed = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)

      expect(listed.seats.find((entry) => entry.seat === 'AUDITOR')?.handle).toBe('term-leaf-1')
    })

    it('still lets a live pane take a seat whose pane is gone, without --force', async () => {
      seedPane('term-1', 'leaf-1')
      await runtime.assignTerminalSeat('term-1', 'AUDITOR')
      const internals = runtime as unknown as SeatInternals
      vi.spyOn(internals, 'listTerminals').mockResolvedValue({
        terminals: [{ handle: 'term-leaf-2', leafId: 'leaf-2' }]
      })
      seedPane('term-2', 'leaf-2')

      await expect(runtime.assignTerminalSeat('term-2', 'AUDITOR')).resolves.toMatchObject({
        seat: 'AUDITOR'
      })
      expect(session.seatAssignmentsByWorktree?.[WORKTREE_ID]).toEqual({ AUDITOR: 'leaf-2' })
    })
  })

  describe('with the baseline Argus ships', () => {
    beforeEach(() => {
      // Point the app path at this checkout so resources/argus/agents resolves. The rest of
      // the suite deliberately points it at nothing, to isolate what the workspace defines.
      vi.mocked(app.getAppPath).mockReturnValue(process.cwd())
      clearProjectAgentCache()
    })

    it('seats the shipped roles alongside the two this workspace defines', async () => {
      const { seats } = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)
      const bySeat = new Map(seats.map((seat) => [seat.seat, seat]))

      expect([...bySeat.keys()].sort()).toEqual([
        'AUDITOR',
        'BOSS',
        'CEO',
        'DESIGNER',
        'ENGINEER',
        'HUNTER'
      ])
      // The union is per seat: the project keeps the two it wrote and gains the rest.
      expect(bySeat.get('AUDITOR')?.source).toBe('project')
      expect(bySeat.get('ENGINEER')?.source).toBe('project')
      expect(bySeat.get('DESIGNER')?.source).toBe('bundled')
      expect(bySeat.get('DESIGNER')?.definitionPath).toContain(join('resources', 'argus', 'agents'))
    })

    it('seats a terminal on a role that only the baseline defines', async () => {
      seedPane('term-1', 'leaf-1')
      // Before the baseline shipped, this rejected with no_project_agents / unknown_project_agent.
      await expect(runtime.assignTerminalSeat('term-1', 'HUNTER')).resolves.toMatchObject({
        seat: 'HUNTER'
      })
    })

    it('drops a baseline role the project turned off in argus.agents.json', async () => {
      await writeFile(
        join(workspace, PROJECT_ROSTER_FILENAME),
        JSON.stringify({
          agents: [{ name: 'ENGINEER', role: 'r', tools: [] }],
          seats: { disabled: ['DESIGNER', 'CEO'] }
        })
      )
      const { seats } = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)
      const names = seats.map((seat) => seat.seat)

      expect(names).not.toContain('DESIGNER')
      expect(names).not.toContain('CEO')
      expect(names).toContain('ENGINEER')
    })

    it('tells the caller where a specialized persona would go', async () => {
      const listed = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)
      // Null repoId in this harness means no store dir; the field is absent rather than a
      // path keyed on `undefined`, which would collide every such workspace into one folder.
      expect(listed.agentStoreDir).toBeUndefined()
    })
  })

  describe('with a project-owned roster', () => {
    beforeEach(async () => {
      await writeFile(
        join(workspace, PROJECT_ROSTER_FILENAME),
        JSON.stringify({
          projectId: 'seated',
          label: 'Seated',
          hierarchy: { VOCÊ: ['ENGINEER'], ENGINEER: ['AUDITOR'], AUDITOR: ['DESIGNER'] },
          agents: [
            { name: 'ENGINEER', role: 'builds', tools: ['Read', 'Edit'] },
            { name: 'AUDITOR', role: 'audits', tools: ['Read'], readOnly: true }
          ]
        })
      )
    })

    it('orders the seats by the chart and carries role, manager, and depth', async () => {
      const listed = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)

      expect(listed.roster).toEqual({ projectId: 'seated', label: 'Seated', source: 'project' })
      expect(listed.seats).toMatchObject([
        { seat: 'ENGINEER', role: 'builds', reportsTo: null, depth: 0, readOnly: false },
        { seat: 'AUDITOR', role: 'audits', reportsTo: 'ENGINEER', depth: 1, readOnly: true }
      ])
    })

    it('reports a charted agent the workspace never defined instead of offering the seat', async () => {
      const listed = await runtime.listProjectAgentSeats(`id:${WORKTREE_ID}`)

      expect(listed.chartOnlyAgents).toEqual(['DESIGNER'])
      expect(listed.seats.map((seat) => seat.seat)).not.toContain('DESIGNER')
    })

    it('still refuses to seat a terminal on a charted agent with no definition', async () => {
      seedPane('term-1', 'leaf-1')

      await expect(runtime.assignTerminalSeat('term-1', 'DESIGNER')).rejects.toThrow(
        /unknown_project_agent:DESIGNER/
      )
    })
  })
})
