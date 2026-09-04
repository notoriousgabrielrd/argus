import type { ObsidianNoteWriteResult, ObsidianVault } from '../../shared/obsidian-types'
import { removeFrontmatterProperty, setFrontmatterProperty } from './note-frontmatter'
import { writeNoteFile } from './note-file-write'
import { findNote } from './note-lookup'
import { readNoteFile } from './note-read'
import { getVaultIndex } from './vault-index'

export function setNoteProperty(
  vault: ObsidianVault,
  selector: string,
  key: string,
  value: unknown
): ObsidianNoteWriteResult {
  const note = findNote(getVaultIndex(vault), selector)
  const next = setFrontmatterProperty(readNoteFile(vault.path, note), key, value)
  return writeNoteFile(vault, note.absolutePath, next)
}

export function removeNoteProperty(
  vault: ObsidianVault,
  selector: string,
  key: string
): ObsidianNoteWriteResult {
  const note = findNote(getVaultIndex(vault), selector)
  const next = removeFrontmatterProperty(readNoteFile(vault.path, note), key)
  return writeNoteFile(vault, note.absolutePath, next)
}
