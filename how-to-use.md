# Agents and seats

Argus uses the word "agent" for two different things. They are separate axes, and one terminal
can be both at once. This page explains the difference, then how to assign a terminal to a
project agent from the CLI.

## The two kinds of agent

| | **Argus agent** | **Project agent** |
|---|---|---|
| Answers | *what is running in this pane?* | *who is this pane?* |
| Values | `claude`, `codex`, `opencode`, `gemini`, … | `AUDITOR`, `BOSS`, `ENGINEER`, `DESIGNER`, … |
| Defined by | Argus — it knows how to launch these | your project, in `.claude/agents/*.md` |
| Same in every repo | yes | no, each project has its own cast |
| CLI flag | `--agent` | `--seat` |
| Set by | `worktree create --agent codex`, `terminal create --command "claude"` | `terminal assign --seat AUDITOR` |
| Stored as | `launchAgent`, per tab | `seatAssignmentsByWorktree`, per worktree |

**Why this matters.** Open three panes, all running `claude`. As Argus agents they are
identical — three `claude` processes, nothing to tell them apart. The seat is what makes one of
them the AUDITOR, one the ENGINEER, and one the BOSS:

```text
term_a1b2c3   seat=AUDITOR    agent=claude
term_d4e5f6   seat=ENGINEER   agent=claude
term_g7h8i9   seat=BOSS       agent=codex
```

A seat says nothing about which tool runs in the pane, and the tool says nothing about the
seat. You can seat a pane before launching anything into it, or launch first and seat later.

**A seat is a label plus an address.** Assigning a seat does not start a process, send a
prompt, or change what the pane runs. What it buys you is the address: `seat:AUDITOR` becomes a
way to reach that terminal.

## Where project agents come from

Argus reads `<workspace>/.claude/agents/*.md` — the same definitions Claude Code uses. Those
files stay in your project repo; Argus reads them and never writes them.

The seat name is the frontmatter `name:`, not the filename:

```markdown
---
name: AUDITOR
description: Guardião das regras de negócio do monorepo AgendaPower…
tools: Read, Grep, Glob, Bash, Write
---
```

Filename case varies between projects (`auditor.md` in AgendaPower, `BOSS.md` in BeeFans), so
the frontmatter is what counts. A workspace with no `.claude/agents/` defines no seats, and
`terminal assign` will say so rather than inventing one.

Seat names are case-insensitive on input: `--seat auditor` and `--seat AUDITOR` are the same
seat, stored as `AUDITOR`.

## Walkthrough

Start from the terminals a workspace actually defines:

```console
$ argus terminal seats
AUDITOR  (vacant)
  Guardião das regras de negócio — última barreira antes do cliente.
  tools: Read, Grep, Glob, Bash, Write

ENGINEER  (vacant)
  Engenheiro fullstack sênior — dono da implementação pesada de features.
  tools: Read, Grep, Glob, Bash, Edit, Write, WebFetch, WebSearch
```

Create a pane, launch a tool into it, then seat it:

```console
$ argus terminal create --command "claude"
Created terminal term_a1b2c3

$ argus terminal assign --terminal term_a1b2c3 --seat AUDITOR
Assigned terminal term_a1b2c3 to project agent AUDITOR.
```

From here on, address it by seat instead of by handle:

```console
$ argus terminal send --terminal seat:AUDITOR --text "audit the booking rules" --enter
$ argus terminal read --terminal seat:AUDITOR --json
$ argus terminal wait --terminal seat:AUDITOR --for tui-idle --timeout-ms 300000
```

And `terminal seats` now shows who is sitting where:

```console
$ argus terminal seats
AUDITOR  term_a1b2c3
  …
```

## Command reference

```bash
# What this workspace defines, and who occupies each seat
argus terminal seats [--worktree <selector>] [--json]

# Assign. --terminal defaults to the active terminal in the current worktree.
argus terminal assign [--terminal <handle>] --seat <PROJECT_AGENT> [--force] [--json]

# Release the seat. The terminal keeps running.
argus terminal unassign [--terminal <handle>] [--json]
```

`seat:<PROJECT_AGENT>` works anywhere `--terminal` is accepted — `send`, `read`, `show`,
`wait`, `close`, `rename`, `split`, `switch`, `unassign`. It resolves through
`terminal.resolveSeat` before the command runs, the same way `--terminal` omitted resolves
through `terminal.resolveActive`.

`terminal list` and `terminal show` report the seat, so you can see both axes at once:

