export type OrchestrationCliCommand = 'argus' | 'orca'

/**
 * The CLI command name an orchestration terminal should type.
 *
 * Upstream branched here between `orca` and `orca-ide`: packaged Linux had to install as
 * `orca-ide` because GNOME's Orca screen reader owns `/usr/bin/orca`. Argus has no such
 * collision, so every platform — local, WSL, and SSH remote — ships the same `argus`
 * command and the branching collapsed.
 *
 * `'orca'` stays in the type because it is a wire value: an older peer can still send it
 * over RPC, and callers must keep accepting it.
 */
export function resolveTerminalOrchestrationCliCommand(): OrchestrationCliCommand {
  return 'argus'
}
