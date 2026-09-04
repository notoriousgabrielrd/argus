# tmux session isolation

A tmux session has exactly one current window, shared by every client attached to it. So when two
Argus panes both run `tmux attach -t project`, they do not get a pane each — they get the same
window twice, mirroring keystroke for keystroke, and either pane switching windows drags the other
along. Users hit this through shell wrappers that open one tmux window per terminal and then attach
to a shared per-project session; the panes look like duplicated sessions of the same project.

Argus prevents it with a `tmux` PATH shim, generated per host into
`<userData>/orca-tmux-session-isolation/tmux` by `src/main/tmux/tmux-session-isolation.ts` and
installed by `buildPtyHostEnv`, so local, daemon, and SSH panes all get it.

## What the shim does

On an attaching invocation it puts the pane on its own **grouped session**
(`tmux new-session -d -s "<base>@orca-<id>" -t "=<base>"`) and attaches there instead. A grouped
session shares the base session's window list — the same windows, the same processes, one server —
but keeps its own current window. That is precisely one pane's worth of view.

The view is named after the pane's `ORCA_PANE_KEY`, so a pane that is closed and reopened returns
to the window it left. `destroy-unattached` is armed once a client lands on the view, which collects
it when the pane dies without detaching; a clean detach kills it directly. Killing a view never
kills a window: the base session still holds them.

Attach shows exactly what unpatched tmux would have shown — the base session's current window.
Isolation only changes what happens _after_ the attach.

## What it deliberately leaves alone

The shim `exec`s the real tmux untouched when any of these hold:

- the caller is not an Argus pane (`ORCA_PANE_KEY` unset), or is already inside tmux;
- `ORCA_AGENT_TEAMS_SHIM_DIR` is set — that tmux is Argus's own pane emulator, not a tmux server;
- `ORCA_TMUX_SESSION_ISOLATION=off`;
- the subcommand is anything but `attach-session` (or `new-session -A` onto a session that exists);
- `-d`, `-D` or `-X` was passed, which all say "this client takes the session over";
- the target session is already a view (name contains `@orca-`), so views never nest.

`ORCA_REAL_TMUX` holds the resolved real binary. The shim dir is spliced into PATH immediately
ahead of that binary rather than at the front, so every other PATH precedence — the bundled Argus
CLI first among them — is unchanged.

## Known gaps

- **Native Windows and WSL panes.** Windows has no tmux; a WSL pane's PATH cannot use the Windows
  shim directory.
- **Session-scoped tmux options.** Grouped sessions inherit the global option table, not the base
  session's own `set -t` options. Options set globally in `.tmux.conf` behave normally.
- **`new-session -A` racing itself.** Two panes creating the same named session at the same instant
  can both land on it directly; the next attach isolates them.
