/**
 * Merges the two halves of a project's agent cast into one seat list.
 *
 *   - `.claude/agents/*.md` says **who can be seated**. It is the source of truth and lives
 *     in the project repo, so a seat Argus refuses to assign is always fixed by an edit there.
 *   - the roster + hierarchy (`argus.agents.json`, or a bundled chart) says **how the cast is
 *     organized**: each agent's role line and who it reports to. The `.md` files do not
 *     express that, which is why the chart exists at all.
 *
 * The chart is display and routing metadata: it can name an agent the workspace does not
 * define, and such a name is reported separately rather than listed as a seat — listing it
 * would offer a seat `assignSeat` then refuses.
 */

import { flattenHierarchy, USER_NODE, type AgentHierarchy } from './agent-hierarchy'
import { canMutateCode, type ArgusAgentDefinition } from './agent-roster'
import type { TerminalSeatName } from './terminal-seat'

/** The half of a project-agent `.md` definition this merge needs. */
export type SeatDefinitionInput = {
  seat: TerminalSeatName
  description: string
  tools: readonly string[]
}

export type SeatRosterEntry = {
  seat: TerminalSeatName
  /** From the `.md` frontmatter. */
  description: string
  /** From the `.md` frontmatter; empty means "inherit every tool". */
  tools: readonly string[]
  /** Role line from the roster, empty when no roster covers this agent. */
  role: string
  /** True when the agent must not modify the code it inspects. */
  readOnly: boolean
  /** Manager in the chart. Null for a top-level agent — the human root is not a manager. */
  reportsTo: string | null
  /** Names the chart lists under this agent, including any the workspace does not define. */
  directReports: readonly string[]
  /** Indentation level among *listed* seats: 0 at the top, 1 under a listed manager. */
  depth: number
}

export type SeatRoster = {
  entries: SeatRosterEntry[]
  /** Chart names with no `.md` definition — visible, but not seatable. */
  chartOnly: string[]
}

function toEntry(
  definition: SeatDefinitionInput,
  rosterAgent: ArgusAgentDefinition | undefined,
  chart: Pick<SeatRosterEntry, 'reportsTo' | 'directReports' | 'depth'>
): SeatRosterEntry {
  return {
    seat: definition.seat,
    description: definition.description,
    tools: definition.tools,
    role: rosterAgent?.role ?? '',
    // Why fall back to the `.md` tools: without a roster entry the frontmatter is all we
    // know, and it carries the same signal the roster's `readOnly` was derived from.
    readOnly: !canMutateCode(
      rosterAgent ?? { name: definition.seat, role: '', tools: definition.tools }
    ),
    ...chart
  }
}

export function mergeSeatRoster(
  defined: readonly SeatDefinitionInput[],
  roster: { agents: readonly ArgusAgentDefinition[]; hierarchy: AgentHierarchy } | null
): SeatRoster {
  const definedBySeat = new Map(defined.map((definition) => [definition.seat, definition]))
  const rosterByName = new Map((roster?.agents ?? []).map((agent) => [agent.name, agent]))
  const entries: SeatRosterEntry[] = []
  const chartOnly: string[] = []
  const charted = new Set<string>()
  // Why depth is counted over listed seats only: a report whose manager has no `.md` is
  // indented under a row that is not there. It reads as top-level, which is what it is here.
  const depthBySeat = new Map<string, number>()
  for (const node of flattenHierarchy(roster?.hierarchy ?? {})) {
    if (node.name === USER_NODE || charted.has(node.name)) {
      continue
    }
    charted.add(node.name)
    const definition = definedBySeat.get(node.name)
    if (!definition) {
      chartOnly.push(node.name)
      continue
    }
    const managerDepth = node.reportsTo === null ? undefined : depthBySeat.get(node.reportsTo)
    depthBySeat.set(node.name, managerDepth === undefined ? 0 : managerDepth + 1)
    entries.push(
      toEntry(definition, rosterByName.get(node.name), {
        reportsTo: node.reportsTo === USER_NODE ? null : node.reportsTo,
        directReports: node.directReports,
        depth: depthBySeat.get(node.name) ?? 0
      })
    )
  }

  // Why keep the caller's order rather than sorting: uncharted seats arrive in the order
  // the workspace's `.md` files were read, which is what the list showed before any chart.
  for (const definition of defined) {
    if (charted.has(definition.seat)) {
      continue
    }
    entries.push(
      toEntry(definition, rosterByName.get(definition.seat), {
        reportsTo: null,
        directReports: [],
        depth: 0
      })
    )
  }
  return { entries, chartOnly }
}
