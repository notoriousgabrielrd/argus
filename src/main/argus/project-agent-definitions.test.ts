import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearProjectAgentCache,
  listProjectAgents,
  parseProjectAgentDefinition,
  PROJECT_AGENTS_DIR
} from './project-agent-definitions'

describe('parseProjectAgentDefinition', () => {
  it('reads the frontmatter name, description and tools', () => {
    const parsed = parseProjectAgentDefinition(
      [
        '---',
        'name: AUDITOR',
        'description: Guardião das regras',
        'tools: Read, Grep, Write',
        '---',
        '',
        '# AUDITOR'
      ].join('\n'),
      '/repo/.claude/agents/auditor.md'
    )
    expect(parsed).toEqual({
      seat: 'AUDITOR',
      description: 'Guardião das regras',
      tools: ['Read', 'Grep', 'Write'],
      path: '/repo/.claude/agents/auditor.md'
    })
  })

  it('keeps colons inside a description, which every real definition has', () => {
    const parsed = parseProjectAgentDefinition(
      ['---', 'name: BOSS', 'description: Infra: k8s, CI/CD e Postgres', '---'].join('\n'),
      '/repo/.claude/agents/boss.md'
    )
    expect(parsed?.description).toBe('Infra: k8s, CI/CD e Postgres')
  })

  it('treats a missing tools list as "inherits every tool", not as no tools', () => {
    // beefans/.claude/agents/BOSS.md is exactly this shape: model, no tools.
    const parsed = parseProjectAgentDefinition(
      ['---', 'name: BOSS', 'description: Tech Lead', 'model: opus', '---'].join('\n'),
      '/repo/.claude/agents/BOSS.md'
    )
    expect(parsed?.tools).toEqual([])
  })

  it('accepts CRLF frontmatter', () => {
    const parsed = parseProjectAgentDefinition(
      ['---', 'name: ENGINEER', 'description: Fullstack', '---'].join('\r\n'),
      '/repo/.claude/agents/engineer.md'
    )
    expect(parsed?.seat).toBe('ENGINEER')
  })

  it('skips a file with no frontmatter, no name, or a name Argus cannot seat', () => {
    expect(parseProjectAgentDefinition('# Just a doc', '/repo/x.md')).toBeNull()
    expect(parseProjectAgentDefinition('---\ndescription: no name\n---', '/repo/x.md')).toBeNull()
    expect(parseProjectAgentDefinition('---\nname: two words\n---', '/repo/x.md')).toBeNull()
  })
})

describe('listProjectAgents', () => {
  let workspace: string
  let agentsDir: string

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'argus-seats-'))
    agentsDir = join(workspace, PROJECT_AGENTS_DIR)
    await mkdir(agentsDir, { recursive: true })
    clearProjectAgentCache()
  })

  afterEach(async () => {
    clearProjectAgentCache()
    await rm(workspace, { recursive: true, force: true })
  })

  it('reads the frontmatter name rather than the filename, whose case varies by project', async () => {
    await writeFile(join(agentsDir, 'auditor.md'), '---\nname: AUDITOR\ndescription: a\n---\n')
    await writeFile(join(agentsDir, 'BOSS.md'), '---\nname: BOSS\ndescription: b\n---\n')

    const agents = await listProjectAgents(workspace)

    expect(agents.map((agent) => agent.seat)).toEqual(['BOSS', 'AUDITOR'])
  })

  it('resolves to an empty list when the workspace defines no project agents', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'argus-bare-'))
    try {
      expect(await listProjectAgents(bare)).toEqual([])
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  })

  it('ignores non-markdown files and unparseable definitions', async () => {
    await writeFile(join(agentsDir, 'auditor.md'), '---\nname: AUDITOR\ndescription: a\n---\n')
    await writeFile(join(agentsDir, 'notes.txt'), 'name: NOPE')
    await writeFile(join(agentsDir, 'broken.md'), 'no frontmatter here')

    expect((await listProjectAgents(workspace)).map((agent) => agent.seat)).toEqual(['AUDITOR'])
  })

  it('keeps one entry per name, first by sorted filename, so the list is stable', async () => {
    await writeFile(join(agentsDir, 'a-boss.md'), '---\nname: BOSS\ndescription: first\n---\n')
    await writeFile(join(agentsDir, 'z-boss.md'), '---\nname: BOSS\ndescription: second\n---\n')

    const agents = await listProjectAgents(workspace)

    expect(agents).toHaveLength(1)
    expect(agents[0].description).toBe('first')
  })

  it('picks up a definition added after the first read', async () => {
    await writeFile(join(agentsDir, 'auditor.md'), '---\nname: AUDITOR\ndescription: a\n---\n')
    expect(await listProjectAgents(workspace)).toHaveLength(1)

    await writeFile(join(agentsDir, 'boss.md'), '---\nname: BOSS\ndescription: b\n---\n')
    // Why touch: the cache keys on directory mtime, whose resolution can be coarser than
    // the gap between two writes in one test.
    const future = new Date(Date.now() + 2000)
    await utimes(agentsDir, future, future)

    expect((await listProjectAgents(workspace)).map((agent) => agent.seat)).toEqual([
      'AUDITOR',
      'BOSS'
    ])
  })
})
