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

const imported = readRoster('agenda-power-agents.json')
const confetti = readRoster('confetti-agents.json')

describe.each([
  ['AgendaPower', imported],
  ['Confetti', confetti]
])('imported %s roster', (_label, roster) => {
  it('carries every agent named in the hierarchy, and no orphans', () => {
    const charts = parseAgentHierarchyByProject({ [roster.projectId]: roster.hierarchy })
    const charted = listHierarchyAgents(charts[roster.projectId]!)
    const rostered = roster.agents.map((agent) => agent.name).sort()
    expect(rostered).toEqual(charted)
  })

  it('keeps its AUDITOR read-only over code', () => {
    const auditor = findAgent(roster, 'AUDITOR')
    expect(auditor).toBeDefined()
    expect(canMutateCode(auditor!)).toBe(false)
    expect(auditor!.tools).not.toContain('Edit')
  })

  it('describes every agent with a role line', () => {
    for (const agent of roster.agents) {
      expect(agent.role.length, agent.name).toBeGreaterThan(0)
    }
  })
})

describe('imported AgendaPower roster', () => {
  it('keeps AUDITOR read-only over code while still able to write its report', () => {
    const auditor = findAgent(imported, 'AUDITOR')
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
    for (const name of ['BOSS', 'ENGINEER', 'HUNTER', 'MINER', 'DIARIO']) {
      const agent = findAgent(imported, name)
      expect(agent, name).toBeDefined()
      expect(canMutateCode(agent!), name).toBe(true)
      expect(agent!.tools, name).toEqual(expect.arrayContaining(['Edit']))
    }
  })

  it('keeps the non-implementers off the mutating tools', () => {
    for (const name of ['CEO', 'MAESTRO', 'AUDITOR']) {
      const agent = findAgent(imported, name)
      expect(agent, name).toBeDefined()
      expect(canMutateCode(agent!), name).toBe(false)
      for (const tool of MUTATING_TOOLS) {
        expect(agent!.tools, name).not.toContain(tool)
      }
    }
  })

  it('gives CEO the delegation tools that make it a manager', () => {
    const ceo = findAgent(imported, 'CEO')
    expect(ceo!.tools).toEqual(expect.arrayContaining(['Agent', 'SendMessage', 'TaskList']))
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
