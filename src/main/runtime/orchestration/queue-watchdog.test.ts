import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RESTARTS_PER_SWEEP,
  sweepOrchestrationQueue,
  WORKER_SILENCE_THRESHOLD_MS,
  type QueueWatchdogPorts,
  type WorkerTerminalIdentity
} from './queue-watchdog'
import type { DispatchContextRow, DispatchStatus } from './types'

const NOW = new Date('2026-08-29T12:00:00.000Z')

function dispatchRow(overrides: Partial<DispatchContextRow> = {}): DispatchContextRow {
  return {
    id: 'ctx_1',
    run_id: 'run_1',
    task_id: 'task_1',
    contract_version: 2,
    launch_token_hash: null,
    assignee_handle: 'term_worker',
    assignee_pane_key: 'pane_1',
    capability_hash: null,
    process_incarnation: 'pty_1:inc_1',
    capability_revoked_at: null,
    status: 'dispatched',
    failure_count: 0,
    last_failure: null,
    dispatched_at: '2026-08-29 11:00:00',
    completed_at: null,
    created_at: '2026-08-29 11:00:00',
    last_heartbeat_at: '2026-08-29 11:30:00',
    ...overrides
  }
}

function ports(overrides: Partial<QueueWatchdogPorts> = {}): QueueWatchdogPorts {
  const identity: WorkerTerminalIdentity = {
    processIncarnation: 'pty_1:inc_1',
    hostScope: '{"kind":"local","hostId":"local"}'
  }
  return {
    promotePendingTasks: () => [],
    listStaleDispatches: () => [],
    getWorkerTerminalIdentity: () => identity,
    inspectLiveness: async () => 'dead',
    reclaimDispatch: (dispatchId) =>
      dispatchRow({ id: dispatchId, status: 'failed' as DispatchStatus }),
    ...overrides
  }
}

