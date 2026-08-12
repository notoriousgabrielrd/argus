/**
 * Argus agent roster — the per-project cast of named agents, their role, and the tools
 * each one is allowed to use.
 *
 * These agents are Claude Code subagents defined by `<project>/.claude/agents/*.md`, so
 * the definitions themselves stay in the project the agent works on: Argus reads them,
 * it does not own them. What lives here is the metadata Argus needs to seat an agent in
 * the hierarchy and show what it can do before any session exists — the roster the
 * cockpit kept in `projects.json` + `hierarchy.json`, now first-class.
 */

/** Tool names as Claude Code spells them in an agent's `tools:` frontmatter. */
export type AgentToolName = string

export type ArgusAgentDefinition = {
  /** Uppercase agent name, matching the `name:` frontmatter and the hierarchy chart. */
  name: string
  /** One line on what the agent is for — the roster subtitle. */
  role: string
  /**
   * Tools from the agent's frontmatter, in declaration order. An empty list means the
   * definition omitted `tools:`, which Claude Code reads as "inherit every tool".
   */
  tools: readonly AgentToolName[]
  /** True when the agent must not modify the code it inspects. */
  readOnly?: boolean
}

export type ArgusProjectAgents = {
  projectId: string
  label: string
  agents: readonly ArgusAgentDefinition[]
}

/**
 * Write tools, in the sense that matters for the roster: an agent holding any of these
 * can change the working tree. `Write` alone does not disqualify a read-only auditor —
 * AUDITOR writes only its report under `reports/` — so `readOnly` is declared per agent
 * rather than derived, and this list exists to explain that distinction, not override it.
 */
export const MUTATING_TOOLS: readonly AgentToolName[] = ['Edit', 'NotebookEdit']

export function canMutateCode(agent: ArgusAgentDefinition): boolean {
  if (agent.readOnly) {
    return false
  }
  if (agent.tools.length === 0) {
    return true
  }
  return agent.tools.some((tool) => MUTATING_TOOLS.includes(tool))
}

export function findAgent(
  project: ArgusProjectAgents,
  name: string
): ArgusAgentDefinition | undefined {
  return project.agents.find((agent) => agent.name === name)
}
