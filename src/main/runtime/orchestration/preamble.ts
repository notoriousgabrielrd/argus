import type { OrchestrationCliCommand } from './cli-command'

export type PreambleParams = {
  taskId: string
  // Why: completion and heartbeat payloads attribute activity to a specific
  // dispatch context (not just a task). A retried task has multiple
  // dispatch_contexts rows; keying worker_done/heartbeat on dispatchId
  // prevents stale messages from a previously-failed dispatch from completing
  // or refreshing the retry.
  dispatchId: string
  dispatchCapability?: string
  taskSpec: string
  coordinatorHandle: string
  workerHandle: string
  devMode?: boolean
  // Why the field remains: every host now installs the same `argus` command, but an
  // older peer can still pin a legacy name over RPC.
  cliCommand?: OrchestrationCliCommand
  // Why: populated by the coordinator's dispatch pre-flight (§3.1) only
  // when the target worktree is behind its tracking remote. When absent
  // or when `behind === 0`, the preamble emits no drift section. Callers
  // must NOT pre-populate this with empty data; the drift section is a
  // loud-but-rare signal tied to the `allow-stale-base: true` override
  // path, and polluting it for fresh worktrees would train workers to
  // ignore it.
  baseDrift?: {
    base: string
    behind: number
    recentSubjects: string[]
  }
  // Why: prompt-returning agents should idle after worker_done, while bare
  // shells have no agent prompt for Argus to reuse.
  workerKind?: 'prompt-returning-agent' | 'bare-shell'
  // Why: resolved from live pane state at injection time, not from the task, so
  // previews (dispatch --dry-run, dispatch-show --preamble) omit the section
  // instead of guessing a roster for a handle that may not exist yet.
  teammates?: readonly { seat: string; description: string }[]
  /** The worker's own seat, dropped from the roster when the caller knows it. */
  selfSeat?: string
}

// Why: 5 minutes is frequent enough that the coordinator's stale-heartbeat
// check (threshold 10 min) catches a hung worker within one tick, and
// infrequent enough to avoid inbox spam on long tasks. One constant so
// cadence tuning is a single-line change (Q1 in DESIGN_DOC_PREAMBLE_FIX.md).
const HEARTBEAT_INTERVAL_MIN = 5

// Why cap both: the roster exists to save the worker a `terminal seats` round trip, so it
// has to stay smaller than the call it replaces. A project with a large chart would
// otherwise grow every dispatch prompt without bound, and a `description:` line in
// `.claude/agents/*.md` is free-form prose that can run for paragraphs.
const MAX_ROSTER_SEATS = 8
const MAX_ROSTER_DESCRIPTION = 100