```console
$ argus terminal list --json | jq '.result.terminals[] | {handle, seat, title}'
```

## Rules

**A seat is exclusive per worktree.** That is what makes `seat:AUDITOR` unambiguous — it always
resolves to exactly one terminal. Assigning a seat that another terminal already holds fails:

```console
$ argus terminal assign --terminal term_d4e5f6 --seat AUDITOR
Error: Seat AUDITOR is already assigned to another terminal in this worktree
```

Pass `--force` to take it. The old occupant keeps running and only loses the label, and the
result tells you which terminal that was:

```console
$ argus terminal assign --terminal term_d4e5f6 --seat AUDITOR --force
Assigned terminal term_d4e5f6 to project agent AUDITOR.
AUDITOR released from terminal term_a1b2c3.
```

**Per worktree, not per machine.** Three worktrees of the same project can each have their own
AUDITOR. `seat:AUDITOR` resolves within the worktree you are in.

**A pane holds at most one seat.** Seating a pane that already holds a different seat vacates
the old one, and says so:

```console
$ argus terminal assign --terminal term_a1b2c3 --seat BOSS
Assigned terminal term_a1b2c3 to project agent BOSS.
This terminal no longer holds AUDITOR.
```

**Assignments survive a restart, dead panes do not.** The mapping is persisted with the
workspace session, so a seated terminal is still seated tomorrow. A seat whose pane is gone is
dropped when read, so `seat:` never resolves to a pane that no longer exists.

**Only names the project defines.** `terminal assign` validates against `.claude/agents/*.md`,
so a typo fails at assign time instead of becoming a seat nothing can ever find.

## Using it from scripts and agents

**Prefer `seat:` over handles.** Terminal handles are runtime-scoped: they go stale when Argus
restarts and you get `terminal_handle_stale`. A seat is re-resolved on every call, so a script
written against `seat:AUDITOR` keeps working across restarts without reacquiring anything.

```bash
# Fragile — the handle is captured once
HANDLE=$(argus terminal create --command "claude" --json | jq -r '.result.terminal.handle')
argus terminal send --terminal "$HANDLE" --text "go" --enter

# Durable — seat it once, address it by name forever
argus terminal assign --terminal "$HANDLE" --seat AUDITOR
argus terminal send --terminal seat:AUDITOR --text "go" --enter
```

**JSON output.** Every command takes `--json` and prints the RPC envelope, with the payload
under `result`:

```jsonc
{
  "id": "…",
  "ok": true,
  "result": {
    "seat": {
      "handle": "term_d4e5f6",
      "tabId": "tab_…",
      "leafId": "…",
      "worktreeId": "repo::/path",
      "seat": "AUDITOR",
      "displacedHandle": "term_a1b2c3", // only when --force took an occupied seat
      "vacatedSeat": null                // only when this pane held a different seat
    }
  },
  "_meta": { "runtimeId": "…" }
}
```

For `terminal unassign`, `result.seat.seat` is the seat that was released, or `null` if the
terminal held none.

## Troubleshooting

| Error | What it means |
|---|---|
| `no_project_agents:<path>` | That workspace has no `.claude/agents/` directory. Add agent definitions to the project repo. |
| `unknown_project_agent:<name>:<known>` | The name is not defined by this project. The second half lists what is. Check for a typo, or add the `.md`. |
| `seat_not_assigned:<name>` | The seat is defined but no terminal holds it. Run `terminal seats` to confirm, then `terminal assign`. |
| `Seat <name> is already assigned…` | Another terminal holds it. Use `--force` to take it, or seat a different agent. |
| `Invalid seat name: …` | Seat names are identifiers: letters, digits, `_` and `-`, starting with a letter. |
| `terminal_handle_stale` | The handle predates a restart. This is the reason to address terminals by `seat:` instead. |

## What this does not do

- **It does not launch anything.** Seating a pane does not start `claude` or send a prompt. Use
  `terminal create --command "<tool>"` for that, then assign.
- **It is not visible in the UI yet.** Only the CLI reads and writes seats today; nothing paints
  the seat on the pane. See pendência 5 in [`PENDENCIAS.md`](./PENDENCIAS.md).
- **It does not know the hierarchy.** Seats are flat. The org chart (`CEO` delegates to
  `BOSS`/`ENGINEER`/…) lives in `resources/argus/*.json` and has no consumer yet — the `.md`
  files do not express who reports to whom.
