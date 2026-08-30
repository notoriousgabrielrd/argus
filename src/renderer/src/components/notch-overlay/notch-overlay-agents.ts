import type { DashboardCard, DashboardSnapshot } from '../../../../shared/dashboard-snapshot'

export const NOTCH_OVERLAY_MAX_ROWS = 8

export type NotchOverlaySummary = {
  attention: number
  working: number
  done: number
  idle: number
  /** Agents actively present (needing you or working) — the "online" metric. */
  online: number
}

const BUCKET_RANK: Record<DashboardCard['bucket'], number> = {
  attention: 0,
  working: 1,
  done: 2,
  idle: 3
}

export function summarizeNotchOverlayAgents(snapshot: DashboardSnapshot): NotchOverlaySummary {
  const summary: NotchOverlaySummary = {
    attention: 0,
    working: 0,
    done: 0,
    idle: 0,
    online: 0
  }
  for (const card of snapshot.cards) {
    if (card.bucket === 'attention') {
      summary.attention += 1
    } else if (card.bucket === 'working') {
      summary.working += 1
    } else if (card.bucket === 'done') {
      summary.done += 1
    } else if (card.bucket === 'idle') {
      summary.idle += 1
    }
  }
  summary.online = summary.attention + summary.working
  return summary
}

/** Every open seat gets a row: attention first, then working, done, idle last. */
export function selectNotchOverlayRows(
  snapshot: DashboardSnapshot,
  limit = NOTCH_OVERLAY_MAX_ROWS
): DashboardCard[] {
  return [...snapshot.cards]
    .sort((a, b) => {
      const rank = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket]
      if (rank !== 0) {
        return rank
      }
      return b.stateChangedAt - a.stateChangedAt
    })
    .slice(0, limit)
}

export type NotchAccent = 'attention' | 'working' | 'idle'

/** Which state colors the island's rim: attention beats working beats idle. */
export function notchAccent(summary: NotchOverlaySummary): NotchAccent {
  if (summary.attention > 0) {
    return 'attention'
  }
  return summary.working > 0 ? 'working' : 'idle'
}
