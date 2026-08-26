import { createHash } from 'node:crypto'
import { join, sep } from 'node:path'
import { listAgentDefinitionsIn, PROJECT_AGENTS_DIR } from './project-agent-definitions'
import type { ProjectAgentDefinition } from './project-agent-definitions'
import type { TerminalSeatName } from '../../shared/argus/terminal-seat'

/**
 * Resolves which agents a workspace can seat, across the three places a definition can live.
 *
 * Argus used to read only `<workspace>/.claude/agents/*.md`, which meant a freshly imported
 * project had no seats at all until its owner wrote six markdown files. The baseline now
 * ships with Argus, and a project can specialize a role without that specialization ever
 * touching the repo — which also keeps a seat definition from registering as a Claude Code
 * subagent type, the way a file under `.claude/agents/` does.
 *
 * Precedence is **per seat**, not per layer: a project that defines only ENGINEER keeps its
 * own ENGINEER and still gets the other five. Suppress one with `seats.disabled` in
 * `argus.agents.json` rather than by deleting a file you do not own.
 */

export type SeatDefinitionSource = 'project' | 'argus' | 'bundled'

export type ResolvedSeatDefinition = ProjectAgentDefinition & {
  /** Which layer supplied this definition, so callers can name the file to edit. */
  source: SeatDefinitionSource
}

export const ARGUS_AGENT_STORE_DIR = join('argus', 'agents')

/**
 * Directory holding the role baseline shipped with Argus.
 *
 * Why the asar swap: a packaged `appPath` ends in `app.asar`, and only Electron's patched fs
 * can read through that archive. This directory's paths are published to seat callers as
 * `definitionPath`, and a seated agent reads its persona with ordinary file tools — so the
 * path has to be the unpacked copy, which `resources/**` is already emitted as.
 */
export function resolveBundledAgentDir(appPath: string): string {
  const unpacked = appPath.endsWith(`${sep}app.asar`)
    ? `${appPath}.unpacked`
    : appPath === 'app.asar'
      ? 'app.asar.unpacked'
      : appPath
  return join(unpacked, 'resources', 'argus', 'agents')
}

/**
 * Where Argus keeps the personas it generated for a repo.
 *
 * Keyed by `repoId` rather than by worktree: every worktree of a repo is the same codebase,
 * so a persona specialized once should not have to be regenerated per branch. Folder
 * workspaces carry a synthetic `folder-workspace:<id>` repoId and key the same way.
 *
 * The id is slugged **and** suffixed with a digest because repo ids contain characters that
 * are illegal in a Windows path (`:` above all) while still needing to stay distinct: two ids
 * that slug to the same string must not share a directory.
 */
export function resolveArgusAgentStoreDir(userDataPath: string, repoId: string): string {
  const slug = repoId
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const digest = createHash('sha256').update(repoId).digest('hex').slice(0, 12)
  return join(userDataPath, ARGUS_AGENT_STORE_DIR, `${slug || 'repo'}-${digest}`)
}

/** Reads one layer, tolerating an absent directory — a missing layer is normal, not an error. */
async function readLayer(
  dir: string | null,
  source: SeatDefinitionSource
): Promise<ResolvedSeatDefinition[]> {
  if (!dir) {
    return []
  }
  const definitions = await listAgentDefinitionsIn(dir)
  return definitions.map((definition) => ({ ...definition, source }))
}

export async function resolveSeatDefinitions(options: {
  workspacePath: string
  /** Argus-owned store for this repo; null when the host cannot resolve a user data path. */
  storeDir?: string | null
  /** Baseline shipped with Argus; null in a host that has no app path. */
  bundledDir?: string | null
  /** Seat names the project turned off via `argus.agents.json`. */
  disabled?: readonly string[]
}): Promise<readonly ResolvedSeatDefinition[]> {
  const layers = await Promise.all([
    readLayer(join(options.workspacePath, PROJECT_AGENTS_DIR), 'project'),
    readLayer(options.storeDir ?? null, 'argus'),
    readLayer(options.bundledDir ?? null, 'bundled')
  ])
  const suppressed = new Set(options.disabled?.map((seat) => seat.trim().toUpperCase()) ?? [])
  const bySeat = new Map<TerminalSeatName, ResolvedSeatDefinition>()
  // Layers are visited highest-precedence first, so the first definition of a seat wins and
  // later layers only fill gaps.
  for (const layer of layers) {
    for (const definition of layer) {
      if (bySeat.has(definition.seat) || suppressed.has(definition.seat)) {
        continue
      }
      bySeat.set(definition.seat, definition)
    }
  }
  return [...bySeat.values()]
}
