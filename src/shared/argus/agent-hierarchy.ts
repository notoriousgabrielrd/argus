/**
 * Argus agent hierarchy — which agents report to which, per project.
 *
 * Upstream models agents as a flat roster: every CLI agent is peer to every other.
 * Argus adds an org chart on top, imported from the cockpit's `hierarchy.json`, so a
 * project can express that CEO delegates to BOSS/ENGINEER/AUDITOR and the UI can seat,
 * group, and route work by that structure.
 *
 * The chart is display/routing metadata only: it never owns an agent's lifecycle, which
 * stays with the runtime that spawned the PTY. `USER_NODE` is the human at the root.
 */

/** The human operator — root of every chart, never a spawnable agent. */
export const USER_NODE = 'VOCÊ'

/** Adjacency list: manager name -> the agents reporting directly to it. */
export type AgentHierarchy = Record<string, readonly string[]>

/** Per-project charts, keyed by the project id the runtime resolves from a worktree. */
export type AgentHierarchyByProject = Record<string, AgentHierarchy>

export type AgentHierarchyNode = {
  name: string
  /** null for the root; the chart is a tree, so an agent has at most one manager. */
  reportsTo: string | null
  directReports: readonly string[]
  /** 0 for the root, 1 for its direct reports, and so on. */
  depth: number
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse an untrusted hierarchy document (the cockpit's `hierarchy.json` shape).
 * Malformed projects are dropped rather than throwing: a hand-edited chart must never
 * keep the workspace from opening.
 */
export function parseAgentHierarchyByProject(value: unknown): AgentHierarchyByProject {
  if (!isPlainRecord(value)) {
    return {}
  }
  const parsed: AgentHierarchyByProject = {}
  for (const [projectId, chart] of Object.entries(value)) {
    if (!isPlainRecord(chart)) {
      continue
    }
    const entries: AgentHierarchy = {}
    for (const [manager, reports] of Object.entries(chart)) {
      if (!Array.isArray(reports)) {
        continue
      }
      const names = reports.filter((name): name is string => typeof name === 'string' && !!name)
      if (names.length > 0) {
        entries[manager] = names
      }
    }
    if (Object.keys(entries).length > 0) {
      parsed[projectId] = entries
    }
  }
  return parsed
}

/** The manager of `agent`, or null when it is a root or absent from the chart. */
export function getManagerOf(hierarchy: AgentHierarchy, agent: string): string | null {
  for (const [manager, reports] of Object.entries(hierarchy)) {
    if (reports.includes(agent)) {
      return manager
    }
  }
  return null
}

/** Agents with no manager — normally just `USER_NODE`. */
export function getHierarchyRoots(hierarchy: AgentHierarchy): string[] {
  return Object.keys(hierarchy).filter((manager) => getManagerOf(hierarchy, manager) === null)
}

/**
 * Flatten the chart into one node per agent, depth-first from the roots.
 *
 * Why the visited set: a hand-edited chart can contain a cycle (A manages B manages A),
 * which would otherwise recurse forever. Cyclic branches stop at the repeat instead.
 */
export function flattenHierarchy(hierarchy: AgentHierarchy): AgentHierarchyNode[] {
  const nodes: AgentHierarchyNode[] = []
  const visited = new Set<string>()

  const walk = (name: string, reportsTo: string | null, depth: number): void => {
    if (visited.has(name)) {
      return
    }
    visited.add(name)
    const directReports = hierarchy[name] ?? []
    nodes.push({ name, reportsTo, directReports, depth })
    for (const report of directReports) {
      walk(report, name, depth + 1)
    }
  }

  for (const root of getHierarchyRoots(hierarchy)) {
    walk(root, null, 0)
  }
  // Why: an agent listed only as someone's report of an unreachable manager (or in a
  // cycle) still belongs in the roster — surface it rather than silently dropping it.
  for (const manager of Object.keys(hierarchy)) {
    walk(manager, getManagerOf(hierarchy, manager), 0)
  }
  return nodes
}

/** Every agent named anywhere in the chart, excluding the human root. */
export function listHierarchyAgents(hierarchy: AgentHierarchy): string[] {
  const names = new Set<string>()
  for (const [manager, reports] of Object.entries(hierarchy)) {
    if (manager !== USER_NODE) {
      names.add(manager)
    }
    for (const report of reports) {
      if (report !== USER_NODE) {
        names.add(report)
      }
    }
  }
  return [...names].sort()
}
