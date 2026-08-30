import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, ChartNoAxesColumn, Check, Moon } from 'lucide-react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent } from '@/lib/agent-status'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
import { useDashboardSnapshot } from '../dashboard-popout/useDashboardSnapshot'
import {
  notchAccent,
  selectNotchOverlayRows,
  summarizeNotchOverlayAgents,
  type NotchAccent,
  type NotchOverlaySummary
} from './notch-overlay-agents'
import { COLLAPSED_STATUS_LINE_PX, notchLayout, notchPillPath } from './notch-shape'
import './notch-overlay.css'

const DEFAULT_NOTCH_HEIGHT_PX = 37
// DailyNotch dashboard: exactly two visible rows, the list scrolls past that. Scaled to
// notch proportions — the whole panel is ~360pt wide, not a desktop window.
const ROW_HEIGHT_PX = 40
const ROW_GAP_PX = 6
const VISIBLE_ROWS = 2
const COLUMN_GAP_PX = 6
const HEADER_HEIGHT_PX = 18
const SUMMARY_COLUMN_WIDTH_PX = 118
// DailyNotch collapses 0.4s after the pointer leaves so the resize never flickers under it.
const COLLAPSE_DELAY_MS = 400
// Hover must dwell before the dashboard opens, so a pointer crossing the menu bar doesn't trigger it.
const EXPAND_DELAY_MS = 500

type Phase = 'idle' | 'expanded'

/** Geometry handed over by main via notch.html?bar=<px>&notch=<px>. */
function notchGeometry(): { height: number; width: number } {
  const params = new URLSearchParams(window.location.search)
  const height = Number(params.get('bar'))
  const width = Number(params.get('notch'))
  return {
    height: Number.isFinite(height) && height > 0 ? height : DEFAULT_NOTCH_HEIGHT_PX,
    width: Number.isFinite(width) && width > 0 ? width : 0
  }
}

function expandedContentHeight(): number {
  const list = VISIBLE_ROWS * ROW_HEIGHT_PX + (VISIBLE_ROWS - 1) * ROW_GAP_PX
  const agentColumn = HEADER_HEIGHT_PX + list + COLUMN_GAP_PX
  // Activity column: header + four metric rows (~26px each) + the gaps between them.
  const metricRows = 4
  const activityColumn = HEADER_HEIGHT_PX + COLUMN_GAP_PX + metricRows * 26 + (metricRows - 1) * 4
  return Math.max(agentColumn, activityColumn)
}

function headline(summary: NotchOverlaySummary, accent: NotchAccent): string {
  if (accent === 'attention') {
    return translate(
      'auto.components.notchOverlay.NotchOverlayRoot.needYou',
      '{{count}} need you',
      {
        count: summary.attention
      }
    )
  }
  if (accent === 'working') {
    return translate('auto.components.notchOverlay.NotchOverlayRoot.working', '{{count}} working', {
      count: summary.working
    })
  }
  return translate('auto.components.notchOverlay.NotchOverlayRoot.idle', 'Idle')
}

function revealCard(card: DashboardCard): void {
  void window.api.notchOverlay.revealAgent({
    repoId: card.repoId,
    worktreeId: card.worktreeId,
    executionHostId: card.executionHostId,
    tabId: card.tabId,
    leafId: card.leafId
  })
}

function IconAction({
  label,
  onClick,
  children,
  variant = 'ghost'
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  variant?: 'ghost' | 'accent'
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex size-[18px] shrink-0 items-center justify-center rounded-full focus-visible:outline-none',
        variant === 'accent'
          ? 'bg-[color:var(--notch-accent)] text-white'
          : 'text-[color:var(--notch-text-secondary)] hover:bg-white/10 hover:text-white'
      )}
    >
      {children}
    </button>
  )
}

