import { describe, expect, it } from 'vitest'
import { mergeSeatRoster, type SeatDefinitionInput } from './seat-roster'

const DEFINED: SeatDefinitionInput[] = [
  { seat: 'AUDITOR', description: 'audits', tools: ['Read', 'Grep'] },
  { seat: 'BOSS', description: 'infra', tools: ['Read', 'Edit'] },
  { seat: 'DESIGNER', description: 'ui', tools: [] }
]

const ROSTER = {
  agents: [
    { name: 'BOSS', role: 'Infra mentor', tools: ['Read', 'Edit'] },
    { name: 'DESIGNER', role: 'Design system', tools: ['Read', 'Edit'] },
    { name: 'AUDITOR', role: 'Business rules', tools: ['Read'], readOnly: true }
  ],
  hierarchy: { VOCÊ: ['BOSS', 'AUDITOR'], BOSS: ['DESIGNER'] }
}

describe('mergeSeatRoster', () => {
  it('orders seats by the chart and depths them from the top-most agent', () => {
    const { entries } = mergeSeatRoster(DEFINED, ROSTER)

    expect(entries.map((entry) => [entry.seat, entry.depth])).toEqual([
      ['BOSS', 0],
      ['DESIGNER', 1],
      ['AUDITOR', 0]
    ])
  })

  it('treats the human root as no manager at all', () => {
    const { entries } = mergeSeatRoster(DEFINED, ROSTER)

    expect(entries.find((entry) => entry.seat === 'BOSS')?.reportsTo).toBeNull()
    expect(entries.find((entry) => entry.seat === 'DESIGNER')?.reportsTo).toBe('BOSS')
    expect(entries.find((entry) => entry.seat === 'BOSS')?.directReports).toEqual(['DESIGNER'])
  })

  it('carries the roster role and read-only flag onto the seat', () => {
    const { entries } = mergeSeatRoster(DEFINED, ROSTER)
    const auditor = entries.find((entry) => entry.seat === 'AUDITOR')

    expect(auditor?.role).toBe('Business rules')
    expect(auditor?.readOnly).toBe(true)
    expect(entries.find((entry) => entry.seat === 'BOSS')?.readOnly).toBe(false)
  })

  it('reports a charted agent the workspace does not define instead of offering it as a seat', () => {
    const { entries, chartOnly } = mergeSeatRoster(
      DEFINED.filter((definition) => definition.seat !== 'DESIGNER'),
      ROSTER
    )

    expect(chartOnly).toEqual(['DESIGNER'])
    expect(entries.map((entry) => entry.seat)).toEqual(['BOSS', 'AUDITOR'])
  })

  it('keeps a seat the chart omits, in the order the workspace defined it', () => {
    const { entries } = mergeSeatRoster(
      [...DEFINED, { seat: 'HUNTER', description: 'h', tools: [] }],
      ROSTER
    )

    expect(entries.at(-1)).toMatchObject({ seat: 'HUNTER', depth: 0, reportsTo: null, role: '' })
  })

  it('derives read-only from the .md tools when no roster covers the agent', () => {
    const { entries } = mergeSeatRoster(DEFINED, null)

    expect(entries.map((entry) => entry.seat)).toEqual(['AUDITOR', 'BOSS', 'DESIGNER'])
    // AUDITOR holds no write tool; DESIGNER inherits every tool.
    expect(entries.map((entry) => entry.readOnly)).toEqual([true, false, false])
  })

  it('renders a report of a missing manager at the top level rather than dropping it', () => {
    const { entries, chartOnly } = mergeSeatRoster(
      [{ seat: 'DESIGNER', description: 'ui', tools: [] }],
      ROSTER
    )

    expect(chartOnly).toEqual(['BOSS', 'AUDITOR'])
    expect(entries).toMatchObject([{ seat: 'DESIGNER', depth: 0, reportsTo: 'BOSS' }])
  })
})