// Why: the dispatch preamble teaches agents about Argus's CLI commands for
// structured communication. Behavioral rules (body summary, heartbeat cadence,
// no-AskUserQuestion) live as inline comments above the relevant CLI example,
// not as a separate prose block — LLM readers anchor on examples and skim
// trailing prose, so rules must land at the point of use.
export function buildDispatchPreamble(params: PreambleParams): string {
  // Why: in dev mode, agents must use argus-dev to connect to the dev runtime's
  // socket. Without this, agents inside the dev Electron app would call the
  // production CLI and talk to the wrong Argus instance (Section 6.4).
  const cli = params.devMode ? 'argus-dev' : (params.cliCommand ?? 'argus')
  const postDoneInstructions = buildPostWorkerDoneInstructions({
    cli,
    workerKind: params.workerKind ?? 'prompt-returning-agent'
  })
  const capabilityFlag = params.dispatchCapability
    ? ` --dispatch-capability ${params.dispatchCapability}`
    : ''

  const header = `You are working inside Argus, a multi-agent IDE. You are a dispatched worker.
Your coordinator's terminal handle is: ${params.coordinatorHandle}
Your task ID is: ${params.taskId}

You talk to the coordinator only through the CLI commands below. Do not use
Slack, GitHub comments, or any other channel to reach a human during the run.

=== CLI COMMANDS ===

  # Report the terminal task outcome (REQUIRED exactly once).
  #
  # RULE: --body must be a 3-sentence executive summary (what you did,
  # what you found, what's left). Never send an empty body; the coordinator
  # reads the body first and only opens artifacts if it needs more detail.
  #
  # RULE: --body carries pointers, never payloads. Do not paste file
  # contents, diffs, logs, or command output into it. Anything longer than
  # the summary goes to a file whose path you pass as --report-path; changed
  # files go in --files-modified. You share this worktree with the
  # coordinator, so a path is enough for it to read what you wrote — and it
  # pays for every byte of --body in its own context window.
  #
  # RULE: send worker_done exactly once. Use --outcome succeeded when the
  # requested work is done, or replace it with --outcome failed when it is not.
  # Never encode failure only in prose and never silently exit.
  # Include BOTH taskId and dispatchId in the payload so a late completion
  # from a failed retry cannot complete the current dispatch.
  ${cli} orchestration send --from ${params.workerHandle}${capabilityFlag} \\
    --type worker_done --subject "<short status>" \\
    --body "<3-sentence summary: what you did, what you found, what's left>" \\
    --task-id ${params.taskId} --dispatch-id ${params.dispatchId} --outcome succeeded \\
    --files-modified "path/a,path/b" \\
    --report-path "<optional: path to the full artifact>"

  # BEHAVIOR RULE: send a heartbeat every ${HEARTBEAT_INTERVAL_MIN} minutes
  # while actively working on the task. The coordinator uses this to
  # distinguish "still thinking" from "hung / crashed." Skip heartbeats only
  # while blocked inside \`check --wait\` or \`ask\` — those calls are
  # themselves liveness signals.
  #
  # Include BOTH taskId and dispatchId in the payload: the coordinator
  # attributes the heartbeat to the specific dispatch context, not just
  # the task, so a straggler heartbeat from a previously-failed dispatch
  # cannot mask a hung retry.
  ${cli} orchestration send --from ${params.workerHandle}${capabilityFlag} \\
    --type heartbeat --subject "alive" \\
    --task-id ${params.taskId} --dispatch-id ${params.dispatchId} \\
    --phase "<short: investigating|implementing|reviewing|waiting>"

  # Ask the coordinator a question and block until it answers.
  #
  # BEHAVIOR RULE #1 (MUST NOT VIOLATE):
  # NEVER use AskUserQuestion; use \`${cli} orchestration ask\` or send
  # --type decision_gate. AskUserQuestion opens a local TUI prompt that the
  # coordinator cannot see and cannot answer — your session will hang forever
  # waiting on a human. Every interactive question goes through \`ask\` below.
  #
  # The \`ask\` verb durably records a question in this Dispatch's Run and
  # blocks until the coordinator replies, then prints the reply body. If the
  # call times out or disconnects, resume with the returned message ID instead
  # of creating a duplicate question.
  ${cli} orchestration ask --from ${params.workerHandle}${capabilityFlag} \\
    --question "<your question>" \\
    --options "<optional,comma,separated>" \\
    --timeout-ms 600000

  # Escalate a blocker or failure (pre-completion, when you need the
  # coordinator to do something before you can continue):
  ${cli} orchestration send --from ${params.workerHandle}${capabilityFlag} \\
    --type escalation --subject "Blocked: <reason>" \\
    --body "<details>" \\
    --task-id ${params.taskId}

  # Check for messages from the coordinator:
  ${cli} orchestration check --terminal ${params.workerHandle}

${postDoneInstructions}`

  // Why: the drift section fires only when the coordinator allowed dispatch
  // against a stale worktree (via `allow-stale-base: true` in the task spec,
  // see §3.4) OR when behind>0 but under the refusal threshold. Either way
  // it is defense-in-depth: the worker sees the drift from line 1 instead
  // of discovering it via stale line numbers in artifacts later.
  const drift =
    params.baseDrift && params.baseDrift.behind > 0 ? buildDriftSection(params.baseDrift) : ''

  const roster = buildProjectAgentSection(params.teammates ?? [], params.selfSeat)

  return `${header}${roster}${drift}

=== TASK ===
${params.taskSpec}`
}

