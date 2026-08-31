# Design System

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role. When STYLEGUIDE.md is silent, follow the resolution order in its final section.

## Electron UI Validation

Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.

# Project Agents: Dispatch by Seat, Not by Subagent

`ENGINEER`, `DESIGNER`, and `AUDITOR` are **seats** — Argus terminal panes, each running its
own Claude process. Hand work to a seat with `/seat <NAME> <prompt>`, or directly:

```
argus terminal seats --json                       # handle: null means the seat is vacant
argus terminal send --terminal seat:ENGINEER --text "<request>" --enter --json
argus terminal read --terminal seat:ENGINEER --json
```

Address the seat, never the handle — handles are runtime-scoped and go stale.

`.claude/agents/*.md` serves two consumers: Argus reads the frontmatter to know a seat
exists (`src/main/argus/project-agent-definitions.ts`), and Claude Code registers the same
file as a subagent type. That makes the `Agent` tool the path of least resistance, and it is
the wrong one for real work: a subagent runs inside the caller's session, so the caller pays
for its context, its report inflates the caller on every later turn, and a run that goes off
the rails is invisible until it returns. A seat is a separate process in a visible pane —
watchable, interruptible, resumable.

Subagents stay fine for one thing: broad, throwaway, read-only search where you want the
conclusion and not the file dumps. Anything with an owner and a completion criterion goes to
a seat.

Every agent definition carries an explicit `model:`. Keep the reasoning seats on the
inherited model and the executor seats on `sonnet` — an unset `model:` silently inherits
Opus for the whole run.

# Style
## Concise/Brief Non-obviosu comments ONLY
  * DO NOT: be verbose, explain the obvious, walk through the code ("WHY not HOW")
  * BE CONCISE. 1 LINE if possible

## Lint Rules: Do Not Disable Max Lines

NEVER add a `max-lines` disable (`eslint-disable max-lines`, `oxlint-disable max-lines`, or line-specific variants), and never add a per-file `max-lines` bump in `mobile/.oxlintrc.json`.

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

## Type Declarations: Prefer `.ts` Over `.d.ts`

# Considerations
## Worktree Safety

Always use the primary working directory (the worktree) for all file reads and edits. Never follow absolute paths from subagent results that point to the main repo.

## Delegating Parallel Work

Parallel work stays in the **current** worktree — everyone shares one checkout, one branch, one set of edits. Never spin up a child worktree just to get a second agent.

Seat the agent in a new pane of this worktree, then address it by seat:

```text
argus terminal seats --json
argus terminal create --worktree active --command "claude" --json
argus terminal assign --terminal <handle> --seat ENGINEER --json
argus terminal send --terminal seat:ENGINEER --text "<brief>" --enter --json
```

`.claude/agents/` (AUDITOR, DESIGNER, ENGINEER) defines the seats. A seat is exclusive per worktree, so `seat:<NAME>` resolves without a handle and survives restarts — never store handles across turns.

Because the seats share a checkout, coordinate writes: give each seat a disjoint set of files, or let only one write at a time. Two seats editing the same file is a lost edit, not a merge conflict.

### Input Token Economy

A seat is a long-lived session whose context stays warm; a sub-agent is one-shot and re-pays the system prompt plus this file on every spawn. Prefer re-prompting an existing seat over spawning anything new.

- **Never paste file content into a prompt.** Same worktree means the seat can read it — pass `path:line-range` and let it fetch only what it needs.
- **Don't fan out readers over the same files.** One agent reads, then hands the others the conclusion.
- **Keep CLI payloads narrow:** `--json` on every call, no `--include-visual-layouts` unless pane topology is the actual question, and page `terminal read --cursor` instead of dumping scrollback.
- **Sub-agents are for read-only fan-out you throw away** — sweeping many files for a symbol or call site, where the answer is small relative to what was read. That, not parallelism, is what keeps their output off your context.

### Messages Carry Pointers, Not Payloads

Two agent sessions cannot share a context window: everything one sends the other becomes tokens in the receiver's prompt, and stays there for the rest of its run. The sender pays output rates to write it, the receiver pays input rates on every later turn. So a message says *where*, never *what*.

