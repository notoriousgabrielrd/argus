import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadArgusRoster, parseArgusRoster, PROJECT_ROSTER_FILENAME } from './agent-roster-loader'

const dirs: string[] = []
function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'argus-roster-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const REPO_ROSTER_DIR = new URL('../../../resources/argus/', import.meta.url).pathname

describe('parseArgusRoster', () => {
  it('reads agents and the hierarchy chart', () => {
    const parsed = parseArgusRoster(
      JSON.stringify({
        projectId: 'proj',
        label: 'Proj',
        hierarchy: { VOCÊ: ['LEAD'], LEAD: ['AUDITOR'] },
        agents: [
          { name: 'LEAD', role: 'lead', tools: ['Read', 'Edit'] },
          { name: 'AUDITOR', role: 'audits', tools: ['Read'], readOnly: true }
        ]
      }),
      'fallback'
    )
    expect(parsed?.projectId).toBe('proj')
    expect(parsed?.hierarchy.LEAD).toEqual(['AUDITOR'])
    expect(parsed?.agents.map((a) => a.name)).toEqual(['LEAD', 'AUDITOR'])
    expect(parsed?.agents[1]?.readOnly).toBe(true)
  })

  it('falls back to the caller project id and label when the document omits them', () => {
    const parsed = parseArgusRoster(
      JSON.stringify({ agents: [{ name: 'SOLO', role: 'r', tools: [] }] }),
      'fallback'
    )
    expect(parsed?.projectId).toBe('fallback')
    expect(parsed?.label).toBe('fallback')
  })

  it('returns null for unparseable or agent-less documents instead of throwing', () => {
    expect(parseArgusRoster('{ not json', 'p')).toBeNull()
    expect(parseArgusRoster('[]', 'p')).toBeNull()
    expect(parseArgusRoster(JSON.stringify({ agents: [] }), 'p')).toBeNull()
    expect(parseArgusRoster(JSON.stringify({ agents: [{ role: 'no name' }] }), 'p')).toBeNull()
  })

  it('drops malformed agent entries but keeps the valid ones', () => {
    const parsed = parseArgusRoster(
      JSON.stringify({
        agents: [{ name: 'OK', role: 'r', tools: ['Read', 7] }, 'nope', { role: 'nameless' }]
      }),
      'p'
    )
    expect(parsed?.agents).toHaveLength(1)
    expect(parsed?.agents[0]?.tools).toEqual(['Read'])
  })
})

describe('loadArgusRoster', () => {
  it('prefers a project-owned roster over the bundled default chart', async () => {
    const workspace = makeDir()
    writeFileSync(
      join(workspace, PROJECT_ROSTER_FILENAME),
      JSON.stringify({ label: 'Owned', agents: [{ name: 'MINE', role: 'r', tools: [] }] })
    )
    const loaded = await loadArgusRoster({
      projectId: 'agendapower',
      workspacePath: workspace,
      bundledRosterDir: REPO_ROSTER_DIR
    })
    expect(loaded?.label).toBe('Owned')
    expect(loaded?.agents.map((a) => a.name)).toEqual(['MINE'])
    expect(loaded?.source).toBe('project')
  })

  it('serves the shipped default chart to a workspace that owns no roster', async () => {
    const loaded = await loadArgusRoster({
      projectId: 'a-stranger-repo',
      workspacePath: makeDir(),
      bundledRosterDir: REPO_ROSTER_DIR
    })
    expect(loaded?.source).toBe('bundled')
    expect(loaded?.agents.map((a) => a.name)).toEqual([
      'CEO',
      'BOSS',
      'ENGINEER',
      'HUNTER',
      'AUDITOR',
      'DESIGNER'
    ])
    expect(loaded?.hierarchy.CEO).toContain('AUDITOR')
  })

  it('stamps the caller identity on the generic chart, which carries none', async () => {
    const loaded = await loadArgusRoster({
      projectId: 'a-stranger-repo',
      workspacePath: makeDir(),
      bundledRosterDir: REPO_ROSTER_DIR
    })
    // Why this matters: the bundled chart used to be picked by directory name, so a repo
    // called `confetti` inherited someone else's org chart. Identity is now stamped, never
    // matched.
    expect(loaded?.projectId).toBe('a-stranger-repo')
  })

  it('resolves to null when neither source has a roster', async () => {
    const empty = makeDir()
    mkdirSync(join(empty, 'bundled'))
    const loaded = await loadArgusRoster({
      projectId: 'unknown-project',
      workspacePath: empty,
      bundledRosterDir: join(empty, 'bundled')
    })
    expect(loaded).toBeNull()
  })

  it('ignores a corrupt project roster and still serves the default chart', async () => {
    const workspace = makeDir()
    writeFileSync(join(workspace, PROJECT_ROSTER_FILENAME), '{ corrupt')
    const loaded = await loadArgusRoster({
      projectId: 'whatever',
      workspacePath: workspace,
      bundledRosterDir: REPO_ROSTER_DIR
    })
    expect(loaded?.source).toBe('bundled')
  })

  it('reads seats.disabled so a project can refuse a role it does not own the file for', async () => {
    const workspace = makeDir()
    writeFileSync(
      join(workspace, PROJECT_ROSTER_FILENAME),
      JSON.stringify({
        agents: [{ name: 'ENGINEER', role: 'r', tools: [] }],
        seats: { disabled: ['designer', ' HUNTER ', '', 42] }
      })
    )
    const loaded = await loadArgusRoster({
      projectId: 'p',
      workspacePath: workspace,
      bundledRosterDir: REPO_ROSTER_DIR
    })
    expect(loaded?.disabledSeats).toEqual(['DESIGNER', 'HUNTER'])
  })

  it('defaults disabledSeats to empty when the project says nothing', async () => {
    const loaded = await loadArgusRoster({
      projectId: 'p',
      workspacePath: makeDir(),
      bundledRosterDir: REPO_ROSTER_DIR
    })
    expect(loaded?.disabledSeats).toEqual([])
  })
})