/**
 * Names the seats this project defines, so a worker can route work it should not do.
 *
 * Routing only, deliberately: prompting a peer seat directly would open a channel the
 * coordinator cannot see, which is the one thing the header forbids. Knowing the roster
 * lets the worker name the right owner in its report instead of asking who exists.
 */
function buildProjectAgentSection(
  teammates: readonly { seat: string; description: string }[],
  selfSeat?: string
): string {
  const others = teammates.filter((agent) => agent.seat !== selfSeat)
  if (others.length === 0) {
    return ''
  }
  const listed = others.slice(0, MAX_ROSTER_SEATS)
  const lines = listed.map((agent) => {
    const description = agent.description.trim()
    if (!description) {
      return `  ${agent.seat}`
    }
    const trimmed =
      description.length > MAX_ROSTER_DESCRIPTION
        ? `${description.slice(0, MAX_ROSTER_DESCRIPTION).trimEnd()}…`
        : description
    return `  ${agent.seat} — ${trimmed}`
  })
  const remaining = others.length - listed.length
  const overflow = remaining > 0 ? `\n  …and ${remaining} more: argus terminal seats --json` : ''

  return `

--- PROJECT AGENTS IN THIS WORKTREE ---
Seats this project defines in .claude/agents/, for routing:
${lines.join('\n')}${overflow}

RULE: do not prompt another seat directly. That opens a channel the coordinator
cannot see. When work belongs to another seat, name that seat in your
worker_done body or escalation and let the coordinator dispatch it.
---`
}

function buildPostWorkerDoneInstructions({
  cli,
  workerKind
}: {
  cli: string
  workerKind: NonNullable<PreambleParams['workerKind']>
}): string {
  // Why: re-dispatch reaches idle agents as terminal input; inbox polling
  // after completion cannot receive that new TASK block and looks hung.
  if (workerKind === 'bare-shell') {
    return `=== AFTER YOU SEND worker_done ===

worker_done ends your turn for this task. Your dispatched work is complete:
stop and take no further actions — do NOT start new or unrelated work,
do NOT run a sleep/poll loop, and do NOT keep calling
\`${cli} orchestration check\`. The coordinator has already recorded your
completion and expects no further output.

Exit the shell after completion. Bare-shell workers have no idle agent
prompt for Argus to reuse; if the coordinator has more for you it will
dispatch or prompt another worker with a fresh TASK block.`
  }

  return `=== AFTER YOU SEND worker_done ===

worker_done ends your turn for this task. Your dispatched work is complete:
stop, return to an idle prompt, and take no further actions — do NOT start
new or unrelated work, do NOT run a sleep/poll loop, and do NOT keep calling
\`${cli} orchestration check\`. The coordinator has already recorded your
completion and expects no further output.

Do not exit the shell. Your terminal stays available, and if the
coordinator has more for you it will re-engage this terminal with a fresh
preamble + TASK block, which arrives as new input. When that happens,
reset and start the new task; ignore the previous task's follow-ups.`
}

function buildDriftSection(drift: NonNullable<PreambleParams['baseDrift']>): string {
  const subjects = drift.recentSubjects.map((s) => `  - ${s}`).join('\n')
  return `

--- BASE DRIFT ---
Your worktree HEAD is ${drift.behind} commits behind ${drift.base}. The 5 most recent
subjects on ${drift.base} NOT in your worktree:
${subjects}

If any look relevant to your task, either pull them in (\`git pull --rebase
${drift.base}\` or equivalent) or escalate to the coordinator before starting.
---`
}
