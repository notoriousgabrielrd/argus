import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ObsidianError } from '../../shared/obsidian-errors'
import type { ObsidianBacklink, ObsidianNote, ObsidianVault } from '../../shared/obsidian-types'
import { parseNote } from './note-frontmatter'
import { findNote } from './note-lookup'
import type { IndexedNote } from './note-record'
import { readSection } from './note-section'
import { getVaultIndex, type VaultIndex } from './vault-index'

const BACKLINK_CONTEXT_LIMIT = 200

function backlinkContext(vaultRoot: string, sourcePath: string, line: number): string {
  try {
    const lines = readFileSync(path.join(vaultRoot, sourcePath), 'utf-8').split('\n')
    return (lines[line - 1] ?? '').trim().slice(0, BACKLINK_CONTEXT_LIMIT)
  } catch {
    return ''
  }
}

export function collectBacklinks(index: VaultIndex, notePath: string): ObsidianBacklink[] {
  const refs = index.backlinks.get(notePath) ?? []
  return refs.map((ref) => ({
    path: ref.path,
    title: index.notes.get(ref.path)?.title ?? ref.path,
    line: ref.line,
    context: backlinkContext(index.vaultRoot, ref.path, ref.line)
  }))
}

export function readNoteFile(vaultRoot: string, note: IndexedNote): string {
  try {
    return readFileSync(path.join(vaultRoot, note.path), 'utf-8')
  } catch (error) {
    throw new ObsidianError(
      'obsidian_note_not_found',
      `Could not read "${note.path}": ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export type ReadNoteOptions = {
  selector: string
  includeContent?: boolean
  section?: string
  includeBacklinks?: boolean
}

export function readNote(vault: ObsidianVault, options: ReadNoteOptions): ObsidianNote {
  const index = getVaultIndex(vault)
  const note = findNote(index, options.selector)
  const raw = readNoteFile(vault.path, note)
  const parsed = parseNote(raw)
  const body = options.section ? readSection(parsed.body, options.section) : parsed.body
  const { absolutePath: _absolutePath, ...summary } = note
  return {
    ...summary,
    content: options.includeContent === false ? '' : body,
    links: note.links,
    backlinks: options.includeBacklinks === false ? [] : collectBacklinks(index, note.path)
  }
}
