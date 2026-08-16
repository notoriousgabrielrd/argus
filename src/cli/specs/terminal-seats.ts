import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

/**
 * Project-agent seat commands.
 *
 * A seat is the *project agent* the workspace defines in `.claude/agents/*.md` (AUDITOR,
 * BOSS, ENGINEER, …) — deliberately a different flag from `--agent`, which everywhere else
 * in this CLI names the Argus agent, the tool launched in the pane (`claude`, `codex`).
 */

export const TERMINAL_SEAT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'assign'],
    summary: 'Assign a terminal to a project agent (AUDITOR, BOSS, …)',
    usage: 'argus terminal assign [--terminal <handle>] --seat <PROJECT_AGENT> [--force] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'terminal', 'seat', 'force'],
    notes: [
      'A seat is the project agent the workspace defines in .claude/agents/*.md — not the Argus agent (`claude`, `codex`) running in the pane. Both can be set: one pane can be seat AUDITOR while running claude.',
      'Seats are exclusive per worktree, so `--terminal seat:AUDITOR` always resolves to one terminal. Assigning an occupied seat fails until you pass --force, which reports the terminal that lost it.',
      'A pane holds at most one seat; re-seating a pane vacates the seat it held.',
      'Use `--terminal self` to seat the pane running the command. Omitting --terminal seats the pane you last focused, which is the caller only by coincidence — an agent in a background pane must pass self.',
      'Run `argus terminal seats` to list the seats this workspace defines and who occupies them.'
    ],
    examples: [
      'argus terminal assign --terminal self --seat AUDITOR --json',
      'argus terminal assign --terminal term_abc123 --seat ENGINEER',
      'argus terminal assign --terminal term_abc123 --seat AUDITOR --force --json'
    ]
  },
  {
    path: ['terminal', 'unassign'],
    summary: 'Release the project-agent seat a terminal holds',
    usage: 'argus terminal unassign [--terminal <handle>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'terminal'],
    notes: ['The terminal keeps running; only the seat is released.'],
    examples: [
      'argus terminal unassign --terminal self --json',
      'argus terminal unassign --terminal term_abc123 --json'
    ]
  },
  {
    path: ['terminal', 'seats'],
    summary: 'List the project agents a workspace defines and which terminal holds each',
    usage: 'argus terminal seats [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'worktree'],
    notes: [
      'Reads <workspace>/.claude/agents/*.md, which stays the source of truth — Argus reads those definitions, it does not own them.',
      "Seats are ordered and indented by the project chart when one exists: <workspace>/argus.agents.json, else a roster bundled with Argus. The chart adds each agent's role line and who it reports to; the .md files do not express that.",
      'A name the chart lists but the workspace does not define is reported separately, not as a seat — it cannot be assigned.'
    ],
    examples: ['argus terminal seats --json', 'argus terminal seats --worktree active']
  }
]
