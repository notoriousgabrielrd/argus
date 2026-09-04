import { ObsidianError } from '../../shared/obsidian-errors'
import {
  OBSIDIAN_DEFAULT_LIST_LIMIT,
  OBSIDIAN_MAX_LIST_LIMIT,
  type ObsidianNoteFilter,
  type ObsidianNoteList,
  type ObsidianNoteSummary,
  type ObsidianVault
} from '../../shared/obsidian-types'
import type { IndexedNote } from './note-record'
import { getVaultIndex, type VaultIndex } from './vault-index'

function propertyMatches(note: IndexedNote, expression: string): boolean {
  const separator = expression.indexOf('=')
  if (separator === -1) {
    throw new ObsidianError(
      'obsidian_invalid_argument',
      `Property filter must be key=value, got "${expression}".`
    )
  }
  const key = expression.slice(0, separator).trim()
  const wanted = expression
    .slice(separator + 1)
    .trim()
    .toLowerCase()
  const value = note.frontmatter[key]
  if (Array.isArray(value)) {
    return value.some((entry) => String(entry).trim().toLowerCase() === wanted)
  }
  return value !== undefined && String(value).trim().toLowerCase() === wanted
}

function tagMatches(note: IndexedNote, tag: string): boolean {
  const wanted = tag.replace(/^#/, '').toLowerCase()
  return note.tags.some(
    (entry) => entry.toLowerCase() === wanted || entry.toLowerCase().startsWith(`${wanted}/`)
  )
}

function inFolder(note: IndexedNote, folder: string): boolean {
  const wanted = folder.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!wanted) {
    return true
  }
  const noteFolder = note.folder.toLowerCase()
  return noteFolder === wanted || noteFolder.startsWith(`${wanted}/`)
}

function matchesFilter(
  note: IndexedNote,
  filter: ObsidianNoteFilter,
  since: number | null
): boolean {
  if (filter.folder && !inFolder(note, filter.folder)) {
    return false
  }
  if (filter.tag?.some((tag) => !tagMatches(note, tag))) {
    return false
  }
  if (filter.property?.some((expression) => !propertyMatches(note, expression))) {
    return false
  }
  if (filter.hasProperty?.some((key) => note.frontmatter[key.trim()] === undefined)) {
    return false
  }
  if (since !== null && Date.parse(note.modifiedAt) < since) {
    return false
  }
  if (filter.namePattern) {
    const pattern = filter.namePattern.toLowerCase()
    if (!note.name.toLowerCase().includes(pattern) && !note.title.toLowerCase().includes(pattern)) {
      return false
    }
  }
  return true
}

function compare(left: IndexedNote, right: IndexedNote, sort: ObsidianNoteFilter['sort']): number {
  if (sort === 'name') {
    return left.name.localeCompare(right.name)
  }
  if (sort === 'path') {
    return left.path.localeCompare(right.path)
  }
  if (sort === 'size') {
    return left.size - right.size
  }
  if (sort === 'created') {
    return Date.parse(left.createdAt) - Date.parse(right.createdAt)
  }
  return Date.parse(left.modifiedAt) - Date.parse(right.modifiedAt)
}

function parseSince(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const relative = /^-?(\d+)([dhwm])$/i.exec(value.trim())
  if (relative) {
    const amount = Number(relative[1])
    const unitMs = { h: 3_600_000, d: 86_400_000, w: 604_800_000, m: 2_592_000_000 }[
      relative[2].toLowerCase() as 'h' | 'd' | 'w' | 'm'
    ]
    return Date.now() - amount * unitMs
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    throw new ObsidianError(
      'obsidian_invalid_argument',
      `Could not read "${value}" as a date. Use an ISO date or a relative window like 7d.`
    )
  }
  return parsed
}

function toSummary(note: IndexedNote): ObsidianNoteSummary {
  const { absolutePath: _absolutePath, links: _links, ...summary } = note
  return summary
}

/**
 * Filtering against an index the caller already has avoids a second full stat
 * walk of the vault — search needs both the scope and the note records.
 */
export function filterIndexedNotes(
  index: VaultIndex,
  filter: ObsidianNoteFilter = {}
): IndexedNote[] {
  const since = parseSince(filter.modifiedSince)
  const matched = [...index.notes.values()].filter((note) => matchesFilter(note, filter, since))
  // Newest-first is the useful default for "what changed in the vault".
  const descending = filter.desc ?? (filter.sort ?? 'modified') === 'modified'
  matched.sort((left, right) => {
    const ordered = compare(left, right, filter.sort)
    return descending ? -ordered : ordered
  })
  return matched
}

export function listNotes(vault: ObsidianVault, filter: ObsidianNoteFilter = {}): ObsidianNoteList {
  const matched = filterIndexedNotes(getVaultIndex(vault), filter)
  const limit = Math.min(
    Math.max(1, Math.trunc(filter.limit ?? OBSIDIAN_DEFAULT_LIST_LIMIT)),
    OBSIDIAN_MAX_LIST_LIMIT
  )
  return {
    notes: matched.slice(0, limit).map(toSummary),
    total: matched.length,
    truncated: matched.length > limit
  }
}
