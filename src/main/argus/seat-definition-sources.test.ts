import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearProjectAgentCache, PROJECT_AGENTS_DIR } from './project-agent-definitions'
import {
  resolveArgusAgentStoreDir,
  resolveBundledAgentDir,
  resolveSeatDefinitions
} from './seat-definition-sources'

let root: string

beforeEach(async () => {
  clearProjectAgentCache()
  root = await mkdtemp(join(tmpdir(), 'argus-seat-sources-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function writeAgent(dir: string, seat: string, marker: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, `${seat.toLowerCase()}.md`),
    ['---', `name: ${seat}`, `description: ${marker}`, 'tools: Read', '---', '', marker].join('\n')
  )
}

function layers(names: { workspace?: string; store?: string; bundled?: string }) {
  return {
    workspacePath: join(root, names.workspace ?? 'workspace'),
    storeDir: names.store ? join(root, names.store) : null,
    bundledDir: names.bundled ? join(root, names.bundled) : null
  }
}

describe('resolveSeatDefinitions', () => {
  it('seats the shipped baseline in a workspace that defines nothing', async () => {
    await writeAgent(join(root, 'bundled'), 'ENGINEER', 'shipped')
    await writeAgent(join(root, 'bundled'), 'AUDITOR', 'shipped')

    const resolved = await resolveSeatDefinitions(layers({ bundled: 'bundled' }))

    expect(resolved.map((d) => d.seat).sort()).toEqual(['AUDITOR', 'ENGINEER'])
    expect(resolved.every((d) => d.source === 'bundled')).toBe(true)
  })

  it('lets the project win one seat while the other layers fill the rest', async () => {
    const workspace = join(root, 'workspace')
    await writeAgent(join(workspace, PROJECT_AGENTS_DIR), 'ENGINEER', 'from-project')
    await writeAgent(join(root, 'store'), 'ENGINEER', 'from-store')
    await writeAgent(join(root, 'store'), 'HUNTER', 'from-store')
    await writeAgent(join(root, 'bundled'), 'ENGINEER', 'from-bundle')
    await writeAgent(join(root, 'bundled'), 'HUNTER', 'from-bundle')
    await writeAgent(join(root, 'bundled'), 'AUDITOR', 'from-bundle')

    const resolved = await resolveSeatDefinitions(layers({ store: 'store', bundled: 'bundled' }))
    const bySeat = new Map(resolved.map((d) => [d.seat, d]))

    // The union is per seat: defining ENGINEER must not cost the project the other five.
    expect([...bySeat.keys()].sort()).toEqual(['AUDITOR', 'ENGINEER', 'HUNTER'])
    expect(bySeat.get('ENGINEER')?.source).toBe('project')
    expect(bySeat.get('ENGINEER')?.description).toBe('from-project')
    expect(bySeat.get('HUNTER')?.source).toBe('argus')
    expect(bySeat.get('AUDITOR')?.source).toBe('bundled')
  })

  it('drops a seat the project disabled, whichever layer defined it', async () => {
    const workspace = join(root, 'workspace')
    await writeAgent(join(workspace, PROJECT_AGENTS_DIR), 'ENGINEER', 'from-project')
    await writeAgent(join(root, 'bundled'), 'DESIGNER', 'from-bundle')

    const resolved = await resolveSeatDefinitions({
      ...layers({ bundled: 'bundled' }),
      disabled: ['designer', ' ENGINEER ']
    })

    expect(resolved).toEqual([])
  })

  it('treats every missing layer as an empty one rather than an error', async () => {
    const resolved = await resolveSeatDefinitions(
      layers({ store: 'absent-store', bundled: 'absent-bundle' })
    )
    expect(resolved).toEqual([])
  })

  it('keeps the other layers when one holds a file with no usable frontmatter', async () => {
    await mkdir(join(root, 'store'), { recursive: true })
    await writeFile(join(root, 'store', 'broken.md'), 'sem frontmatter nenhum')
    await writeAgent(join(root, 'bundled'), 'BOSS', 'from-bundle')

    const resolved = await resolveSeatDefinitions(layers({ store: 'store', bundled: 'bundled' }))

    expect(resolved.map((d) => d.seat)).toEqual(['BOSS'])
  })

  it('reports the defining file path, so a caller can name what to edit', async () => {
    await writeAgent(join(root, 'bundled'), 'CEO', 'from-bundle')
    const [resolved] = await resolveSeatDefinitions(layers({ bundled: 'bundled' }))
    expect(resolved?.path).toBe(join(root, 'bundled', 'ceo.md'))
  })
})

describe('resolveArgusAgentStoreDir', () => {
  it('gives every worktree of one repo the same directory', () => {
    // Specializing a persona once should carry across branches: the store is keyed by repo.
    expect(resolveArgusAgentStoreDir('/data', 'repo-abc')).toBe(
      resolveArgusAgentStoreDir('/data', 'repo-abc')
    )
  })

  it('keeps distinct repos apart even when their ids slug to the same string', () => {
    const first = resolveArgusAgentStoreDir('/data', 'folder-workspace:one')
    const second = resolveArgusAgentStoreDir('/data', 'folder-workspace/one')
    expect(first).not.toBe(second)
  })

  it('strips characters that are illegal in a Windows path', () => {
    const dir = resolveArgusAgentStoreDir('/data', 'folder-workspace:abc')
    expect(dir.startsWith(join('/data', 'argus', 'agents'))).toBe(true)
    expect(dir.slice(join('/data', 'argus', 'agents').length)).not.toContain(':')
  })
})

describe('resolveBundledAgentDir', () => {
  it('points at the roles shipped inside the app', () => {
    expect(resolveBundledAgentDir('/app')).toBe(join('/app', 'resources', 'argus', 'agents'))
  })
})
