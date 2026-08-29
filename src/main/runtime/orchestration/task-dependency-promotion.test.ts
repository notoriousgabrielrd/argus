import { afterEach, describe, expect, it } from 'vitest'
import type Database from '../../sqlite/sync-database'
import { OrchestrationDb } from './db'
import type { TaskStatus } from './types'

describe('promotePendingTasks', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => {
    db?.close()
  })

  function createDb(): OrchestrationDb {
    db = new OrchestrationDb(':memory:')
    return db
  }

  // Writes the row directly, the way a path that never calls updateTaskStatus would — this
  // is exactly the state the sweep exists to repair.
  function forceTaskStatus(d: OrchestrationDb, id: string, status: TaskStatus): void {
    const sqlite = (d as unknown as { db: Database.Database }).db
    sqlite.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id)
  }

  it('promotes a dependent whose deps completed while nothing was watching', () => {
    const d = createDb()
    const dep = d.createTask({ spec: 'first' })
    const dependent = d.createTask({ spec: 'second', deps: [dep.id] })
    forceTaskStatus(d, dep.id, 'completed')

    expect(d.getTask(dependent.id)?.status).toBe('pending')
    expect(d.promotePendingTasks()).toEqual([dependent.id])
    expect(d.getTask(dependent.id)?.status).toBe('ready')
  })

  it('leaves a dependent whose deps have not all completed', () => {
    const d = createDb()
    const first = d.createTask({ spec: 'a' })
    const second = d.createTask({ spec: 'b' })
    const dependent = d.createTask({ spec: 'c', deps: [first.id, second.id] })
    forceTaskStatus(d, first.id, 'completed')
    forceTaskStatus(d, second.id, 'failed')

    expect(d.promotePendingTasks()).toEqual([])
    expect(d.getTask(dependent.id)?.status).toBe('pending')
  })

  it('leaves a pending task that has no deps to satisfy', () => {
    const d = createDb()
    const orphan = d.createTask({ spec: 'no deps' })
    forceTaskStatus(d, orphan.id, 'pending')

    expect(d.promotePendingTasks()).toEqual([])
    expect(d.getTask(orphan.id)?.status).toBe('pending')
  })

  it('promotes every dependent the same sweep can satisfy', () => {
    const d = createDb()
    const dep = d.createTask({ spec: 'shared dependency' })
    const first = d.createTask({ spec: 'dependent a', deps: [dep.id] })
    const second = d.createTask({ spec: 'dependent b', deps: [dep.id] })
    forceTaskStatus(d, dep.id, 'completed')

    expect(d.promotePendingTasks().sort()).toEqual([first.id, second.id].sort())
  })

  it('is idempotent across sweeps', () => {
    const d = createDb()
    const dep = d.createTask({ spec: 'first' })
    const dependent = d.createTask({ spec: 'second', deps: [dep.id] })
    forceTaskStatus(d, dep.id, 'completed')

    expect(d.promotePendingTasks()).toEqual([dependent.id])
    expect(d.promotePendingTasks()).toEqual([])
  })
})
