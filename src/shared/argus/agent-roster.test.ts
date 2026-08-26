import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canMutateCode, findAgent, MUTATING_TOOLS, type ArgusProjectAgents } from './agent-roster'
import { listHierarchyAgents, parseAgentHierarchyByProject } from './agent-hierarchy'

type ImportedRoster = ArgusProjectAgents & { hierarchy: Record<string, string[]> }

function readRoster(file: string): ImportedRoster {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'resources/argus', file), 'utf8')
  ) as ImportedRoster
}

// Argus used to ship one roster per known project, picked by directory name — which handed a
// stranger's chart to anyone whose repo shared the name. One generic chart replaced them, and
// it is the only one these invariants can be asserted against.
const shipped = readRoster('default-chart.json')

describe('shipped default chart', () => {
  it('carries every agent named in the hierarchy, and no orphans', () => {
    const projectId = shipped.projectId ?? 'default'
    const charts = parseAgentHierarchyByProject({ [projectId]: shipped.hierarchy })
    const charted = listHierarchyAgents(charts[projectId]!)
    const rostered = shipped.agents.map((agent) => agent.name).sort()
    expect(rostered).toEqual(charted)
  })

  it('keeps its AUDITOR read-only over code', () => {
    const auditor = findAgent(shipped, 'AUDITOR')
    expect(auditor).toBeDefined()
    expect(canMutateCode(auditor!)).toBe(false)
    expect(auditor!.tools).not.toContain('Edit')
  })

  it('describes every agent with a role line', () => {
    for (const agent of shipped.agents) {
      expect(agent.role.length, agent.name).toBeGreaterThan(0)
    }
  })

  it("names no specific project, so nobody inherits someone else's org chart", () => {
    expect(shipped.projectId).toBeUndefined()
  })
})

describe('shipped chart, AUDITOR detail', () => {
  it('keeps AUDITOR read-only over code while still able to write its report', () => {
    const auditor = findAgent(shipped, 'AUDITOR')
    expect(auditor).toBeDefined()
    // Why assert the exact list: these mirror the agent's `tools:` frontmatter, and a
    // silent drift here would grant or revoke a capability the .md never changed.
    expect(auditor!.tools).toEqual(['Read', 'Grep', 'Glob', 'Bash', 'Write'])
    // Write is present (the report under reports/auditoria/) but no Edit — the auditor
    // proves rules, it never fixes the code it judges.
    expect(auditor!.tools).toContain('Write')
    expect(auditor!.tools).not.toContain('Edit')
    expect(canMutateCode(auditor!)).toBe(false)
  })

  it('marks the implementers as able to change code', () => {
    for (const name of ['BOSS', 'ENGINEER', 'HUNTER', 'DESIGNER']) {
      const agent = findAgent(shipped, name)
      expect(agent, name).toBeDefined()
      expect(canMutateCode(agent!), name).toBe(true)
      expect(agent!.tools, name).toEqual(expect.arrayContaining(['Edit']))
    }
  })

  it('keeps the non-implementers off the mutating tools', () => {
    for (const name of ['CEO', 'AUDITOR']) {
      const agent = findAgent(shipped, name)
      expect(agent, name).toBeDefined()
      expect(canMutateCode(agent!), name).toBe(false)
      for (const tool of MUTATING_TOOLS) {
        expect(agent!.tools, name).not.toContain(tool)
      }
    }
  })

  it('gives CEO the shell it needs to drive seats, and no subagent tool', () => {
    const ceo = findAgent(shipped, 'CEO')
    // Bash is what lets the CEO run `argus terminal send`. Without it the only delegation
    // path left is the Agent tool, which runs a subagent inside the caller's own session —
    // the caller pays for its context and cannot see it run.
    expect(ceo!.tools).toContain('Bash')
    expect(ceo!.tools).not.toContain('Agent')
  })
})

describe('canMutateCode', () => {
  it('treats an omitted tools list as inheriting everything', () => {
    expect(canMutateCode({ name: 'X', role: 'r', tools: [] })).toBe(true)
  })

  it('lets an explicit readOnly flag override an otherwise mutating tool list', () => {
    expect(canMutateCode({ name: 'X', role: 'r', tools: ['Edit'], readOnly: true })).toBe(false)
  })
})
