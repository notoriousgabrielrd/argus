import { isTuiAgent } from '../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../shared/types'
import type { OrcaRuntimeService } from '../orca-runtime'
import type { OrchestrationDb } from './db'
import { buildDispatchPreamble } from './preamble'
import { resolveWorkerLaunchPreferences } from './worker-launch-preferences'
import { requireWorkerAuthority } from './worker-terminal-authority'

/**
 * Replaces a worker the queue watchdog found dead, on the standing intent its coordinator
 * recorded when it started the original.
 *
 * Argus never invents this authority. `worker-start` is fenced to a live coordinator pane,
 * and a timer has no principal — so the decision to allow a replacement is taken by a real
 * caller, at start time, and stored on the Dispatch. The watchdog only executes it, inside
 * the same circuit breaker that bounds manual retries.
 */

/** Recorded on the Dispatch by worker-start; older rows predate the field. */
export type RecordedWorkerStartOptions = {
  autoRestart?: boolean
  devMode?: boolean
  resolvedWorktreeId?: string | null
  terminal?: string | null
  agent?: string | null
  launch?: { requested?: { agent?: string | null; model?: string | null; effort?: string | null } }
}

export type WorkerRestartSkipReason =
  | 'auto_restart_disabled'
  | 'external_terminal'
  | 'federated_dispatch'
  | 'placement_unknown'
  | 'agent_unknown'
  | 'launch_unsupported'
  | 'task_not_ready'
  | 'start_failed'

export type WorkerRestartOutcome =
  | { restarted: true; dispatchId: string; taskId: string; terminalHandle: string }
  | { restarted: false; taskId: string; reason: WorkerRestartSkipReason; detail?: string }

