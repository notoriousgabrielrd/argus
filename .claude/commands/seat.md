---
description: Send a prompt to a project-agent seat in this worktree, seating a fresh Claude if the seat is empty
argument-hint: <seat> <prompt>
allowed-tools: Bash(argus:*), Bash(argus-dev:*)
---

Deliver a prompt to the project agent named by the first word of `$ARGUMENTS`.

Arguments: `$ARGUMENTS` — the first whitespace-delimited token is the seat name, everything after it is the prompt. Uppercase the seat name; `/seat auditor check the diff` targets `AUDITOR` with the prompt `check the diff`. If there is no prompt after the seat name, stop and ask what to send.

## Pick the CLI

Resolve once and reuse it for every command below:

- `$ORCA_CLI_COMMAND` if set,
- else `argus-dev` if `$ORCA_DEV_REPO_ROOT` is set (dev checkout),
- else `argus`.

## 1. Check the seat exists and whether it is staffed

```
<cli> terminal seats --json
```

Match `seats[]` on `seat`. Then:

- **No match** — stop. Report the seat names the workspace defines, plus any `chartOnlyAgents` (those are in the org chart but have no `.claude/agents/*.md`, so they cannot be seated). The fix is a `.md` in the project, not an Argus setting. Do not create anything.
- **Match with a `handle`** — the seat is staffed. Skip to step 3.
- **Match with `handle: null`** — the seat is vacant. Go to step 2.

## 2. Staff a vacant seat

```
<cli> terminal create --worktree active --title <SEAT> --command "claude --dangerously-skip-permissions" --json
<cli> terminal assign --terminal <handle from create> --seat <SEAT> --json
<cli> terminal wait --terminal <handle> --for tui-idle --timeout-ms 120000 --json
```

`--dangerously-skip-permissions` is deliberate: a seated worker that stops on a permission prompt cannot be driven from here. It means the agent you just seated can edit files and run commands in this worktree without asking.

If `assign` fails with `unknown_project_agent`, close the terminal you just created before reporting — do not leave an orphan pane behind.

## 3. Send the prompt

```
<cli> terminal send --terminal seat:<SEAT> --text "<prompt>" --enter --json
```

Address the seat, never the handle: handles are runtime-scoped and go stale, the seat re-resolves every call.

Prefix the prompt with your own identity when you have one — run `<cli> terminal show --terminal self --json` and, if it reports a `seat`, send `From <your seat>: <prompt>`. Skip the prefix if you hold no seat.

## 4. Report and stop

State the seat, the handle now in it, and whether you spawned it. Then stop — this is a handoff, not supervision. Do not poll, do not wait for a reply, do not open a monitoring loop.

Tell the user how to pick the answer up themselves:

```
<cli> terminal read --terminal seat:<SEAT> --json
```

Only follow the seated agent's progress if the user explicitly asks you to.
