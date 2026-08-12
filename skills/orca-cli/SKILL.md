---
name: orca-cli
description: >-
  Use the public `orca` CLI to operate Argus-managed worktrees, folder contexts,
  terminals, repos, automations, artifacts, worktree comments, and the browser
  embedded inside the Argus app. Use when the user says "$orca-cli", "use argus cli",
  "Argus worktree", "child worktree", "cardStatus", "spawn codex/claude in a worktree",
  "read/wait/send Argus terminal", "terminal send", "full handoff", "handover",
  "give this to another agent", "another worktree", "Argus browser", "argus artifacts",
  "share HTML/Markdown", "public artifact link", or "control the browser inside
  Argus". Prefer this over raw `git worktree`, ad hoc
  PTYs, Playwright, or Computer Use when the task touches Argus-managed state.
  Use Computer Use for browser windows, webviews, or desktop UI outside Argus's
  embedded browser.
---

# Argus CLI

This file is a discovery stub, not the usage guide. The full, version-matched Argus CLI
reference is served by the `argus` binary itself — kept out of this file on purpose so it
can never drift from the binary that will actually run your commands.

Engage Argus whenever its running editor/runtime is the source of truth: Argus-managed
worktrees, folder contexts, terminals, repos, automations, worktree comments, and the
browser embedded inside the Argus app. Triggers include "$orca-cli", "Argus worktree",
"child worktree", "spawn codex/claude in a worktree", "read/wait/send Argus terminal",
"full handoff" / "handover" / "give this to another agent", and "control the browser
inside Argus". Use plain shell tools when Argus state does not matter.

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Argus exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `argus-dev`.
- Otherwise, use `argus`, which is the command name on every platform.

If you find a bare `orca` on PATH, it is not this CLI: that is the GNOME Orca screen reader
(`/usr/bin/orca`), and running it starts speech on the user's machine.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Argus build.

## Load the full guide before running Argus commands

```text
ORCA skills get orca-cli
```

That prints the complete, version-matched guide for the exact binary that will handle your
next commands — worktrees, handoffs, terminals, automations, and the built-in browser.
Read it first, then run the specific command you need.

Don't guess subcommands or flags from memory or from a cached copy of this stub. They
change between Argus releases, and this file deliberately no longer lists them. Confirm the
app is up with `ORCA status --json` (start it with `ORCA open --json` if needed), and
prefer `--json` for agent-driven calls.

## If an older Argus does not recognize `skills get`

Use this fallback only when the selected binary explicitly reports that `skills get` is an
unknown command. Another failure is not proof of an older binary; report it rather than
guessing or changing executables. For a confirmed pre-guide binary, use only this bounded,
read-only bootstrap to orient. Do not dead-end and do not invent commands:

```text
ORCA status --json
ORCA worktree ps --json
ORCA terminal list --json
```

Then tell the user that updating Argus restores the full, version-matched guide via
`ORCA skills get orca-cli`. Beyond these commands, ask the user rather than guessing a
command surface this older binary may not support.
