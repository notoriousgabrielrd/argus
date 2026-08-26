import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeSeatName, type TerminalSeatName } from '../../shared/argus/terminal-seat'

/**
 * Reads the project agents a workspace defines in `<workspace>/.claude/agents/*.md`.
 *
 * These `.md` files are the source of truth and stay in the project repo — Argus reads
 * them, it does not own them. That is why seat validation resolves here rather than
 * against the rosters bundled in `resources/argus/`, which cover only the two projects
 * imported from the cockpit and would leave every other workspace unable to seat anyone.
 * The bundled rosters remain the source for the *hierarchy*, which the `.md` files do not
 * express.
 */

export const PROJECT_AGENTS_DIR = join('.claude', 'agents')

export type ProjectAgentDefinition = {
  seat: TerminalSeatName
  /** The `description:` frontmatter line, trimmed to one line for display. */
  description: string
  /** `tools:` frontmatter, in declaration order. Empty means "inherit every tool". */
  tools: readonly string[]
  /** Absolute path of the defining `.md`, so callers can point a user at it. */
  path: string
}

// Frontmatter is a leading `---` block; we read only the scalar keys we need rather than
// pulling in a YAML parser for what Claude Code writes as flat `key: value` lines.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/

function readFrontmatterField(frontmatter: string, field: string): string | null {
  for (const line of frontmatter.split(/\r?\n/)) {
    // Why: `description:` values routinely contain `:` themselves, so split once.
    const separator = line.indexOf(':')
    if (separator === -1) {
      continue
    }
    if (line.slice(0, separator).trim() !== field) {
      continue
    }
    return line.slice(separator + 1).trim()
  }
  return null
}

export function parseProjectAgentDefinition(
  raw: string,
  path: string
): ProjectAgentDefinition | null {
  const block = FRONTMATTER.exec(raw)
  if (!block) {
    return null
  }
  const frontmatter = block[1]
  const name = readFrontmatterField(frontmatter, 'name')
  if (!name) {
    return null
  }
  let seat: TerminalSeatName
  try {
    // Why: the filename case varies across projects (auditor.md vs AUDITOR.md), so the
    // frontmatter name is authoritative. A name Argus cannot address as a seat is skipped
    // rather than thrown — one odd definition must not hide every sibling agent.
    seat = normalizeSeatName(name)
  } catch {
    return null
  }
  const tools = readFrontmatterField(frontmatter, 'tools')
  return {
    seat,
    description: readFrontmatterField(frontmatter, 'description') ?? '',
    tools: tools
      ? tools
          .split(',')
          .map((tool) => tool.trim())
          .filter((tool) => tool.length > 0)
      : [],
    path
  }
}

async function directoryRevision(dir: string): Promise<string | null> {
  try {
    const info = await stat(dir)
    return `${info.mtimeMs}:${info.size}`
  } catch {
    return null
  }
}

type CacheEntry = { revision: string; definitions: readonly ProjectAgentDefinition[] }
const cacheByDir = new Map<string, CacheEntry>()

/**
 * Lists the project agents a workspace defines, newest directory state wins.
 *
 * Resolves to an empty list when the workspace has no `.claude/agents/` — a workspace
 * without project agents is normal, not an error, and must not fail seat commands with
 * anything less legible than "this workspace defines no project agents".
 */
export async function listProjectAgents(
  workspacePath: string
): Promise<readonly ProjectAgentDefinition[]> {
  return await listAgentDefinitionsIn(join(workspacePath, PROJECT_AGENTS_DIR))
}

/**
 * Reads one directory of agent `.md` files. Split out from {@link listProjectAgents} so the
 * layered resolver can read Argus-owned and bundled directories through the same parser and
 * the same revision cache — the file format does not change with where the file lives.
 */
export async function listAgentDefinitionsIn(
  dir: string
): Promise<readonly ProjectAgentDefinition[]> {
  const revision = await directoryRevision(dir)
  if (revision === null) {
    cacheByDir.delete(dir)
    return []
  }
  const cached = cacheByDir.get(dir)
  if (cached?.revision === revision) {
    return cached.definitions
  }
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }
  const definitions: ProjectAgentDefinition[] = []
  const seen = new Set<TerminalSeatName>()
  for (const entry of entries.sort()) {
    if (!entry.toLowerCase().endsWith('.md')) {
      continue
    }
    const path = join(dir, entry)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch {
      continue
    }
    const parsed = parseProjectAgentDefinition(raw, path)
    // Why: two files can declare the same `name:`; first by sorted filename wins so the
    // seat list stays stable across runs instead of depending on readdir order.
    if (!parsed || seen.has(parsed.seat)) {
      continue
    }
    seen.add(parsed.seat)
    definitions.push(parsed)
  }
  cacheByDir.set(dir, { revision, definitions })
  return definitions
}

export function clearProjectAgentCache(): void {
  cacheByDir.clear()
}
