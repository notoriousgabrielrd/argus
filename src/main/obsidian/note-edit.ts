import type { ObsidianNoteWriteResult, ObsidianVault } from '../../shared/obsidian-types'
import { parseNote, serializeNote } from './note-frontmatter'
import { writeNoteFile } from './note-file-write'
import { findNote } from './note-lookup'
import { readNoteFile } from './note-read'
import { appendToSection, replaceSection } from './note-section'
import { getVaultIndex } from './vault-index'

export type EditMode = 'append' | 'prepend' | 'replace'

export type EditNoteOptions = {
  selector: string
  content: string
  mode: EditMode
  /** Restrict the edit to one `## Heading` section instead of the whole note. */
  heading?: string
}

function joinBlocks(before: string, addition: string): string {
  const trimmed = before.replace(/\s+$/, '')
  const separator = trimmed === '' ? '' : '\n\n'
  return `${trimmed}${separator}${addition.replace(/\s+$/, '')}\n`
}

function nextBody(body: string, options: EditNoteOptions): string {
  if (options.heading) {
    return options.mode === 'replace'
      ? replaceSection(body, options.heading, options.content)
      : appendToSection(body, options.heading, options.content)
  }
  if (options.mode === 'replace') {
    return options.content.endsWith('\n') ? options.content : `${options.content}\n`
  }
  if (options.mode === 'prepend') {
    return joinBlocks(options.content, body.replace(/^\n+/, ''))
  }
  return joinBlocks(body, options.content)
}

/**
 * Edits keep the note's frontmatter block intact — agents edit prose, and a
 * naive whole-file rewrite is the usual way properties get destroyed.
 */
export function editNote(vault: ObsidianVault, options: EditNoteOptions): ObsidianNoteWriteResult {
  const note = findNote(getVaultIndex(vault), options.selector)
  const parsed = parseNote(readNoteFile(vault.path, note))
  const content = serializeNote(parsed.frontmatter, nextBody(parsed.body, options))
  return writeNoteFile(vault, note.absolutePath, content)
}