function AgentRow({ card }: { card: DashboardCard }): React.JSX.Element {
  const blocked = card.bucket === 'attention'
  const subtitle =
    blocked && card.askSummary ? card.askSummary : `${card.repoName} · ${card.worktreeName}`
  return (
    <div
      className="notch-panel-row flex shrink-0 items-center gap-2 px-2"
      style={{ height: ROW_HEIGHT_PX }}
      data-notch-agent-row={card.paneKey}
    >
      <AgentStateDot state={card.dotState} />
      <AgentIcon agent={agentTypeToIconAgent(card.agentType)} size={13} />
      <button
        type="button"
        onClick={() => revealCard(card)}
        className="flex min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-none"
      >
        <span
          className={cn(
            'w-full truncate text-[11px] font-semibold leading-tight',
            card.unseen ? 'text-white' : 'text-white/90'
          )}
        >
          {card.task || card.worktreeName}
        </span>
        <span
          className={cn(
            'w-full truncate text-[9px] leading-tight',
            blocked && card.askSummary
              ? 'text-[color:var(--notch-danger)]'
              : 'text-[color:var(--notch-text-secondary)]'
          )}
        >
          {subtitle}
        </span>
      </button>
      {card.unseen ? (
        <IconAction
          label={translate('auto.components.notchOverlay.NotchOverlayRoot.markSeen', 'Mark seen')}
          onClick={() => void window.api.dashboard.ackAgent(card.paneKey)}
        >
          <Check className="size-2.5" strokeWidth={2.5} />
        </IconAction>
      ) : null}
      <IconAction
        label={translate('auto.components.notchOverlay.NotchOverlayRoot.sleep', 'Sleep workspace')}
        onClick={() => void window.api.dashboard.sleepWorkspace({ worktreeId: card.worktreeId })}
      >
        <Moon className="size-2.5" strokeWidth={2.5} />
      </IconAction>
      <IconAction
        label={translate('auto.components.notchOverlay.NotchOverlayRoot.open', 'Open in Argus')}
        onClick={() => revealCard(card)}
        variant="accent"
      >
        <ArrowUpRight className="size-2.5" strokeWidth={2.5} />
      </IconAction>
    </div>
  )
}

