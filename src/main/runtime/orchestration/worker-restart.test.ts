import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../orca-runtime'
import type { OrchestrationDb } from './db'
import { restartReclaimedWorker } from './worker-restart'

const DEAD_DISPATCH = 'ctx_dead'
const TASK = 'task_1'

function startOptions(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    autoRestart: true,
    devMode: false,
    worktree: 'current',
    resolvedWorktreeId: 'repo_1::/w/feature',
    terminal: null,
    agent: 'codex',
    launch: { requested: { agent: 'codex', model: null, effort: null } },
    ...overrides
  })
}

function fakeDb(overrides: Partial<Record<string, unknown>> = {}): OrchestrationDb {
  const base = {
    getWorkerDispatch: () => ({
      dispatch_id: DEAD_DISPATCH,
      worktree_id: 'repo_1::/w/feature',
      start_options: startOptions()
    }),
    getFederatedDispatch: () => undefined,
    getTask: () => ({ id: TASK, run_id: 'run_1', spec: 'Fix the login button', status: 'ready' }),
    getRun: () => ({ id: 'run_1', coordinator_handle: 'term_coord' }),
    createStartingWorkerDispatch: () => ({
      dispatch: { id: 'ctx_new' },
      worker: { dispatch_id: 'ctx_new' }
    }),
    recordWorkerStage: () => undefined,
    prepareStartingWorkerAuthority: () => 'cap_token',
    markWorkerDispatchReady: () => ({ dispatch_id: 'ctx_new', state: 'ready' }),
    failWorkerStart: () => ({ dispatch_id: 'ctx_new', state: 'failed' }),
    ...overrides
  }
  return base as unknown as OrchestrationDb
}

function fakeRuntime(overrides: Partial<Record<string, unknown>> = {}): OrcaRuntimeService {
  const base = {
    validateOrchestrationAgentLauncher: () => undefined,
    getRuntimeId: () => 'runtime_1',
    createTerminal: async () => ({ handle: 'term_new', worktreeId: 'repo_1::/w/feature' }),
    waitForTerminal: async () => ({ satisfied: true, status: 'tui-idle' }),
    getOrchestrationDispatchAuthority: () => ({
      paneKey: 'pane_new',
      processIncarnation: 'pty_new:inc',
      launchTokenHash: null,
      hostScope: null
    }),
    getTerminalPaneKey: () => 'pane_new',
    getTerminalProcessIncarnation: () => 'pty_new:inc',
    getTerminalOrchestrationCliCommand: () => 'argus',
    resolveDispatchRosterForTerminal: async () => ({ teammates: [] }),
    sendTerminalAgentPrompt: async () => undefined,
    ...overrides
  }
  return base as unknown as OrcaRuntimeService
}

function restart(db: OrchestrationDb, runtime: OrcaRuntimeService) {
  return restartReclaimedWorker({ db, runtime, deadDispatchId: DEAD_DISPATCH, taskId: TASK })
}