export async function restartReclaimedWorker(args: {
  db: OrchestrationDb
  runtime: OrcaRuntimeService
  deadDispatchId: string
  taskId: string
}): Promise<WorkerRestartOutcome> {
  const { db, runtime, deadDispatchId, taskId } = args
  const skip = (reason: WorkerRestartSkipReason, detail?: string): WorkerRestartOutcome => ({
    restarted: false,
    taskId,
    reason,
    ...(detail ? { detail } : {})
  })

  const deadWorker = db.getWorkerDispatch(deadDispatchId)
  if (!deadWorker) {
    return skip('placement_unknown')
  }
  const startOptions = parseStartOptions(deadWorker.start_options)

  // Why default-on: the coordinator that started this worker asked to be told when the task
  // finished, and a dead worker never tells it. Opting out is `--no-auto-restart`.
  if (startOptions.autoRestart === false) {
    return skip('auto_restart_disabled')
  }
  // Why: `--terminal` reuses an agent the coordinator already owned. Argus did not create
  // that pane and must not create a replacement for it.
  if (startOptions.terminal) {
    return skip('external_terminal')
  }
  // Why: a federated worker lives on another Argus server, whose runtime owns its panes.
  if (db.getFederatedDispatch(deadDispatchId)) {
    return skip('federated_dispatch')
  }

  const worktreeId = deadWorker.worktree_id ?? startOptions.resolvedWorktreeId
  if (!worktreeId) {
    return skip('placement_unknown')
  }
  // Why the task gate: `failDispatch` puts the task back to `ready` only while the breaker
  // has room. A task already `failed`, or one a human moved elsewhere, is not ours to run.
  if (db.getTask(taskId)?.status !== 'ready') {
    return skip('task_not_ready')
  }

  const requested = startOptions.launch?.requested
  const agent = requested?.agent ?? startOptions.agent
  if (!agent || !isTuiAgent(agent)) {
    return skip('agent_unknown')
  }

  let launchPreferences
  try {
    runtime.validateOrchestrationAgentLauncher(agent as TuiAgent)
    // Why re-resolve instead of replaying the stored receipt: a pinned model may have been
    // removed from the catalog since, and relaunching without the pin would silently give
    // the coordinator a different engine than the one it chose.
    launchPreferences = resolveWorkerLaunchPreferences({
      agent: agent as TuiAgent,
      ...(requested?.model ? { model: requested.model } : {}),
      ...(requested?.effort ? { effort: requested.effort } : {})
    }).preferences
  } catch (error) {
    return skip('launch_unsupported', errorText(error))
  }

  const task = db.getTask(taskId)!
  const started = db.createStartingWorkerDispatch({
    taskId,
    retryOf: deadDispatchId,
    startOptions: { ...startOptions, restartedFrom: deadDispatchId },
    runtimeEpoch: runtime.getRuntimeId()
  })

  const effects: unknown[] = []
  let stage = 'terminal_create'
  try {
    db.recordWorkerStage({
      dispatchId: started.dispatch.id,
      stage: 'terminal_creating',
      worktreeId,
      effects
    })
    const terminal = await runtime.createTerminal(`id:${worktreeId}`, {
      startupAgent: agent as TuiAgent,
      ...(launchPreferences ? { launchPreferences } : {}),
      title: `worker-${taskId}`,
      // Why background: nobody asked for this pane — it is repair work. Pulling the sidebar
      // to it would move a user who is reading somewhere else.
      surfaceOwner: false
    })
    effects.push({ kind: 'terminal', role: 'agent', action: 'created', id: terminal.handle })

    stage = 'agent_readiness'
    const wait = await runtime.waitForTerminal(terminal.handle, {
      condition: 'tui-idle',
      timeoutMs: RESTART_READINESS_TIMEOUT_MS
    })
    if (!wait.satisfied) {
      throw new Error(`Replacement agent did not become ready (${wait.status}).`)
    }

    stage = 'dispatch_input'
    const capability = db.prepareStartingWorkerAuthority({
      dispatchId: started.dispatch.id,
      handle: terminal.handle,
      ...requireWorkerAuthority(runtime, terminal.handle),
      worktreeId,
      effects,
      setupState: 'not_applicable',
      terminalOwnership: 'created'
    })
    const preamble = buildDispatchPreamble({
      taskId,
      dispatchId: started.dispatch.id,
      taskSpec: task.spec,
      // Why the Run's bound handle: the replacement reports through its Dispatch, which
      // Argus routes to the Run mailbox, so the handle is context rather than an address.
      coordinatorHandle: db.getRun(task.run_id)?.coordinator_handle ?? 'coordinator',
      workerHandle: terminal.handle,
      dispatchCapability: capability,
      ...(startOptions.devMode ? { devMode: true } : {}),
      cliCommand: runtime.getTerminalOrchestrationCliCommand(terminal.handle),
      ...(await runtime.resolveDispatchRosterForTerminal(terminal.handle))
    })
    await runtime.sendTerminalAgentPrompt(terminal.handle, preamble)
    effects.push({ kind: 'dispatch_input', role: 'agent', id: terminal.handle, state: 'accepted' })
    db.markWorkerDispatchReady(started.dispatch.id, effects)

    return { restarted: true, dispatchId: started.dispatch.id, taskId, terminalHandle: terminal.handle }
  } catch (error) {
    // Why settle the row: an unsettled `starting` dispatch would hold the task out of the
    // queue forever, which is the exact failure this watchdog exists to prevent.
    try {
      db.failWorkerStart(started.dispatch.id, stage, errorText(error))
    } catch {
      // The row may have been settled by another path already; the reason below still stands.
    }
    return skip('start_failed', errorText(error))
  }
}

// Why 90s rather than worker-start's 60s default: a replacement launches while the machine
// may still be busy with whatever killed the first worker.
const RESTART_READINESS_TIMEOUT_MS = 90_000

function parseStartOptions(raw: string): RecordedWorkerStartOptions {
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as RecordedWorkerStartOptions) : {}
  } catch {
    return {}
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
