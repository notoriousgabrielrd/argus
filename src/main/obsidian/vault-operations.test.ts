import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ObsidianVault } from '../../shared/obsidian-types'
import { resolveDailyNote } from './daily-note'
import { createNote } from './note-create'
import { editNote } from './note-edit'
import { listNotes } from './note-list'
import { noteLinkReport, unresolvedVaultLinks } from './note-links-report'
import { setNoteProperty } from './note-properties'
import { readNote } from './note-read'
import { renameNote } from './note-rename'
import { searchVault } from './note-search'
import { deleteNote } from './note-trash'
import { getVaultIndex, invalidateVaultIndex } from './vault-index'
import { resolveInVault } from './vault-paths'
import { vaultStats, vaultTags } from './vault-stats'
import { vaultTree } from './vault-tree'

let root = ''
let vault: ObsidianVault

function write(relative: string, content: string): void {
  const target = path.join(root, relative)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, content, 'utf-8')
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'argus-vault-'))
  vault = {
    id: `test-${path.basename(root)}`,
    name: 'TestVault',
    path: root,
    source: 'manual',
    isDefault: true,
    available: true
  }
  write(
    'Projects/Argus.md',
    '---\nstatus: open\ntags: [project, active]\n---\n# Argus\nSee [[Notes/Design]] and [[Missing Note]].\n\n## Now\n- ship the vault index\n'
  )
  write(
    'Notes/Design.md',
    '---\nstatus: done\n---\n# Design\nBacklink to [[Argus]] here.\n#design\n'
  )
  write('Notes/Scratch.md', 'plain note with the word marmalade\n')
  write('assets/diagram.png', 'binary-ish')
  write('.obsidian/daily-notes.json', JSON.stringify({ format: 'YYYY-MM-DD', folder: 'Daily' }))
  invalidateVaultIndex()
})

afterEach(() => {
  invalidateVaultIndex()
  rmSync(root, { recursive: true, force: true })
})

describe('vault index', () => {
  it('indexes notes, skips Obsidian-owned folders, and separates attachments', () => {
    const index = getVaultIndex(vault)
    expect([...index.notes.keys()].sort()).toEqual([
      'Notes/Design.md',
      'Notes/Scratch.md',
      'Projects/Argus.md'
    ])
    expect(index.attachments.map((file) => file.path)).toEqual(['assets/diagram.png'])
  })

  it('resolves links into backlinks and counts the dangling ones', () => {
    const index = getVaultIndex(vault)
    expect(index.backlinks.get('Notes/Design.md')?.map((ref) => ref.path)).toEqual([
      'Projects/Argus.md'
    ])
    expect(index.unresolvedLinks).toBe(1)
  })

  it('picks up an edit made outside Argus on the next read', () => {
    getVaultIndex(vault)
    write('Notes/Scratch.md', '# Renamed by hand\n')
    expect(getVaultIndex(vault).notes.get('Notes/Scratch.md')?.title).toBe('Renamed by hand')
  })

  it('reports vault-level stats and tag counts', () => {
    expect(vaultStats(vault)).toMatchObject({ notes: 3, attachments: 1, unresolvedLinks: 1 })
    expect(
      vaultTags(vault)
        .map((entry) => entry.tag)
        .sort()
    ).toEqual(['active', 'design', 'project'])
  })

  it('builds a folder tree with note counts', () => {
    const tree = vaultTree(vault)
    expect(tree.noteCount).toBe(3)
    // `assets` holds only an attachment, yet it is still a folder of the vault.
    expect(tree.children?.map((child) => child.name)).toEqual(['assets', 'Notes', 'Projects'])
  })

  it('keeps a folder created after the last read, even while it holds no note', () => {
    vaultTree(vault)
    mkdirSync(path.join(root, 'Inbox'))
    const tree = vaultTree(vault)
    expect(tree.children?.map((child) => child.name)).toContain('Inbox')
    expect(tree.children?.find((child) => child.name === 'Inbox')?.noteCount).toBe(0)
  })
})

