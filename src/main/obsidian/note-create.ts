import { existsSync } from 'node:fs'
import { ObsidianError } from '../../shared/obsidian-errors'
import type {
  ObsidianFrontmatter,
  ObsidianNoteWriteResult,
  ObsidianVault
} from '../../shared/obsidian-types'
import { parseNote, serializeNote } from './note-frontmatter'
import { writeNoteFile } from './note-file-write'
import { readNoteFile } from './note-read'
import { findNoteOrNull } from './note-lookup'
import { getVaultIndex } from './vault-index'
import { resolveInVault, withMarkdownExtension } from './vault-paths'

export type CreateNoteOptions = {
  path: string
  content?: string
  frontmatter?: ObsidianFrontmatter
  /** Replace an existing note instead of failing. */
  overwrite?: boolean
  /** Copy another note's body as the starting point. */
  templatePath?: string
}

export function createNote(
  vault: ObsidianVault,
  options: CreateNoteOptions
): ObsidianNoteWriteResult {
  const relative = withMarkdownExtension(options.path)
  const absolutePath = resolveInVault(vault.path, relative)
  const exists = existsSync(absolutePath)
  if (exists && !options.overwrite) {
    throw new ObsidianError(
      'obsidian_note_exists',
      `"${relative}" already exists. Pass --overwrite to replace it, or append instead.`
    )
  }
  const template = options.templatePath ? readTemplate(vault, options.templatePath) : null
  const body = options.content ?? template?.body ?? ''
  // Explicit properties win over the template's, so a template default can be overridden per note.
  const frontmatter = { ...template?.frontmatter, ...options.frontmatter }
  const content = serializeNote(frontmatter, body.endsWith('\n') ? body : `${body}\n`)
  return writeNoteFile(vault, absolutePath, content, { created: !exists })
}

function readTemplate(
  vault: ObsidianVault,
  templateSelector: string
): { frontmatter: ObsidianFrontmatter; body: string } {
  const template = findNoteOrNull(getVaultIndex(vault), templateSelector)
  if (!template) {
    throw new ObsidianError(
      'obsidian_note_not_found',
      `No template note matches "${templateSelector}".`
    )
  }
  const parsed = parseNote(readNoteFile(vault.path, template))
  return { frontmatter: parsed.frontmatter, body: parsed.body }
}
