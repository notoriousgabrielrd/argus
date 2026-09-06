import { beforeEach, describe, expect, it, vi } from 'vitest'

const callMock = vi.fn()

vi.mock('../runtime-client', async () => {
  class RuntimeClient {
    readonly isRemote: boolean
    call = callMock
    getCliStatus = vi.fn()
    openOrca = vi.fn()

    constructor(
      _userDataPath?: string,
      _requestTimeoutMs?: number,
      remotePairingCode = process.env.ORCA_PAIRING_CODE ?? null,
      environmentSelector = process.env.ORCA_ENVIRONMENT ?? null
    ) {
      this.isRemote = Boolean(remotePairingCode || environmentSelector)
    }
  }

  // Why: re-export the REAL error classes; format.ts narrows with `instanceof`
  // against ./runtime/types, so a look-alike would collapse every CLI error
  // code into the generic `runtime_error` shape.
  const { RuntimeClientError, RuntimeRpcFailureError } = await import('../runtime/types.js')

  return {
    RuntimeClient,
    RuntimeClientError,
    RuntimeRpcFailureError
  }
})

import { main } from '../index'
import { okFixture, queueFixtures } from '../test-fixtures'

const PROJECTS = [{ id: '10134', key: 'AB', name: 'AgendaPower' }]
const ISSUE_TYPES = [
  { id: '10145', name: 'Tarefa' },
  { id: '10147', name: 'Bug' },
  { id: '10146', name: 'Subtarefa', subtask: true }
]

describe('argus jira CLI handlers', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    callMock.mockReset()
    process.env = { ...originalEnv }
    delete process.env.ORCA_WORKTREE_ID
    delete process.env.ORCA_TERMINAL_HANDLE
    delete process.env.ORCA_PAIRING_CODE
    delete process.env.ORCA_ENVIRONMENT
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('resolves project key and issue type name to ids before creating', async () => {
    queueFixtures(
      callMock,
      okFixture('req_projects', PROJECTS),
      okFixture('req_types', ISSUE_TYPES),
      okFixture('req_create', { ok: true, id: '13691', key: 'AB-300', url: 'https://j/AB-300' })
    )

    await main(
      ['jira', 'create', '--project', 'AB', '--type', 'Tarefa', '--title', 'Card', '--body', 'x'],
      '/tmp/repo'
    )

    expect(callMock.mock.calls[0][0]).toBe('jira.listProjects')
    expect(callMock.mock.calls[1][0]).toBe('jira.listIssueTypes')
    expect(callMock.mock.calls[2][0]).toBe('jira.createIssue')
    expect(callMock.mock.calls[2][1]).toMatchObject({
      projectId: '10134',
      issueTypeId: '10145',
      title: 'Card',
      description: 'x'
    })
    expect(process.exitCode).toBeUndefined()
  })

  it('matches issue type names case- and accent-insensitively', async () => {
    queueFixtures(
      callMock,
      okFixture('req_projects', PROJECTS),
      okFixture('req_types', ISSUE_TYPES),
      okFixture('req_create', { ok: true, id: '1', key: 'AB-301', url: 'https://j/AB-301' })
    )

    await main(
      ['jira', 'create', '--project', 'ab', '--type', 'subtarefa', '--title', 'Card'],
      '/tmp/repo'
    )

    expect(callMock.mock.calls[2][1]).toMatchObject({ issueTypeId: '10146' })
  })

  it('lists the valid issue types when the requested one does not exist', async () => {
    queueFixtures(callMock, okFixture('req_projects', PROJECTS), okFixture('req_types', ISSUE_TYPES))

    await main(
      ['jira', 'create', '--project', 'AB', '--type', 'Task', '--title', 'Card'],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenCalledTimes(2)
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain('Tarefa, Bug, Subtarefa')
    expect(process.exitCode).toBe(1)
  })

  it('lists the valid project keys when the requested one does not exist', async () => {
    queueFixtures(callMock, okFixture('req_projects', PROJECTS))

    await main(
      ['jira', 'create', '--project', 'ZZ', '--type', 'Tarefa', '--title', 'Card'],
      '/tmp/repo'
    )

    expect(callMock).toHaveBeenCalledTimes(1)
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain('Available: AB')
    expect(process.exitCode).toBe(1)
  })

  it('resolves everything but creates nothing under --dry-run', async () => {
    queueFixtures(callMock, okFixture('req_projects', PROJECTS), okFixture('req_types', ISSUE_TYPES))

    await main(
      [
        'jira',
        'create',
        '--project',
        'AB',
        '--type',
        'Tarefa',
        '--title',
        'Card',
        '--body',
        'hello',
        '--dry-run'
      ],
      '/tmp/repo'
    )

    expect(callMock.mock.calls.map((call) => call[0])).toEqual([
      'jira.listProjects',
      'jira.listIssueTypes'
    ])
    const printed = vi.mocked(console.log).mock.calls[0][0] as string
    expect(printed).toContain('dry run: nothing was created')
    expect(printed).toContain('description: 5 chars')
    expect(process.exitCode).toBeUndefined()
  })

  it('fails the command when Jira refuses the create', async () => {
    queueFixtures(
      callMock,
      okFixture('req_projects', PROJECTS),
      okFixture('req_types', ISSUE_TYPES),
      okFixture('req_create', { ok: false, error: 'Field summary is required' })
    )

    await main(
      ['jira', 'create', '--project', 'AB', '--type', 'Tarefa', '--title', 'Card'],
      '/tmp/repo'
    )

    expect(vi.mocked(console.error).mock.calls[0][0]).toContain('Field summary is required')
    expect(process.exitCode).toBe(1)
  })

  it('rejects passing both --body and --body-file', async () => {
    await main(
      [
        'jira',
        'create',
        '--project',
        'AB',
        '--type',
        'Tarefa',
        '--title',
        'Card',
        '--body',
        'x',
        '--body-file',
        'card.md'
      ],
      '/tmp/repo'
    )

    expect(callMock).not.toHaveBeenCalled()
    expect(vi.mocked(console.error).mock.calls[0][0]).toContain(
      'Use either --body or --body-file, not both'
    )
    expect(process.exitCode).toBe(1)
  })

  it('reads project and issue type listings without a create', async () => {
    queueFixtures(callMock, okFixture('req_projects', PROJECTS))
    await main(['jira', 'project', 'list'], '/tmp/repo')
    expect(callMock.mock.calls[0][0]).toBe('jira.listProjects')
    expect(vi.mocked(console.log).mock.calls[0][0]).toContain('AB\tAgendaPower\t10134')

    callMock.mockReset()
    queueFixtures(callMock, okFixture('req_types', ISSUE_TYPES))
    await main(['jira', 'type', 'list', '--project', 'AB'], '/tmp/repo')
    expect(callMock.mock.calls[0][0]).toBe('jira.listIssueTypes')
    expect(callMock.mock.calls[0][1]).toMatchObject({ projectIdOrKey: 'AB' })
  })
})