describe('sweepOrchestrationQueue', () => {
  it('reports the tasks promoted out of pending', async () => {
    const sweep = await sweepOrchestrationQueue(
      ports({ promotePendingTasks: () => ['task_a', 'task_b'] }),
      { now: NOW }
    )

    expect(sweep.promoted).toEqual(['task_a', 'task_b'])
  })

  it('asks for dispatches silent past the threshold, in the stored timestamp shape', async () => {
    const listStaleDispatches = vi.fn(() => [])

    await sweepOrchestrationQueue(ports({ listStaleDispatches }), { now: NOW })

    expect(listStaleDispatches).toHaveBeenCalledWith('2026-08-29 11:50:00')
    expect(WORKER_SILENCE_THRESHOLD_MS).toBe(600_000)
  })

  it('honors an explicit silence window', async () => {
    const listStaleDispatches = vi.fn(() => [])

    await sweepOrchestrationQueue(ports({ listStaleDispatches }), {
      now: NOW,
      silenceMs: 60_000
    })

    expect(listStaleDispatches).toHaveBeenCalledWith('2026-08-29 11:59:00')
  })

  it('reclaims a dispatch whose worker process is provably gone', async () => {
    const reclaimDispatch = vi.fn(() =>
      dispatchRow({ id: 'ctx_dead', task_id: 'task_dead', status: 'failed' })
    )

    const sweep = await sweepOrchestrationQueue(
      ports({
        listStaleDispatches: () => [dispatchRow({ id: 'ctx_dead', task_id: 'task_dead' })],
        inspectLiveness: async () => 'dead',
        reclaimDispatch
      }),
      { now: NOW }
    )

    expect(sweep.reclaimed).toEqual([
      { dispatchId: 'ctx_dead', taskId: 'task_dead', dispatchStatus: 'failed' }
    ])
    expect(reclaimDispatch).toHaveBeenCalledOnce()
  })

  it('names the last signal in the reclaim reason so dispatch-show reads back', async () => {
    const reclaimDispatch = vi.fn<QueueWatchdogPorts['reclaimDispatch']>(() =>
      dispatchRow({ status: 'failed' })
    )

    await sweepOrchestrationQueue(
      ports({
        listStaleDispatches: () => [dispatchRow({ last_heartbeat_at: '2026-08-29 11:30:00' })],
        reclaimDispatch
      }),
      { now: NOW }
    )

    const reason = reclaimDispatch.mock.calls[0]![1]
    expect(reason).toContain('worker_done')
    expect(reason).toContain('2026-08-29 11:30:00')
  })

  it('falls back to the dispatch time when the worker never sent a heartbeat', async () => {
    const reclaimDispatch = vi.fn<QueueWatchdogPorts['reclaimDispatch']>(() =>
      dispatchRow({ status: 'failed' })
    )

    await sweepOrchestrationQueue(
      ports({
        listStaleDispatches: () => [
          dispatchRow({ last_heartbeat_at: null, dispatched_at: '2026-08-29 10:15:00' })
        ],
        reclaimDispatch
      }),
      { now: NOW }
    )

    expect(reclaimDispatch.mock.calls[0]![1]).toContain('2026-08-29 10:15:00')
  })

  it('reports a circuit-broken reclaim with the status the breaker chose', async () => {
    const sweep = await sweepOrchestrationQueue(
      ports({
        listStaleDispatches: () => [dispatchRow({ failure_count: 2 })],
        reclaimDispatch: () => dispatchRow({ status: 'circuit_broken', failure_count: 3 })
      }),
      { now: NOW }
    )

    expect(sweep.reclaimed[0]?.dispatchStatus).toBe('circuit_broken')
  })

  describe('never reclaims without proof of death', () => {
    it('leaves a silent worker that is still running', async () => {
      const reclaimDispatch = vi.fn(() => null)

      const sweep = await sweepOrchestrationQueue(
        ports({
          listStaleDispatches: () => [dispatchRow({ id: 'ctx_slow' })],
          inspectLiveness: async () => 'live',
          reclaimDispatch
        }),
        { now: NOW }
      )

      expect(sweep.alive).toEqual(['ctx_slow'])
      expect(sweep.reclaimed).toEqual([])
      expect(reclaimDispatch).not.toHaveBeenCalled()
    })

    it('leaves a worker whose host cannot answer', async () => {
      const reclaimDispatch = vi.fn(() => null)

      const sweep = await sweepOrchestrationQueue(
        ports({
          listStaleDispatches: () => [dispatchRow({ id: 'ctx_ssh' })],
          inspectLiveness: async () => 'unknown',
          reclaimDispatch
        }),
        { now: NOW }
      )

      expect(sweep.unproven).toEqual(['ctx_ssh'])
      expect(reclaimDispatch).not.toHaveBeenCalled()
    })

    it('leaves a dispatch with no recorded terminal identity', async () => {
      const inspectLiveness = vi.fn(async () => 'dead' as const)
      const reclaimDispatch = vi.fn(() => null)

      const sweep = await sweepOrchestrationQueue(
        ports({
          listStaleDispatches: () => [dispatchRow({ id: 'ctx_unowned' })],
          getWorkerTerminalIdentity: () => null,
          inspectLiveness,
          reclaimDispatch
        }),
        { now: NOW }
      )

      expect(sweep.unproven).toEqual(['ctx_unowned'])
      expect(inspectLiveness).not.toHaveBeenCalled()
      expect(reclaimDispatch).not.toHaveBeenCalled()
    })
  })

  it('classifies each stale dispatch independently', async () => {
    const sweep = await sweepOrchestrationQueue(
      ports({
        listStaleDispatches: () => [
          dispatchRow({ id: 'ctx_live' }),
          dispatchRow({ id: 'ctx_dead', task_id: 'task_dead' }),
          dispatchRow({ id: 'ctx_unknown' })
        ],
        inspectLiveness: async (identity) => {
          if (identity.processIncarnation === 'pty_live:inc') {
            return 'live'
          }
          return identity.processIncarnation === 'pty_unknown:inc' ? 'unknown' : 'dead'
        },
        getWorkerTerminalIdentity: (dispatchId) => ({
          processIncarnation:
            dispatchId === 'ctx_live'
              ? 'pty_live:inc'
              : dispatchId === 'ctx_unknown'
                ? 'pty_unknown:inc'
                : 'pty_dead:inc',
          hostScope: null
        }),
        reclaimDispatch: (dispatchId) =>
          dispatchRow({ id: dispatchId, task_id: 'task_dead', status: 'failed' })
      }),
      { now: NOW }
    )

    expect(sweep.alive).toEqual(['ctx_live'])
    expect(sweep.unproven).toEqual(['ctx_unknown'])
    expect(sweep.reclaimed.map((entry) => entry.dispatchId)).toEqual(['ctx_dead'])
  })

  describe('replacement workers', () => {
    function deadDispatches(count: number): DispatchContextRow[] {
      return Array.from({ length: count }, (_, index) =>
        dispatchRow({ id: `ctx_${index}`, task_id: `task_${index}` })
      )
    }

    function reclaimAsFailed(dispatchId: string): DispatchContextRow {
      return dispatchRow({
        id: dispatchId,
        task_id: dispatchId.replace('ctx_', 'task_'),
        status: 'failed'
      })
    }

    it('asks for a replacement for each reclaimed worker', async () => {
      const restartWorker = vi.fn<NonNullable<QueueWatchdogPorts['restartWorker']>>(
        async ({ dispatchId, taskId }) => ({
          restarted: true,
          dispatchId: `${dispatchId}_retry`,
          taskId,
          terminalHandle: 'term_new'
        })
      )

      const sweep = await sweepOrchestrationQueue(
        ports({
          listStaleDispatches: () => deadDispatches(2),
          reclaimDispatch: (dispatchId) => reclaimAsFailed(dispatchId),
          restartWorker
        }),
        { now: NOW }
      )

      expect(sweep.restarted).toEqual([
        { dispatchId: 'ctx_0_retry', taskId: 'task_0', terminalHandle: 'term_new' },
        { dispatchId: 'ctx_1_retry', taskId: 'task_1', terminalHandle: 'term_new' }
      ])
      expect(restartWorker).toHaveBeenCalledTimes(2)
    })

    it('does not replace a worker the circuit breaker just failed for good', async () => {
      const restartWorker = vi.fn<NonNullable<QueueWatchdogPorts['restartWorker']>>()

      const sweep = await sweepOrchestrationQueue(
        ports({
          listStaleDispatches: () => deadDispatches(1),
          reclaimDispatch: (dispatchId) =>
            dispatchRow({ id: dispatchId, task_id: 'task_0', status: 'circuit_broken' }),
          restartWorker
        }),
        { now: NOW }
      )

      expect(restartWorker).not.toHaveBeenCalled()
      expect(sweep.restartSkipped).toEqual([{ taskId: 'task_0', reason: 'circuit_broken' }])
    })

    it('caps how many replacements one sweep may launch', async () => {
      const restartWorker = vi.fn<NonNullable<QueueWatchdogPorts['restartWorker']>>(
        async ({ dispatchId, taskId }) => ({
          restarted: true,
          dispatchId: `${dispatchId}_retry`,
          taskId,
          terminalHandle: 'term_new'
        })
      )

      const sweep = await sweepOrchestrationQueue(
        ports({
          listStaleDispatches: () => deadDispatches(MAX_RESTARTS_PER_SWEEP + 2),
          reclaimDispatch: (dispatchId) => reclaimAsFailed(dispatchId),
          restartWorker
        }),
        { now: NOW }
      )

      expect(sweep.restarted).toHaveLength(MAX_RESTARTS_PER_SWEEP)
      expect(restartWorker).toHaveBeenCalledTimes(MAX_RESTARTS_PER_SWEEP)
      expect(sweep.restartSkipped).toEqual([
        { taskId: 'task_3', reason: 'sweep_restart_cap' },
        { taskId: 'task_4', reason: 'sweep_restart_cap' }
      ])
      // The uncapped ones stay reclaimed and ready, so the next tick picks them up.
      expect(sweep.reclaimed).toHaveLength(MAX_RESTARTS_PER_SWEEP + 2)
    })

    it('reports why a replacement was declined', async () => {
      const sweep = await sweepOrchestrationQueue(
        ports({
          listStaleDispatches: () => deadDispatches(1),
          reclaimDispatch: (dispatchId) => reclaimAsFailed(dispatchId),
          restartWorker: async ({ taskId }) => ({
            restarted: false,
            taskId,
            reason: 'auto_restart_disabled'
          })
        }),
        { now: NOW }
      )

      expect(sweep.restarted).toEqual([])
      expect(sweep.restartSkipped).toEqual([
        { taskId: 'task_0', reason: 'auto_restart_disabled' }
      ])
    })

    it('still heals the queue when the runtime cannot start workers', async () => {
      const sweep = await sweepOrchestrationQueue(
        ports({
          promotePendingTasks: () => ['task_promoted'],
          listStaleDispatches: () => deadDispatches(1),
          reclaimDispatch: (dispatchId) => reclaimAsFailed(dispatchId)
        }),
        { now: NOW }
      )

      expect(sweep.promoted).toEqual(['task_promoted'])
      expect(sweep.reclaimed).toHaveLength(1)
      expect(sweep.restarted).toEqual([])
      expect(sweep.restartSkipped).toEqual([])
    })
  })

  it('skips a dispatch that settled between the query and the reclaim', async () => {
    const sweep = await sweepOrchestrationQueue(
      ports({
        listStaleDispatches: () => [dispatchRow({ id: 'ctx_vanished' })],
        reclaimDispatch: () => null
      }),
      { now: NOW }
    )

    expect(sweep.reclaimed).toEqual([])
  })
})
