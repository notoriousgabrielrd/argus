import type { DispatchContextRow, DispatchStatus } from './types'
import type { WorkerRestartOutcome } from './worker-restart'

/**
 * The part of orchestration that outlives its coordinator.
 *
 * A supervised worker reports into its coordinator's `check --wait` loop, so the queue only
 * moves while that coordinator's turn is alive. When the turn ends — context compacted, pane
 * closed, app restarted — a dispatch whose worker also died stays `dispatched` forever and
 * its task never returns to the queue. This sweep is the only writer that reclaims those
 * with nobody at the keyboard, and the only one that promotes a dependent whose dependency
 * completed while nothing was watching.
 */

/** How the runtime proves a worker pane is still the one this dispatch launched. */
export type WorkerTerminalIdentity = {
  processIncarnation: string
  hostScope: string | null
}

export type QueueWatchdogPorts = {
  /** Returns the ids promoted from `pending` to `ready`. */
  promotePendingTasks(): readonly string[]
  listStaleDispatches(thresholdIso: string): readonly DispatchContextRow[]
  getWorkerTerminalIdentity(dispatchId: string): WorkerTerminalIdentity | null
  inspectLiveness(identity: WorkerTerminalIdentity): Promise<'live' | 'dead' | 'unknown'>
  /** Settles a dispatch whose worker is provably gone; null when the row vanished first. */
  reclaimDispatch(dispatchId: string, reason: string): DispatchContextRow | null
  /** Absent when this runtime cannot start workers; the queue still heals without it. */
  restartWorker?(input: { dispatchId: string; taskId: string }): Promise<WorkerRestartOutcome>
}

export type QueueWatchdogSweep = {
  promoted: readonly string[]
  reclaimed: readonly { dispatchId: string; taskId: string; dispatchStatus: DispatchStatus }[]
  /** Silent but provably running — the claim is extended by not touching it. */
  alive: readonly string[]
  /** Silence Argus cannot explain. Left dispatched on purpose; see the rule below. */
  unproven: readonly string[]
  restarted: readonly { dispatchId: string; taskId: string; terminalHandle: string }[]
  restartSkipped: readonly { taskId: string; reason: string; detail?: string }[]
}

/**
 * Two missed heartbeats.
 *
 * The dispatch preamble asks workers to beat every 5 minutes, so one gap is normal jitter
 * and only the second means anything. Tightening this turns a slow model's single long
 * tool-free call into a false death, which costs more than a late reclaim.
 */
export const WORKER_SILENCE_THRESHOLD_MS = 10 * 60_000

/**
 * Replacements one sweep may launch.
 *
 * Every restart spends money, and the causes that kill workers arrive in batches — a host
 * that went to sleep, a runtime that restarted, an agent CLI that broke on update. The cap
 * turns "the whole fleet relaunches at once" into "three now, three next tick", which stays
 * recoverable and keeps the circuit breaker in charge of the total.
 */
export const MAX_RESTARTS_PER_SWEEP = 3

/**
 * Sweeps the queue once.
 *
 * Reclaim requires *proof* of death, never absence of proof of life: an SSH host that stops
 * answering, a PTY controller that times out, and a dispatch with no recorded terminal
 * identity all leave the dispatch exactly as it was. Killing a live worker discards real
 * work and the human never sees why; leaving a dead one costs one more tick.
 */
export async function sweepOrchestrationQueue(
  ports: QueueWatchdogPorts,
  options: { now: Date; silenceMs?: number }
): Promise<QueueWatchdogSweep> {
  const promoted = ports.promotePendingTasks()
  const silenceMs = options.silenceMs ?? WORKER_SILENCE_THRESHOLD_MS
  const threshold = toSqliteTimestamp(new Date(options.now.getTime() - silenceMs))

  const reclaimed: { dispatchId: string; taskId: string; dispatchStatus: DispatchStatus }[] = []
  const alive: string[] = []
  const unproven: string[] = []

  for (const dispatch of ports.listStaleDispatches(threshold)) {
    const identity = ports.getWorkerTerminalIdentity(dispatch.id)
    if (!identity) {
      unproven.push(dispatch.id)
      continue
    }
    const liveness = await ports.inspectLiveness(identity)
    if (liveness === 'live') {
      alive.push(dispatch.id)
      continue
    }
    if (liveness === 'unknown') {
      unproven.push(dispatch.id)
      continue
    }
    const settled = ports.reclaimDispatch(dispatch.id, buildReclaimReason(dispatch))
    if (settled) {
      reclaimed.push({
        dispatchId: settled.id,
        taskId: settled.task_id,
        dispatchStatus: settled.status
      })
    }
  }

  const { restarted, restartSkipped } = await restartReclaimedWorkers(ports, reclaimed)
  return { promoted, reclaimed, alive, unproven, restarted, restartSkipped }
}

async function restartReclaimedWorkers(
  ports: QueueWatchdogPorts,
  reclaimed: readonly { dispatchId: string; taskId: string; dispatchStatus: DispatchStatus }[]
): Promise<Pick<QueueWatchdogSweep, 'restarted' | 'restartSkipped'>> {
  const restarted: { dispatchId: string; taskId: string; terminalHandle: string }[] = []
  const restartSkipped: { taskId: string; reason: string; detail?: string }[] = []
  if (!ports.restartWorker) {
    return { restarted, restartSkipped }
  }

  for (const entry of reclaimed) {
    // Why the breaker check here too: `failDispatch` already parked the task as `failed` on
    // the third strike. Relaunching then would spend money on a task nobody will accept.
    if (entry.dispatchStatus === 'circuit_broken') {
      restartSkipped.push({ taskId: entry.taskId, reason: 'circuit_broken' })
      continue
    }
    if (restarted.length >= MAX_RESTARTS_PER_SWEEP) {
      restartSkipped.push({ taskId: entry.taskId, reason: 'sweep_restart_cap' })
      continue
    }
    const outcome = await ports.restartWorker({
      dispatchId: entry.dispatchId,
      taskId: entry.taskId
    })
    if (outcome.restarted) {
      restarted.push({
        dispatchId: outcome.dispatchId,
        taskId: outcome.taskId,
        terminalHandle: outcome.terminalHandle
      })
      continue
    }
    restartSkipped.push({
      taskId: outcome.taskId,
      reason: outcome.reason,
      ...(outcome.detail ? { detail: outcome.detail } : {})
    })
  }

  return { restarted, restartSkipped }
}

// Why the last-signal timestamp is in the text: the reason lands in `last_failure`, which is
// what a human reads days later in `dispatch-show`. "Died" alone cannot be told apart from a
// worker that never started.
function buildReclaimReason(dispatch: DispatchContextRow): string {
  const lastSignal = dispatch.last_heartbeat_at ?? dispatch.dispatched_at
  const since = lastSignal ? ` (last signal ${lastSignal})` : ''
  return `Queue watchdog: worker terminal is gone and never sent worker_done${since}.`
}

// Why not toISOString(): the stored timestamps come from SQLite's datetime('now'), and the
// stale query compares both sides through julianday(). Matching the stored shape keeps the
// comparison on one parser instead of relying on ISO-8601 acceptance.
function toSqliteTimestamp(value: Date): string {
  return value.toISOString().replace('T', ' ').slice(0, 19)
}