- **A message body is ids, one line of meaning, and a path.** Long-form output goes to a file; the message carries `--report-path`. Changed files go in `--files-modified`, not in prose.
- **Never put file contents, diffs, logs, or command output in a body.** The agents share a checkout — a path is enough.
- **Structured over narrative:** `--payload <json>` with ids and paths beats a paragraph the receiver has to parse.
- **Pull, don't push:** `check --types`, `--peek`, `task-list --brief`, `worker-read --limit`, `terminal read --cursor`. Read the narrowest thing that answers the question.
- **The cheapest handoff moves the task, not the context.** If the work needs a live agent's context, re-prompt that agent (`worker-start --terminal <handle>`) instead of briefing a new one.

The dispatch preamble states this rule to every worker (`src/main/runtime/orchestration/preamble.ts`). Keep the two in sync: a rule that lives only here is a rule the workers never see.

## Cross-Platform Support

Orca targets macOS, Linux, and Windows. Keep all platform-dependent behavior behind runtime checks:

- **Keyboard shortcuts**: Never hardcode `e.metaKey`. Use a platform check (`navigator.userAgent.includes('Mac')`) to pick `metaKey` on Mac and `ctrlKey` on Linux/Windows. Electron menu accelerators should use `CmdOrCtrl`.
- **Shortcut labels in UI**: Display `⌘` / `⇧` on Mac and `Ctrl+` / `Shift+` on other platforms.
- **File paths**: Use `path.join` or Electron/Node path utilities — never assume `/` or `\`.
- **Windows setup scripts**: the setup/issue-command runner is a `.cmd` batch file unless the script starts with a `#!` line — never derive that from the user's terminal-shell preference, and never launch a `.cmd` runner with a bare `cmd.exe /c` from a Git Bash pane (MSYS rewrites the `/c`). See [`docs/reference/windows-setup-shell.md`](./docs/reference/windows-setup-shell.md).
- **Linux native modules**: keep the glibc floor at Ubuntu 20.04 / glibc 2.31. A module compiled from source on a newer runner can reference symbol versions absent on the floor and crash the app on startup. See [`docs/reference/linux-glibc-compatibility.md`](./docs/reference/linux-glibc-compatibility.md); packaging fails if a bundled native binary needs newer glibc.

## Shared tmux Sessions

Panes whose shell attaches to a shared tmux session would mirror each other: one tmux session has a
single current window, shared by every client. Argus prevents this with a `tmux` PATH shim that puts
each pane on its own grouped session. Before touching pane env, PATH shims, or anything that runs
tmux, read [`docs/reference/tmux-session-isolation.md`](./docs/reference/tmux-session-isolation.md).

## SSH Use Case

All changes must consider the SSH use case. Don't assume local-only execution.

## Folder Workspace Use Case

All changes must consider folder workspaces as well as git worktrees. Don't assume every workspace is a git worktree.

## Remote Wire Compatibility

Clients and remote Orca servers update independently, so mixed versions are the normal state. Before changing anything a paired client and host exchange — RPC params, stream frames, or the content either side publishes over them — follow [`docs/reference/remote-wire-compatibility.md`](./docs/reference/remote-wire-compatibility.md). A new optional field is safe; a new stream opcode must be capability-negotiated because decoders drop unknown opcodes silently; and changing what the host publishes reaches old clients even with no wire change.

## Git Binary Compatibility

Orca runs the user's Git binary on native, WSL, and SSH hosts, which may all have different versions. Treat Git 2.25 as the core-workflow baseline and follow [`docs/reference/git-compatibility.md`](./docs/reference/git-compatibility.md).

When adding or changing a Git command:

- Check when every subcommand and option was introduced. For newer behavior, keep a baseline-compatible fallback or degrade safely.
- Use `GitCapabilityCache` with a narrow unsupported-error predicate so recurring operations do not retry a known-invalid command. Do not rely only on `git --version`; wrappers such as `simple-git` do not remove host-version differences.
- Scope capability state to the host that executes Git: native, WSL distro, SSH provider, or relay connection. Cover the first fallback, later cached calls, concurrent probes, and relevant host isolation in tests.
- Keep the real-binary compatibility contract in PR CI current. When adopting a newer Git feature, add its version boundary so the preferred command and fallback both run against representative Git releases.
- Preserve commands that begin with global Git options such as `-c` before the subcommand, including auto-maintenance suppression used by worktree-create fetches.

## Git Provider Compatibility

Source-control and review changes must consider GitLab and other supported git providers, not only GitHub. Keep provider-specific behavior behind explicit checks, and avoid GitHub-only naming for generic review concepts.

## GitHub CLI Usage

Be mindful of the user's `gh` CLI API rate limit — batch requests where possible and avoid unnecessary calls. All code, commands, and scripts must be compatible with macOS, Linux, and Windows.
