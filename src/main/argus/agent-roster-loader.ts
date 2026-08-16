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
 *   2. A bundled roster under `resources/argus/` — the ones imported from the cockpit.
 *
 * Missing or malformed files resolve to null instead of throwing: the roster is display
 * metadata, and a bad chart must never keep a workspace from opening.
 */

export const PROJECT_ROSTER_FILENAME = 'argus.agents.json'

export type LoadedArgusRoster = ArgusProjectAgents & {
  hierarchy: AgentHierarchy
  /** Where the chart came from, so callers can say which file to edit. */
  source: 'project' | 'bundled'
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
    source
  }
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * @param projectIds Identities to try against the bundled rosters, best guess first — a
 * workspace has no single canonical project name, so the caller offers what it knows
 * (durable project id, repo directory, repo display name). The first entry also names a
 * project-owned roster that omits `projectId`.
 */
export async function loadArgusRoster(options: {
  projectIds: readonly string[]
  workspacePath: string
  bundledRosterDir: string
}): Promise<LoadedArgusRoster | null> {
  const fallbackId = options.projectIds[0] ?? ''
  const projectOwned = await readIfPresent(join(options.workspacePath, PROJECT_ROSTER_FILENAME))
  if (projectOwned) {
    const parsed = parseArgusRoster(projectOwned, fallbackId, 'project')
    if (parsed) {
      return parsed
    }
  }
  for (const projectId of options.projectIds) {
    // Why kebab-case the id: bundled rosters are checked in as files, and `agendapower`
    // ships as agenda-power-agents.json to stay readable next to its siblings.
    for (const candidate of [`${projectId}-agents.json`, `${kebab(projectId)}-agents.json`]) {
      const bundled = await readIfPresent(join(options.bundledRosterDir, candidate))
      if (bundled) {
        const parsed = parseArgusRoster(bundled, projectId, 'bundled')
        if (parsed) {
          return parsed
        }
      }
    }
  }
  return null
}

function kebab(projectId: string): string {
  return projectId === 'agendapower' ? 'agenda-power' : projectId
}
