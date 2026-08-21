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

const FOLDER_WORKSPACE_ID = 'fw-1'
const WORKSPACE_KEY = `folder:${FOLDER_WORKSPACE_ID}`

type SeatInternals = {
  resolveSeatPaneForHandle: (handle: string) => {
    leafId: string
    tabId: string
    worktreeId: string
  }
  isSeatOccupantLive: (leafId: string) => boolean
  resolveHandleForSeatOccupant: (leafId: string) => Promise<string | null>
  resolveActiveTerminal: () => Promise<string>
}

describe('OrcaRuntimeService seats in a folder workspace', () => {
  let folderPath: string
  let session: WorkspaceSessionState
  let runtime: OrcaRuntimeService

  function seedPane(handle: string, leafId: string): void {
    const internals = runtime as unknown as SeatInternals
    vi.spyOn(internals, 'resolveSeatPaneForHandle').mockImplementation((requested) => ({
      leafId: requested === handle ? leafId : `leaf-for-${requested}`,
      tabId: 'tab-1',
      worktreeId: WORKSPACE_KEY
    }))
  }

  beforeEach(async () => {
    clearProjectAgentCache()
    folderPath = await mkdtemp(join(tmpdir(), 'argus-folder-seats-'))
    const agentsDir = join(folderPath, PROJECT_AGENTS_DIR)
    await mkdir(agentsDir, { recursive: true })
    await writeFile(join(agentsDir, 'auditor.md'), '---\nname: AUDITOR\ndescription: a\n---\n')
    await writeFile(join(agentsDir, 'boss.md'), '---\nname: BOSS\ndescription: b\n---\n')

    session = { tabsByWorktree: { [WORKSPACE_KEY]: [] } } as unknown as WorkspaceSessionState
    const store = {
      getRepos: () => [],
      getProjectGroups: () => [],
      getAllWorktreeMeta: () => ({}),
      getFolderWorkspaces: () => [
        {
          id: FOLDER_WORKSPACE_ID,
          projectGroupId: 'group-1',
          name: 'ap-group workspace',
          folderPath,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 1,
          lastActivityAt: 0,
          createdAt: 0
        }
      ],
      getWorkspaceSession: () => session,
      setWorkspaceSession: (next: WorkspaceSessionState) => {
        session = next
      }
    } as unknown as ConstructorParameters<typeof OrcaRuntimeService>[0]
    runtime = new OrcaRuntimeService(store)

    const internals = runtime as unknown as SeatInternals
    vi.spyOn(internals, 'isSeatOccupantLive').mockReturnValue(true)
    vi.spyOn(internals, 'resolveHandleForSeatOccupant').mockImplementation(
      async (leafId) => `term-${leafId}`
    )
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    clearProjectAgentCache()
    await rm(folderPath, { recursive: true, force: true })
  })

  it('seats a pane whose workspace is a folder, not a git worktree', async () => {
    seedPane('term-1', 'leaf-1')

    const result = await runtime.assignTerminalSeat('term-1', 'AUDITOR')

    expect(result).toMatchObject({ seat: 'AUDITOR', worktreeId: WORKSPACE_KEY })
    expect(session.seatAssignmentsByWorktree).toEqual({ [WORKSPACE_KEY]: { AUDITOR: 'leaf-1' } })
  })

  it('reads the seat definitions from the folder itself', async () => {
    seedPane('term-1', 'leaf-1')

    await expect(runtime.assignTerminalSeat('term-1', 'ENGINEER')).rejects.toThrow(
      /unknown_project_agent:ENGINEER:.*AUDITOR/
    )
  })

  it('lists the folder workspace seats for a folder: selector', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'BOSS')

    const listed = await runtime.listProjectAgentSeats(`id:${WORKSPACE_KEY}`)

    expect(listed).toMatchObject({ worktreeId: WORKSPACE_KEY, worktreePath: folderPath })
    expect(listed.seats.map((seat) => seat.seat).sort()).toEqual(['AUDITOR', 'BOSS'])
    expect(listed.seats.find((seat) => seat.seat === 'BOSS')?.handle).toBe('term-leaf-1')
  })

  it('lists them for the bare folder: selector too, without the id: prefix', async () => {
    const listed = await runtime.listProjectAgentSeats(WORKSPACE_KEY)

    expect(listed.worktreeId).toBe(WORKSPACE_KEY)
  })

  it('resolves seat:<NAME> to the pane holding it', async () => {
    seedPane('term-1', 'leaf-1')
    await runtime.assignTerminalSeat('term-1', 'AUDITOR')

    await expect(runtime.resolveTerminalSeat('AUDITOR', `id:${WORKSPACE_KEY}`)).resolves.toEqual({
      handle: 'term-leaf-1',
      seat: 'AUDITOR'
    })
  })

  it('falls back to the active pane workspace when no selector is given', async () => {
    seedPane('term-1', 'leaf-1')
    const internals = runtime as unknown as SeatInternals
    vi.spyOn(internals, 'resolveActiveTerminal').mockResolvedValue('term-1')

    const listed = await runtime.listProjectAgentSeats()

    expect(listed.worktreePath).toBe(folderPath)
  })

  it('offers folder workspaces to worktree.list only when the caller asks', async () => {
    const withFolders = await runtime.listManagedWorktrees(undefined, 10_000, {
      includeFolderWorkspaces: true
    })
    const legacy = await runtime.listManagedWorktrees()

    expect(withFolders.worktrees.map((worktree) => worktree.id)).toContain(WORKSPACE_KEY)
    expect(legacy.worktrees.map((worktree) => worktree.id)).not.toContain(WORKSPACE_KEY)
  })
})
