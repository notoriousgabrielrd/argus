---
name: argus-seats
description: >-
  The protocol between Argus seats — the org-chart agents (`CEO`, `BOSS`, `ENGINEER`,
  `HUNTER`, `AUDITOR`, `DESIGNER`) that occupy terminal panes, one Claude process each.
  Use when you hold a seat and need to hand work to another one, when you are asked to
  "ask the BOSS", "send this to the ENGINEER", "get the AUDITOR to review", when a seat
  is vacant and has to be staffed, or when deciding whether to delegate to a seat or to
  a subagent. Use `argus-cli` for the raw terminal and worktree commands, and
  `orchestration` for structured multi-agent coordination — task DAGs, blocking
  ask/reply, decision gates.
---

# Argus seats

A **seat** is an org-chart agent occupying a terminal pane, running its own Claude process.
Seats are exclusive per workspace and persistent: while the pane lives, `seat:<NAME>` always
resolves to it.

Below, `ORCA` is the CLI you resolved (see the `argus-cli` guide): `$ORCA_CLI_COMMAND` if set,
else `argus-dev` in a dev checkout, else `argus`.

## Seat or subagent

Both exist; they are not interchangeable.

Send work to a **seat** when it has an owner and a completion criterion. A seat is a separate
process in a visible pane — you can watch it, interrupt it, and pick the answer up later.

Use a **subagent** for broad, throwaway, read-only search, where you want the conclusion and
not the file dumps.

The failure mode worth naming: a subagent runs inside *your* session. You pay for its context,
its report inflates yours on every later turn, and one that goes off the rails is invisible
until it returns. That is fine for a lookup and expensive for a day of work.

## Who am I

```
ORCA terminal show --terminal self --json      # .result.terminal.seat
```

Always `--terminal self`. Omitting `--terminal` resolves the pane the **human** last focused,
which is you only by coincidence.

Then load your own persona. Argus reads only the frontmatter of a seat definition — it never
injects the role into you:

```
ORCA terminal seats --json                     # find your seat, read its definitionPath
```

The file may live in the project (`.claude/agents/`), in the store Argus keeps for the repo, or
in the baseline shipped inside Argus. `source` tells you which; `definitionPath` tells you where.

## Who is the team

```
ORCA terminal seats --json
```

Per seat: `handle` (`null` = vacant), `role`, `readOnly`, `reportsTo`, `directReports`, `depth`,
`source`, `definitionPath`.

The chart is routing metadata, not a lock — Argus blocks no send. It says who it *makes sense*
to send to. House rule: delegate down, escalate up, and go sideways when the subject is plainly
someone else's, without triangulating through a manager for form's sake.

## Hand work to another seat

```
ORCA terminal send --terminal seat:BOSS \
  --text "From AUDITOR | Trail: YOU>AUDITOR>BOSS | <the request + completion criterion>" \
  --enter --json
```

- **Address the seat, never the handle.** Handles are runtime-scoped and go stale; `seat:`
  re-resolves every call.
- **`seat:` resolves by `cwd`**, not by which pane you are. `send` and `wait` take no
  `--worktree`: Argus finds the workspace containing your current directory and looks for the
  seat there. A `seat_not_assigned:<NAME>` on a visibly occupied seat means you are speaking
  from a different workspace than its.
- **Always prefix `From <YOUR_SEAT> | Trail: <path so far>`.** The trail is what prevents loops:
  never send to a seat already on it. If the request can only go back to someone already there,
  stop and answer your caller instead.
- **Ask for the reply explicitly** ("when you are done, reply to `seat:AUDITOR`").
- **Do not babysit.** Sent is sent. Wait only if your own work depends on the answer, and then
  wait with `terminal wait --for tui-idle`, never by polling.

Read what came back:

```
ORCA terminal read --terminal seat:HUNTER --json
```

## Staff a vacant seat

```
ORCA terminal create --worktree active --title <SEAT> \
  --command "<absolute path to claude> --dangerously-skip-permissions" --json
ORCA terminal assign --terminal <handle from create> --seat <SEAT> --json
ORCA terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json
```

**Use the absolute path to the binary.** A bare `claude` can hit a shell function and attach the
pane to a shared tmux session — then every pane is a window onto the *same* Claude and the
prompts mix.

`--dangerously-skip-permissions` is deliberate: a seat that stops on a permission prompt cannot
be driven from outside. It edits files and runs commands in this workspace without asking.

If `assign` fails with `unknown_project_agent`, close the terminal you just created before
reporting — do not leave an orphan pane.

## Limits

- You do not lose your persona by passing work on. An auditor that calls an engineer is still
  read-only afterwards.
- Passing work on delegates the **work**, not the responsibility: whoever took the request from
  the human closes the loop with them.
- **Never ask another seat for something its persona forbids.** If the work needs that, the
  request goes up to the human.

## Give a role this project's knowledge

The shipped baseline carries the role contract and no stack knowledge — deliberately, since it
ships to every project. To specialize one, write the persona into the directory
`terminal seats --json` reports as `agentStoreDir`. That overrides the baseline for every
worktree of the repo and puts no file in anyone's checkout.

Investigate before writing: read the manifest, the deploy workflow, the directory layout, the
migrations. A persona that generalizes from another project is worse than one that admits it
does not know.
