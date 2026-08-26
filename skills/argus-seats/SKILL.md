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

This file is a discovery stub, not the usage guide. The full, version-matched seat protocol is
served by the `argus` binary itself — kept out of this file on purpose so it can never drift
from the binary that will actually run your commands.

A **seat** is an org-chart agent (`CEO`, `BOSS`, `ENGINEER`, `HUNTER`, `AUDITOR`, `DESIGNER`)
occupying a terminal pane, running its own Claude process. Every Argus workspace has them:
definitions resolve from the project, from the store Argus keeps per repo, and from a baseline
shipped inside the app — so nobody has to add a file to a repo to get a team.

Engage this guide when you hold a seat and need to hand work to another one, when a seat is
vacant and has to be staffed, or when deciding between a seat and a subagent. Use the
`argus-cli` guide for raw terminal and worktree commands, and `orchestration` for structured
coordination — task DAGs, blocking ask/reply, decision gates.

## Resolve the CLI for this session

- `$ORCA_CLI_COMMAND` if set (Argus exports it for managed WSL sessions),
- else `argus-dev` in a dev checkout that exposes `ORCA_DEV_REPO_ROOT`,
- else `argus`.

A bare `orca` on PATH is not this CLI: that is the GNOME Orca screen reader, and running it
starts speech on the user's machine.

## Load the full guide before driving seats

```text
ORCA skills get argus-seats
```

That prints the complete, version-matched protocol for the exact binary that will handle your
next commands — addressing, the trail rule that prevents loops, staffing a vacant seat, when to
wait, and how to give a role this project's real knowledge without writing into the repo.

Don't guess flags from memory or from a cached copy of this stub. Start with
`ORCA terminal seats --json`, which lists the seats resolvable here and who occupies each.
