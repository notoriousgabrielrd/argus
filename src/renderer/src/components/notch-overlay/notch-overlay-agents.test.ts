import { describe, expect, it } from 'vitest'
import type { DashboardCard, DashboardSnapshot } from '../../../../shared/dashboard-snapshot'
import {
  notchAccent,
  selectNotchOverlayRows,
  summarizeNotchOverlayAgents
} from './notch-overlay-agents'

function card(
  paneKey: string,
  bucket: DashboardCard['bucket'],
  stateChangedAt: number
): DashboardCard {
  return {
    paneKey,
    ptyId: null,
    agentType: 'claude',
    bucket,
    dotState: bucket === 'attention' ? 'blocked' : bucket === 'working' ? 'working' : 'idle',
    task: `task ${paneKey}`,
    repoId: 'repo',
    worktreeId: 'wt',
    tabId: 'tab',
    leafId: null,
    repoName: 'repo',
    worktreeName: 'main',
    startedAt: 0,
    finishedAt: null,
    stateChangedAt,
    unseen: false
  }
}

const snapshot: DashboardSnapshot = {
  generatedAt: 0,
  cards: [
    card('idle-1', 'idle', 50),
    card('done-1', 'done', 40),
    card('work-old', 'working', 10),
    card('work-new', 'working', 20),
    card('attn-1', 'attention', 5)
  ]
}

describe('summarizeNotchOverlayAgents', () => {
  it('counts attention, working and done buckets and ignores idle', () => {
    expect(summarizeNotchOverlayAgents(snapshot)).toEqual({
      attention: 1,
      working: 2,
      done: 1,
      idle: 1,
      online: 3
    })
  })
})

describe('selectNotchOverlayRows', () => {
  it('orders attention > working > done > idle, newest change first within a bucket', () => {
    expect(selectNotchOverlayRows(snapshot).map((c) => c.paneKey)).toEqual([
      'attn-1',
      'work-new',
      'work-old',
      'done-1',
      'idle-1'
    ])
  })

  it('caps the list at the limit', () => {
    expect(selectNotchOverlayRows(snapshot, 2).map((c) => c.paneKey)).toEqual([
      'attn-1',
      'work-new'
    ])
  })
})

describe('notchAccent', () => {
  it('prefers attention, then working, then idle', () => {
    expect(notchAccent({ attention: 1, working: 3, done: 0, idle: 0, online: 4 })).toBe('attention')
    expect(notchAccent({ attention: 0, working: 3, done: 0, idle: 0, online: 3 })).toBe('working')
    expect(notchAccent({ attention: 0, working: 0, done: 2, idle: 5, online: 0 })).toBe('idle')
  })
})
