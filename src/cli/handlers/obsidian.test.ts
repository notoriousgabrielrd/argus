import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPEATED_FLAG_SEPARATOR } from '../args'
import { HANDLER_GROUPS } from '../handler-group-manifest'
import { OBSIDIAN_READ_HANDLERS } from './obsidian'
import { OBSIDIAN_WRITE_HANDLERS } from './obsidian-write'

afterEach(() => vi.restoreAllMocks())

function harness(result: unknown = {}) {
  const call = vi.fn().mockResolvedValue({
    id: 'request-1',
    ok: true,
    result,
    _meta: { runtimeId: 'runtime-1' }
  })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  return call
}

async function runRead(
  key: string,
  flags: [string, string | boolean][],
  result: unknown = {}
): Promise<ReturnType<typeof harness>> {
  const call = harness(result)
  await OBSIDIAN_READ_HANDLERS[key]!({
    client: { call } as never,
    cwd: '/tmp',
    flags: new Map(flags),
    json: true
  })
  return call
}

describe('obsidian command registration', () => {
  it('routes every obsidian command through the two obsidian handler groups', () => {
    const keys = HANDLER_GROUPS.filter((group) => group.name.startsWith('obsidian')).flatMap(
      (group) => group.keys
    )
    expect(keys).toHaveLength(22)
    expect(keys).toContain('obsidian read')
    expect(keys).toContain('obsidian set-property')
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('obsidian read handlers', () => {
  it('omits the vault scope when no --vault is given', async () => {
    const call = await runRead('obsidian vaults', [], { vaults: [] })
    expect(call).toHaveBeenCalledWith('obsidian.listVaults')
  })

  it('passes repeated tag and property filters as arrays', async () => {
    const call = await runRead(
      'obsidian notes',
      [
        ['vault', 'Personal'],
        ['tag', `project${REPEATED_FLAG_SEPARATOR}active`],
        ['property', 'status=open'],
        ['modified-since', '7d'],
        ['limit', '5'],
        ['desc', true]
      ],
      { notes: [], total: 0, truncated: false }
    )
    expect(call).toHaveBeenCalledWith('obsidian.listNotes', {
      vault: 'Personal',
      tag: ['project', 'active'],
      property: ['status=open'],
      modifiedSince: '7d',
      desc: true,
      limit: 5
    })
  })

  it('turns the --no-content and --no-backlinks switches into explicit false flags', async () => {
    const call = await runRead(
      'obsidian read',
      [
        ['note', 'Argus'],
        ['no-content', true],
        ['no-backlinks', true]
      ],
      { path: 'Projects/Argus.md', tags: [], frontmatter: {}, backlinks: [], links: [] }
    )
    expect(call).toHaveBeenCalledWith('obsidian.readNote', {
      note: 'Argus',
      includeContent: false,
      includeBacklinks: false
    })
  })

  it('routes `links` without a note to the vault-wide dangling link sweep', async () => {
    const call = await runRead('obsidian links', [['unresolved', true]], { links: [] })
    expect(call).toHaveBeenCalledWith('obsidian.unresolvedLinks', {})
  })

  it('routes `links <note>` to the per-note report', async () => {
    const call = await runRead('obsidian links', [['note', 'Argus']], {
      path: 'Projects/Argus.md',
      outgoing: [],
      backlinks: [],
      unresolved: []
    })
    expect(call).toHaveBeenCalledWith('obsidian.noteLinks', { note: 'Argus' })
  })
})

describe('obsidian write handlers', () => {
  it('reads note content from a file relative to the working directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'argus-obsidian-cli-'))
    await writeFile(join(cwd, 'body.md'), '# Kickoff\n', 'utf8')
    const call = harness({ path: 'Meetings/Kickoff.md', created: true, bytes: 10 })

    await OBSIDIAN_WRITE_HANDLERS['obsidian create']!({
      client: { call } as never,
      cwd,
      flags: new Map<string, string | boolean>([
        ['path', 'Meetings/Kickoff.md'],
        ['content-file', 'body.md'],
        ['property', `status=open${REPEATED_FLAG_SEPARATOR}owner=me`]
      ]),
      json: true
    })

    expect(call).toHaveBeenCalledWith('obsidian.createNote', {
      path: 'Meetings/Kickoff.md',
      content: '# Kickoff\n',
      property: ['status=open', 'owner=me']
    })
  })

  it('rejects passing both --content and --content-file', async () => {
    const call = harness()
    await expect(
      OBSIDIAN_WRITE_HANDLERS['obsidian append']!({
        client: { call } as never,
        cwd: '/tmp',
        flags: new Map<string, string | boolean>([
          ['note', 'Argus'],
          ['content', 'a'],
          ['content-file', 'b.md']
        ]),
        json: true
      })
    ).rejects.toThrowError(/not both/)
    expect(call).not.toHaveBeenCalled()
  })

  it('sends append, prepend, and replace as one edit method with a mode', async () => {
    for (const [key, mode] of [
      ['obsidian append', 'append'],
      ['obsidian prepend', 'prepend'],
      ['obsidian replace', 'replace']
    ] as const) {
      const call = harness({ path: 'a.md', created: false, bytes: 1 })
      await OBSIDIAN_WRITE_HANDLERS[key]!({
        client: { call } as never,
        cwd: '/tmp',
        flags: new Map<string, string | boolean>([
          ['note', 'Argus'],
          ['content', 'text']
        ]),
        json: true
      })
      expect(call).toHaveBeenCalledWith('obsidian.editNote', {
        note: 'Argus',
        content: 'text',
        mode
      })
    }
  })

  it('sends `move` as a folder-relative rename', async () => {
    const call = harness({ from: 'a.md', to: 'b/a.md', updatedNotes: [], updatedLinks: 0 })
    await OBSIDIAN_WRITE_HANDLERS['obsidian move']!({
      client: { call } as never,
      cwd: '/tmp',
      flags: new Map<string, string | boolean>([
        ['note', 'a.md'],
        ['to', 'Projects'],
        ['no-update-links', true]
      ]),
      json: true
    })
    expect(call).toHaveBeenCalledWith('obsidian.renameNote', {
      note: 'a.md',
      to: 'Projects',
      asFolder: true,
      updateLinks: false
    })
  })
})
