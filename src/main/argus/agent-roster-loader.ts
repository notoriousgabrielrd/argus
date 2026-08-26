import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseAgentHierarchyByProject,
  type AgentHierarchy
} from '../../shared/argus/agent-hierarchy'
import type { ArgusAgentDefinition, ArgusProjectAgents } from '../../shared/argus/agent-roster'

/**
 * Loads a project's Argus agent roster.
 *
 * Resolution order, first hit wins:
 *   1. `<workspace>/argus.agents.json` — the project owns its own chart.
 *   2. `resources/argus/default-chart.json` — the chart shipped with Argus.
 *
 * Argus used to ship one roster per known project and pick by directory name, which handed a
 * stranger's chart to anyone whose repo happened to share the name. The bundled layer is now a
 * single generic chart; a project that wants its own says so in its own file.
 *
 * Missing or malformed files resolve to null instead of throwing: the roster is display
 * metadata, and a bad chart must never keep a workspace from opening.
 */

export const PROJECT_ROSTER_FILENAME = 'argus.agents.json'
export const DEFAULT_CHART_FILENAME = 'default-chart.json'

export type LoadedArgusRoster = ArgusProjectAgents & {
  hierarchy: AgentHierarchy
  /** Where the chart came from, so callers can say which file to edit. */
  source: 'project' | 'bundled'
  /** Seats the project turned off, from `seats.disabled`. Uppercased. */
  disabledSeats: readonly string[]
}

/**
 * Directory holding the rosters shipped with Argus.
 *
 * One branch for packaged and checkout builds: `resources/**` is asar-unpacked rather than
 * copied to `resourcesPath`, and the main process reads through the app path either way.
 */
export function resolveBundledRosterDir(appPath: string): string {
  return join(appPath, 'resources', 'argus')
}

function parseAgents(value: unknown): ArgusAgentDefinition[] {
  if (!Array.isArray(value)) {
    return []
  }
  const agents: ArgusAgentDefinition[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.name !== 'string' || !candidate.name) {
      continue
    }
    agents.push({
      name: candidate.name,
      role: typeof candidate.role === 'string' ? candidate.role : '',
      tools: Array.isArray(candidate.tools)
        ? candidate.tools.filter((tool): tool is string => typeof tool === 'string')
        : [],
      ...(candidate.readOnly === true ? { readOnly: true } : {})
    })
  }
  return agents
}

export function parseArgusRoster(
  raw: string,
  fallbackProjectId: string,
  source: LoadedArgusRoster['source'] = 'project'
): LoadedArgusRoster | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }
  const doc = parsed as Record<string, unknown>
  const agents = parseAgents(doc.agents)
  if (agents.length === 0) {
    return null
  }
  const projectId =
    typeof doc.projectId === 'string' && doc.projectId ? doc.projectId : fallbackProjectId
  const charts = parseAgentHierarchyByProject({ [projectId]: doc.hierarchy })
  return {
    projectId,
    label: typeof doc.label === 'string' && doc.label ? doc.label : projectId,
    agents,
    hierarchy: charts[projectId] ?? {},
    source,
    disabledSeats: parseDisabledSeats(doc.seats)
  }
}

/**
 * `seats.disabled` is how a project opts out of a baseline role it does not want. Opting out
 * has to be expressible in a file the project owns, because the role it is refusing lives in
 * a directory the project cannot edit.
 */
function parseDisabledSeats(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return []
  }
  const disabled = (value as Record<string, unknown>).disabled
  if (!Array.isArray(disabled)) {
    return []
  }
  return disabled
    .filter((seat): seat is string => typeof seat === 'string')
    .map((seat) => seat.trim().toUpperCase())
    .filter((seat) => seat.length > 0)
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * @param projectId Identity to stamp on a project-owned roster that omits `projectId`, and on
 * the bundled default chart, which is generic and carries none.
 */
export async function loadArgusRoster(options: {
  projectId: string
  workspacePath: string
  bundledRosterDir: string
}): Promise<LoadedArgusRoster | null> {
  const projectOwned = await readIfPresent(join(options.workspacePath, PROJECT_ROSTER_FILENAME))
  if (projectOwned) {
    const parsed = parseArgusRoster(projectOwned, options.projectId, 'project')
    if (parsed) {
      return parsed
    }
  }
  const bundled = await readIfPresent(join(options.bundledRosterDir, DEFAULT_CHART_FILENAME))
  return bundled ? parseArgusRoster(bundled, options.projectId, 'bundled') : null
}
