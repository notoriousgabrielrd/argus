import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invalidateVaultIndex } from '../obsidian/vault-index'
import { RuntimeObsidianCommands } from './orca-runtime-obsidian'

let base = ''
let userDataPath = ''
let vaultPath = ''
let openedUrls: string[] = []
let commands: RuntimeObsidianCommands

function write(relative: string, content: string): void {
  const target = path.join(vaultPath, relative)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf-8')
}

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'argus-obsidian-runtime-'))
  userDataPath = path.join(base, 'userData')
  vaultPath = path.join(base, 'Notes')
  mkdirSync(userDataPath, { recursive: true })
  mkdirSync(vaultPath, { recursive: true })
  write('Projects/Argus.md', '---\nstatus: open\n---\n# Argus\n\n## Now\n- index the vault\n')
  write('Notes/Design.md', '# Design\nLinks to [[Argus]].\n')
  openedUrls = []
  invalidateVaultIndex()
  commands = new RuntimeObsidianCommands({
    getUserDataPath: () => userDataPath,
    openExternalUrl: async (url) => {
      openedUrls.push(url)
    },
    // Isolation: never read the developer's own obsidian.json during tests.
    discoverVaults: () => []
  })
  commands.obsidianAddVault({ path: vaultPath, name: 'Notes', makeDefault: true })
})

afterEach(() => {
  invalidateVaultIndex()
  rmSync(base, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('RuntimeObsidianCommands', () => {
  it('registers a vault and resolves it as the default for later calls', () => {
    expect(commands.obsidianListVaults().vaults).toHaveLength(1)
    expect(commands.obsidianVaultInfo({})).toMatchObject({ notes: 2 })
  })

  it('lists, searches, reads, and reports links without an explicit vault', () => {
    expect(commands.obsidianListNotes({ limit: 10 }).total).toBe(2)
    expect(commands.obsidianSearchNotes({ query: 'index the vault' }).hits[0].path).toBe(
      'Projects/Argus.md'
    )
    expect(commands.obsidianReadNote({ note: 'Argus' }).frontmatter.status).toBe('open')
    expect(commands.obsidianNoteLinks({ note: 'Notes/Design.md' }).outgoing[0].resolvedPath).toBe(
      'Projects/Argus.md'
    )
    expect(commands.obsidianTags({}).tags).toEqual([])
    expect(commands.obsidianTree({ depth: 1 }).noteCount).toBe(2)
  })

  it('creates a note from key=value property pairs', () => {
    const result = commands.obsidianCreateNote({
      path: 'Inbox/Idea.md',
      content: '- capture',
      property: ['status=open', 'priority=2']
    })
    expect(result.created).toBe(true)
    const raw = readFileSync(path.join(vaultPath, 'Inbox/Idea.md'), 'utf-8')
    expect(raw).toContain('status: open')
    // Numeric-looking values become real numbers so Obsidian sorts them.
    expect(raw).toContain('priority: 2')
  })

  it('rejects a property pair that is not key=value', () => {
    expect(() =>
      commands.obsidianCreateNote({ path: 'Inbox/Bad.md', property: ['status'] })
    ).toThrowError(expect.objectContaining({ code: 'obsidian_invalid_argument' }))
  })

  it('edits one heading section and leaves frontmatter intact', () => {
    commands.obsidianEditNote({
      note: 'Argus',
      content: '- and the CLI',
      mode: 'append',
      heading: '## Now'
    })
    const note = commands.obsidianReadNote({ note: 'Argus' })
    expect(note.frontmatter.status).toBe('open')
    expect(note.content).toContain('- and the CLI')
  })

  it('renames a note and rewrites the links that pointed at it', () => {
    const result = commands.obsidianRenameNote({ note: 'Argus', to: 'Projects/Orca.md' })
    expect(result.updatedNotes).toEqual(['Notes/Design.md'])
    expect(readFileSync(path.join(vaultPath, 'Notes/Design.md'), 'utf-8')).toContain('[[Orca]]')
  })

  it('trashes a note inside the vault by default', () => {
    expect(commands.obsidianDeleteNote({ note: 'Notes/Design.md' })).toMatchObject({
      trashedTo: '.trash/Notes/Design.md',
      permanent: false
    })
  })

  it('creates the daily note and hands a note to the desktop app by URI', async () => {
    expect(commands.obsidianDailyNote({ date: '2026-09-02', create: true }).created).toBe(true)
    await commands.obsidianOpenNote({ note: 'Argus' })
    expect(openedUrls).toEqual(['obsidian://open?vault=Notes&file=Projects%2FArgus'])
  })

  it('reports a missing vault selector with a stable error code', () => {
    expect(() => commands.obsidianReadNote({ vault: 'nope', note: 'Argus' })).toThrowError(
      expect.objectContaining({ code: 'obsidian_vault_not_found' })
    )
  })
})
