import { describe, expect, it } from 'vitest'
import {
  flattenHierarchy,
  getHierarchyRoots,
  getManagerOf,
  listHierarchyAgents,
  parseAgentHierarchyByProject,
  USER_NODE,
  type AgentHierarchy
} from './agent-hierarchy'

// The chart imported from the cockpit, used as the fixture so a regression here shows up
// as the real AgendaPower structure breaking rather than an abstract A/B/C tree.
const AGENDA_POWER: AgentHierarchy = {
  [USER_NODE]: ['CEO', 'MAESTRO'],
  CEO: ['BOSS', 'ENGINEER', 'HUNTER', 'MINER', 'DIARIO', 'AUDITOR']
}

describe('parseAgentHierarchyByProject', () => {
  it('parses the cockpit hierarchy.json shape', () => {
    const parsed = parseAgentHierarchyByProject({
      agendapower: { [USER_NODE]: ['CEO', 'MAESTRO'], CEO: ['BOSS', 'AUDITOR'] },
      confetti: { [USER_NODE]: ['BOSS'], BOSS: ['DESIGNER'] }
    })
    expect(parsed.agendapower?.CEO).toEqual(['BOSS', 'AUDITOR'])
    expect(parsed.confetti?.BOSS).toEqual(['DESIGNER'])
  })

  it('drops malformed projects and entries instead of throwing', () => {
    const parsed = parseAgentHierarchyByProject({
      good: { [USER_NODE]: ['CEO'] },
      notAnObject: 'nope',
      emptyAfterFiltering: { CEO: 'not-an-array' },
      partial: { [USER_NODE]: ['CEO', 42, ''], CEO: [] }
    })
    expect(Object.keys(parsed).sort()).toEqual(['good', 'partial'])
    expect(parsed.partial?.[USER_NODE]).toEqual(['CEO'])
    expect(parsed.partial?.CEO).toBeUndefined()
  })

  it('returns an empty chart for non-object input', () => {
    expect(parseAgentHierarchyByProject(null)).toEqual({})
    expect(parseAgentHierarchyByProject(['CEO'])).toEqual({})
  })
})

describe('hierarchy queries', () => {
  it('resolves the manager of an agent and reports none for the root', () => {
    expect(getManagerOf(AGENDA_POWER, 'AUDITOR')).toBe('CEO')
    expect(getManagerOf(AGENDA_POWER, 'CEO')).toBe(USER_NODE)
    expect(getManagerOf(AGENDA_POWER, USER_NODE)).toBeNull()
    expect(getManagerOf(AGENDA_POWER, 'UNKNOWN')).toBeNull()
  })

  it('finds the human operator as the only root', () => {
    expect(getHierarchyRoots(AGENDA_POWER)).toEqual([USER_NODE])
  })

  it('lists every agent except the human root', () => {
    expect(listHierarchyAgents(AGENDA_POWER)).toEqual([
      'AUDITOR',
      'BOSS',
      'CEO',
      'DIARIO',
      'ENGINEER',
      'HUNTER',
      'MAESTRO',
      'MINER'
    ])
  })
})

describe('flattenHierarchy', () => {
  it('walks depth-first from the root with the reporting line and depth', () => {
    const nodes = flattenHierarchy(AGENDA_POWER)
    expect(nodes[0]).toMatchObject({ name: USER_NODE, reportsTo: null, depth: 0 })
    expect(nodes.find((n) => n.name === 'CEO')).toMatchObject({ reportsTo: USER_NODE, depth: 1 })
    expect(nodes.find((n) => n.name === 'AUDITOR')).toMatchObject({ reportsTo: 'CEO', depth: 2 })
    // MAESTRO reports to the human directly, so it stays a peer of CEO.
    expect(nodes.find((n) => n.name === 'MAESTRO')).toMatchObject({
      reportsTo: USER_NODE,
      depth: 1
    })
  })

  it('emits each agent once', () => {
    const names = flattenHierarchy(AGENDA_POWER).map((node) => node.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('terminates on a hand-edited cycle', () => {
    const cyclic: AgentHierarchy = { A: ['B'], B: ['A'] }
    const names = flattenHierarchy(cyclic).map((node) => node.name)
    expect(names).toEqual(['A', 'B'])
  })
})
