import { ObsidianError } from '../../shared/obsidian-errors'
import type { IndexedNote } from './note-record'
import { toPosixPath, withMarkdownExtension } from './vault-paths'
import type { VaultIndex } from './vault-index'

function normalize(value: string): string {
  return toPosixPath(value.trim()).replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase()
}

function candidatesFor(index: VaultIndex, selector: string): IndexedNote[] {
  const wanted = normalize(selector)
  const wantedWithExtension = normalize(withMarkdownExtension(selector))
  const notes = [...index.notes.values()]
  const byPath = notes.filter(
    (note) => normalize(note.path) === wanted || normalize(note.path) === wantedWithExtension
  )
  if (byPath.length > 0) {
    return byPath
  }
  const byName = notes.filter((note) => normalize(note.name) === wanted)
  if (byName.length > 0) {
    return byName
  }
  const bySuffix = notes.filter((note) => normalize(note.path).endsWith(`/${wantedWithExtension}`))
  if (bySuffix.length > 0) {
    return bySuffix
  }
  return notes.filter((note) => note.title.trim().toLowerCase() === selector.trim().toLowerCase())
}

/**
 * Agents refer to notes the way people do — a path, a bare filename, or the
 * note title. Ambiguity is reported with the candidates instead of guessing.
 */
export function findNote(index: VaultIndex, selector: string): IndexedNote {
  const wanted = selector?.trim()
  if (!wanted) {
    throw new ObsidianError('obsidian_invalid_argument', 'A note path or name is required.')
  }
  const matches = candidatesFor(index, wanted)
  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    throw new ObsidianError(
      'obsidian_note_ambiguous',
      `More than one note matches "${wanted}". Use the full vault-relative path.`,
      { candidates: matches.slice(0, 20).map((note) => note.path) }
    )
  }
  throw new ObsidianError('obsidian_note_not_found', `No note matches "${wanted}" in this vault.`, {
    vaultRoot: index.vaultRoot
  })
}

export function findNoteOrNull(index: VaultIndex, selector: string): IndexedNote | null {
  const matches = candidatesFor(index, selector)
  return matches.length === 1 ? matches[0] : null
}