describe('reading and querying', () => {
  it('filters notes by tag, folder, and frontmatter property', () => {
    expect(listNotes(vault, { tag: ['project'] }).notes.map((note) => note.path)).toEqual([
      'Projects/Argus.md'
    ])
    expect(listNotes(vault, { folder: 'Notes' }).total).toBe(2)
    expect(listNotes(vault, { property: ['status=done'] }).notes[0].path).toBe('Notes/Design.md')
    expect(listNotes(vault, { hasProperty: ['status'] }).total).toBe(2)
  })

  it('reads a note by bare name with frontmatter, links, and backlinks', () => {
    const note = readNote(vault, { selector: 'Argus' })
    expect(note.path).toBe('Projects/Argus.md')
    expect(note.frontmatter.status).toBe('open')
    expect(note.content).toContain('# Argus')
    expect(note.backlinks.map((backlink) => backlink.path)).toEqual(['Notes/Design.md'])
  })

  it('reads a single section when asked', () => {
    expect(readNote(vault, { selector: 'Argus', section: '## Now' }).content).toBe(
      '## Now\n- ship the vault index'
    )
  })

  it('reports the candidates when a name matches nothing', () => {
    expect(() => readNote(vault, { selector: 'Nope' })).toThrowError(
      expect.objectContaining({ code: 'obsidian_note_not_found' })
    )
  })

  it('searches note bodies and reports matching lines', () => {
    const hits = searchVault(vault, { query: 'marmalade' })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ path: 'Notes/Scratch.md' })
    expect(hits[0].matches[0].line).toBe(1)
  })

  it('supports regular expressions and folder scoping', () => {
    expect(searchVault(vault, { query: '^#\\s', regex: true, folder: 'Notes' })).toHaveLength(1)
  })

  it('reports outgoing links, backlinks, and dangling links', () => {
    const report = noteLinkReport(vault, 'Projects/Argus.md')
    expect(report.outgoing.map((link) => link.resolvedPath)).toEqual(['Notes/Design.md', null])
    expect(report.unresolved[0].target).toBe('Missing Note')
    expect(unresolvedVaultLinks(vault)).toEqual([
      { path: 'Projects/Argus.md', target: 'Missing Note', line: 6 }
    ])
  })
})

describe('writing', () => {
  it('creates a note with frontmatter and refuses to clobber without --overwrite', () => {
    const result = createNote(vault, {
      path: 'Meetings/Kickoff',
      content: '# Kickoff\n',
      frontmatter: { status: 'open' }
    })
    expect(result).toMatchObject({ path: 'Meetings/Kickoff.md', created: true })
    expect(readFileSync(path.join(root, 'Meetings/Kickoff.md'), 'utf-8')).toBe(
      '---\nstatus: open\n---\n# Kickoff\n'
    )
    expect(() => createNote(vault, { path: 'Meetings/Kickoff.md' })).toThrowError(
      expect.objectContaining({ code: 'obsidian_note_exists' })
    )
  })

  it('appends to the end of the body while keeping frontmatter', () => {
    editNote(vault, { selector: 'Notes/Design.md', content: '- added', mode: 'append' })
    const raw = readFileSync(path.join(root, 'Notes/Design.md'), 'utf-8')
    expect(raw.startsWith('---\nstatus: done\n---\n')).toBe(true)
    expect(raw.trimEnd().endsWith('- added')).toBe(true)
  })

  it('appends inside one heading section', () => {
    editNote(vault, {
      selector: 'Argus',
      content: '- and the CLI',
      mode: 'append',
      heading: '## Now'
    })
    expect(readNote(vault, { selector: 'Argus', section: '## Now' }).content).toBe(
      '## Now\n- ship the vault index\n- and the CLI'
    )
  })

  it('sets a frontmatter property without touching the body', () => {
    setNoteProperty(vault, 'Argus', 'status', 'shipped')
    const note = readNote(vault, { selector: 'Argus' })
    expect(note.frontmatter.status).toBe('shipped')
    expect(note.content).toContain('- ship the vault index')
  })

  it('renames a note and rewrites the links that pointed at it', () => {
    const result = renameNote(vault, { selector: 'Notes/Design.md', to: 'Notes/Architecture.md' })
    expect(result).toMatchObject({ updatedLinks: 1, updatedNotes: ['Projects/Argus.md'] })
    expect(readFileSync(path.join(root, 'Projects/Argus.md'), 'utf-8')).toContain(
      '[[Notes/Architecture]]'
    )
  })

  it('moves a note to the vault trash by default', () => {
    const result = deleteNote(vault, 'Notes/Scratch.md')
    expect(result.trashedTo).toBe('.trash/Notes/Scratch.md')
    expect(listNotes(vault, {}).notes.map((note) => note.path)).not.toContain('Notes/Scratch.md')
  })

  it('creates the daily note using the vault Daily Notes settings', () => {
    const daily = resolveDailyNote(vault, { date: '2026-09-02', create: true })
    expect(daily).toMatchObject({ path: 'Daily/2026-09-02.md', created: true })
    expect(readNote(vault, { selector: 'Daily/2026-09-02.md' }).content).toContain('# 2026-09-02')
  })
})

describe('path safety', () => {
  it('refuses a path that climbs out of the vault', () => {
    expect(() => resolveInVault(root, '../escape.md')).toThrowError(
      expect.objectContaining({ code: 'obsidian_path_escape' })
    )
  })

  it('refuses to write through folders Obsidian owns', () => {
    expect(() => resolveInVault(root, '.obsidian/app.json')).toThrowError(
      expect.objectContaining({ code: 'obsidian_path_reserved' })
    )
  })

  it('refuses an absolute path outside the vault', () => {
    expect(() => resolveInVault(root, '/etc/hosts')).toThrowError(
      expect.objectContaining({ code: 'obsidian_path_escape' })
    )
  })
})