describe('restartReclaimedWorker', () => {
  it('relaunches the same agent in the same worktree and injects the task', async () => {
    const createTerminal = vi.fn(async () => ({ handle: 'term_new' }))
    const sendTerminalAgentPrompt = vi.fn(async (_handle: string, _prompt: string) => undefined)

    const outcome = await restart(fakeDb(), fakeRuntime({ createTerminal, sendTerminalAgentPrompt }))

    expect(outcome).toEqual({
      restarted: true,
      dispatchId: 'ctx_new',
      taskId: TASK,
      terminalHandle: 'term_new'
    })
    expect(createTerminal).toHaveBeenCalledWith(
      'id:repo_1::/w/feature',
      expect.objectContaining({ startupAgent: 'codex', surfaceOwner: false })
    )
    const prompt = sendTerminalAgentPrompt.mock.calls[0]![1]
    expect(prompt).toContain('Fix the login button')
    expect(prompt).toContain('ctx_new')
  })

  it('links the replacement to the dispatch it replaces', async () => {
    const createStartingWorkerDispatch = vi.fn(() => ({
      dispatch: { id: 'ctx_new' },
      worker: { dispatch_id: 'ctx_new' }
    }))

    await restart(fakeDb({ createStartingWorkerDispatch }), fakeRuntime())

    expect(createStartingWorkerDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: TASK, retryOf: DEAD_DISPATCH })
    )
  })

  it('carries the recorded model pin into the replacement launch', async () => {
    const createTerminal = vi.fn(async () => ({ handle: 'term_new' }))
    const db = fakeDb({
      getWorkerDispatch: () => ({
        dispatch_id: DEAD_DISPATCH,
        worktree_id: 'repo_1::/w/feature',
        start_options: startOptions({
          agent: 'claude',
          launch: { requested: { agent: 'claude', model: 'opus-5', effort: 'high' } }
        })
      })
    })

    const outcome = await restart(db, fakeRuntime({ createTerminal }))

    expect(outcome).toMatchObject({ restarted: true })
    // The replacement runs the engine the coordinator chose, not the agent's default.
    expect(createTerminal).toHaveBeenCalledWith(
      'id:repo_1::/w/feature',
      expect.objectContaining({
        startupAgent: 'claude',
        launchPreferences: expect.anything()
      })
    )
  })

  it('stops rather than downgrade when the recorded agent no longer launches', async () => {
    const createTerminal = vi.fn(async () => ({ handle: 'term_new' }))
    const runtime = fakeRuntime({
      createTerminal,
      validateOrchestrationAgentLauncher: () => {
        throw new Error('agent_launcher_missing')
      }
    })

    const outcome = await restart(fakeDb(), runtime)

    expect(outcome).toMatchObject({
      restarted: false,
      reason: 'launch_unsupported',
      detail: 'agent_launcher_missing'
    })
    expect(createTerminal).not.toHaveBeenCalled()
  })

  describe('refuses to start what it does not own', () => {
    it('honors an explicit --no-auto-restart', async () => {
      const createTerminal = vi.fn(async () => ({ handle: 'term_new' }))
      const db = fakeDb({
        getWorkerDispatch: () => ({
          dispatch_id: DEAD_DISPATCH,
          worktree_id: 'repo_1::/w/feature',
          start_options: startOptions({ autoRestart: false })
        })
      })

      expect(await restart(db, fakeRuntime({ createTerminal }))).toMatchObject({
        restarted: false,
        reason: 'auto_restart_disabled'
      })
      expect(createTerminal).not.toHaveBeenCalled()
    })

    it('leaves a terminal the coordinator lent from its own session', async () => {
      const db = fakeDb({
        getWorkerDispatch: () => ({
          dispatch_id: DEAD_DISPATCH,
          worktree_id: 'repo_1::/w/feature',
          start_options: startOptions({ terminal: 'term_borrowed' })
        })
      })

      expect(await restart(db, fakeRuntime())).toMatchObject({
        restarted: false,
        reason: 'external_terminal'
      })
    })

    it('leaves a worker owned by another Argus server', async () => {
      const db = fakeDb({ getFederatedDispatch: () => ({ dispatch_id: DEAD_DISPATCH }) })

      expect(await restart(db, fakeRuntime())).toMatchObject({
        restarted: false,
        reason: 'federated_dispatch'
      })
    })

    it('leaves a dispatch whose worktree it cannot name', async () => {
      const db = fakeDb({
        getWorkerDispatch: () => ({
          dispatch_id: DEAD_DISPATCH,
          worktree_id: null,
          start_options: startOptions({ resolvedWorktreeId: null })
        })
      })

      expect(await restart(db, fakeRuntime())).toMatchObject({
        restarted: false,
        reason: 'placement_unknown'
      })
    })

    it('leaves a task the breaker already failed', async () => {
      const db = fakeDb({
        getTask: () => ({ id: TASK, run_id: 'run_1', spec: 'x', status: 'failed' })
      })

      expect(await restart(db, fakeRuntime())).toMatchObject({
        restarted: false,
        reason: 'task_not_ready'
      })
    })

    it('leaves a dispatch whose recorded agent is not a known launcher', async () => {
      const db = fakeDb({
        getWorkerDispatch: () => ({
          dispatch_id: DEAD_DISPATCH,
          worktree_id: 'repo_1::/w/feature',
          start_options: startOptions({ agent: 'handwritten-script', launch: {} })
        })
      })

      expect(await restart(db, fakeRuntime())).toMatchObject({
        restarted: false,
        reason: 'agent_unknown'
      })
    })
  })

  it('settles the replacement row when the new agent never becomes ready', async () => {
    const failWorkerStart = vi.fn(() => ({ dispatch_id: 'ctx_new', state: 'failed' }))
    const sendTerminalAgentPrompt = vi.fn(async (_handle: string, _prompt: string) => undefined)

    const outcome = await restart(
      fakeDb({ failWorkerStart }),
      fakeRuntime({
        waitForTerminal: async () => ({ satisfied: false, status: 'exited' }),
        sendTerminalAgentPrompt
      })
    )

    expect(outcome).toMatchObject({ restarted: false, reason: 'start_failed' })
    expect(failWorkerStart).toHaveBeenCalledWith('ctx_new', 'agent_readiness', expect.any(String))
    expect(sendTerminalAgentPrompt).not.toHaveBeenCalled()
  })

  it('settles the replacement row when the new pane has no stable identity', async () => {
    const failWorkerStart = vi.fn(() => ({ dispatch_id: 'ctx_new', state: 'failed' }))

    const outcome = await restart(
      fakeDb({ failWorkerStart }),
      fakeRuntime({
        getOrchestrationDispatchAuthority: () => null,
        getTerminalPaneKey: () => null,
        getTerminalProcessIncarnation: () => null
      })
    )

    expect(outcome).toMatchObject({ restarted: false, reason: 'start_failed' })
    expect(failWorkerStart).toHaveBeenCalledWith('ctx_new', 'dispatch_input', 'stable_pane_required')
  })
})