function SummaryColumn({ summary }: { summary: NotchOverlaySummary }): React.JSX.Element {
  const lines: { label: string; value: number; tone: string }[] = [
    {
      label: translate('auto.components.notchOverlay.NotchOverlayRoot.summaryNeedYou', 'Need you'),
      value: summary.attention,
      tone: summary.attention > 0 ? 'text-[color:var(--notch-danger)]' : 'text-white/60'
    },
    {
      label: translate('auto.components.notchOverlay.NotchOverlayRoot.summaryWorking', 'Working'),
      value: summary.working,
      tone: summary.working > 0 ? 'text-[color:var(--notch-accent)]' : 'text-white/60'
    },
    {
      label: translate('auto.components.notchOverlay.NotchOverlayRoot.summaryDone', 'Done'),
      value: summary.done,
      tone: 'text-white/60'
    },
    {
      label: translate('auto.components.notchOverlay.NotchOverlayRoot.summaryIdle', 'Idle'),
      value: summary.idle,
      tone: 'text-white/60'
    }
  ]
  return (
    <div className="flex flex-col gap-1.5" style={{ width: SUMMARY_COLUMN_WIDTH_PX }}>
      <div
        className="flex items-center justify-between text-[12px] font-semibold text-white"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <span className="flex items-center gap-1">
          <ChartNoAxesColumn className="size-3" />
          {translate('auto.components.notchOverlay.NotchOverlayRoot.summary', 'Activity')}
        </span>
        <span className="text-[10px] font-medium text-[color:var(--notch-text-secondary)] tabular-nums">
          {translate('auto.components.notchOverlay.NotchOverlayRoot.online', '{{count}} online', {
            count: summary.online
          })}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {lines.map((line) => (
          <div
            key={line.label}
            className="notch-panel-row flex items-center justify-between px-2.5 py-1 text-[11px]"
          >
            <span className="text-[color:var(--notch-text-secondary)]">{line.label}</span>
            <span className={cn('font-semibold tabular-nums', line.tone)}>{line.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Root of the macOS notch overlay, after DailyNotch's RootNotchView: a black pill (square
 * top, rounded bottom) that hugs the notch when idle, shows an accent status line under it
 * while agents run, and expands into a two-panel dashboard on hover.
 */
export function NotchOverlayRoot(): React.JSX.Element {
  const snapshot = useDashboardSnapshot()
  const [phase, setPhase] = useState<Phase>('idle')
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const summary = useMemo(() => summarizeNotchOverlayAgents(snapshot), [snapshot])
  const rows = useMemo(() => selectNotchOverlayRows(snapshot), [snapshot])
  const accent = notchAccent(summary)
  const geometry = notchGeometry()
  const notchHeight = geometry.height
  const notchWidth = geometry.width
  const expanded = phase === 'expanded'
  const active = accent !== 'idle'
  const idlePresent = summary.idle > 0
  const attentionPresent = summary.attention > 0
  // Breathe halo flags a state that wants the user: attention (orange, urgent) outranks idle (amber).
  const breatheTone: 'attention' | 'idle' | null = attentionPresent
    ? 'attention'
    : idlePresent
      ? 'idle'
      : null

  useEffect(
    () => window.api.notchOverlay.onExpandedChanged((next) => setPhase(next ? 'expanded' : 'idle')),
    []
  )
  useEffect(
    () => () => {
      if (collapseTimer.current) {
        clearTimeout(collapseTimer.current)
      }
      if (expandTimer.current) {
        clearTimeout(expandTimer.current)
      }
    },
    []
  )

  const handlePointerOver = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    if (!expanded && !expandTimer.current) {
      expandTimer.current = setTimeout(() => {
        expandTimer.current = null
        void window.api.notchOverlay.setExpanded({ expanded: true })
      }, EXPAND_DELAY_MS)
    }
  }, [expanded])

  const handlePointerLeave = useCallback(() => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    if (!expanded || collapseTimer.current) {
      return
    }
    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null
      void window.api.notchOverlay.setExpanded({ expanded: false })
    }, COLLAPSE_DELAY_MS)
  }, [expanded])

  const layout = notchLayout({
    notchWidth,
    notchHeight,
    expanded,
    active,
    expandedContentHeight: expandedContentHeight()
  })
  const pillPath = notchPillPath(layout.width, layout.height, layout.pillCorner)

  return (
    <div className="relative h-screen w-screen select-none">
      <div
        className="notch-surface absolute top-0 left-1/2"
        style={{ width: layout.width, height: layout.height }}
        data-notch-overlay-expanded={expanded ? 'true' : 'false'}
        data-notch-phase={phase}
        data-notch-accent={accent}
        data-notch-active={active ? 'true' : 'false'}
        data-notch-breathe={breatheTone && !expanded ? 'true' : 'false'}
        data-notch-breathe-tone={breatheTone ?? 'idle'}
        // Why: while collapsed the window only forwards mousemove, so hover is detected from movement.
        onMouseMove={handlePointerOver}
        onMouseEnter={handlePointerOver}
        onMouseLeave={handlePointerLeave}
      >
        {/* Breathe halo: a soft amber radial that pulses when idle agents are waiting, so the
            notch signals "something needs adjusting" even while the pill itself stays quiet. */}
        <div className="notch-breathe" aria-hidden="true" />
        <div
          className="notch-pill absolute inset-0 bg-black text-white"
          style={{ clipPath: `path('${pillPath}')` }}
        >
          {/* Collapsed: a status line along the pill's bottom edge — the pill never outgrows the
              menu-bar band, so items beside it and the window below stay visible; details live in
              the hover dashboard. */}
          <div
            className="notch-collapsed absolute inset-x-0 flex items-center justify-center"
            style={{ top: notchHeight - COLLAPSED_STATUS_LINE_PX - 3, height: COLLAPSED_STATUS_LINE_PX }}
            data-visible={!expanded && active ? 'true' : 'false'}
            aria-label={headline(summary, accent)}
          >
            <div
              className="h-full w-1/2 rounded-full bg-[color:var(--notch-accent)]"
              data-notch-status-line={accent}
            />
          </div>

          {/* Expanded: dashboard */}
          <div
            className="notch-dashboard absolute inset-x-0 flex items-start gap-3 px-3 pb-3"
            style={{ top: notchHeight + 4, width: layout.width }}
            data-visible={expanded ? 'true' : 'false'}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div
                className="flex items-center justify-between"
                style={{ height: HEADER_HEIGHT_PX }}
              >
                <span className="text-[12px] font-semibold text-white">
                  {translate('auto.components.notchOverlay.NotchOverlayRoot.agents', 'Agents')}
                </span>
                <span className="text-[11px] text-[color:var(--notch-text-secondary)] tabular-nums">
                  {rows.length}
                </span>
              </div>
              <div
                className="notch-scroll scrollbar-sleek flex flex-col overflow-y-auto"
                style={{
                  height: VISIBLE_ROWS * ROW_HEIGHT_PX + (VISIBLE_ROWS - 1) * ROW_GAP_PX,
                  gap: ROW_GAP_PX
                }}
              >
                {rows.length === 0 ? (
                  <div
                    className="notch-panel-row flex items-center px-3 text-[12px] text-[color:var(--notch-text-secondary)]"
                    style={{ height: ROW_HEIGHT_PX }}
                  >
                    {translate(
                      'auto.components.notchOverlay.NotchOverlayRoot.noAgents',
                      'No open seats'
                    )}
                  </div>
                ) : (
                  rows.map((card) => <AgentRow key={card.paneKey} card={card} />)
                )}
              </div>
            </div>
            <div className="w-px self-stretch bg-white/[0.07]" />
            <SummaryColumn summary={summary} />
          </div>
        </div>
      </div>
    </div>
  )
}
