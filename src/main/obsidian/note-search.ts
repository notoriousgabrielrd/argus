import { readFileSync } from 'node:fs'
import path from 'node:path'
import { ObsidianError } from '../../shared/obsidian-errors'
import {
  OBSIDIAN_DEFAULT_SEARCH_LIMIT,
  OBSIDIAN_MAX_LIST_LIMIT,
  type ObsidianNoteFilter,
  type ObsidianSearchHit,
  type ObsidianSearchMatch,
  type ObsidianVault
} from '../../shared/obsidian-types'
import { filterIndexedNotes } from './note-list'
import { getVaultIndex } from './vault-index'

const MATCH_LINE_LIMIT = 5
const MATCH_TEXT_LIMIT = 240

export type SearchOptions = {
  query: string
  regex?: boolean
  caseSensitive?: boolean
  folder?: string
  tag?: string[]
  limit?: number
  /** Search titles and frontmatter only; useful for cheap lookups on huge vaults. */
  titlesOnly?: boolean
}

function buildMatcher(options: SearchOptions): RegExp {
  const flags = options.caseSensitive ? 'g' : 'gi'
  if (!options.regex) {
    return new RegExp(options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
  }
  try {
    return new RegExp(options.query, flags)
  } catch (error) {
    throw new ObsidianError(
      'obsidian_invalid_argument',
      `Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function testOnce(matcher: RegExp, text: string): boolean {
  matcher.lastIndex = 0
  return matcher.test(text)
}

function matchesInText(text: string, matcher: RegExp): ObsidianSearchMatch[] {
  const matches: ObsidianSearchMatch[] = []
  const lines = text.split('\n')
  for (let index = 0; index < lines.length && matches.length < MATCH_LINE_LIMIT; index += 1) {
    if (testOnce(matcher, lines[index])) {
      matches.push({ line: index + 1, text: lines[index].trim().slice(0, MATCH_TEXT_LIMIT) })
    }
  }
  return matches
}

/**
 * Full-text search over the vault. Title and path hits are scored above body
 * hits so the note an agent asked for by name lands first.
 */
export function searchVault(vault: ObsidianVault, options: SearchOptions): ObsidianSearchHit[] {
  const query = options.query?.trim()
  if (!query) {
    throw new ObsidianError('obsidian_invalid_argument', 'A search query is required.')
  }
  const matcher = buildMatcher({ ...options, query })
  const index = getVaultIndex(vault)
  const scopeFilter: ObsidianNoteFilter = {
    ...(options.folder ? { folder: options.folder } : {}),
    ...(options.tag?.length ? { tag: options.tag } : {}),
    limit: OBSIDIAN_MAX_LIST_LIMIT,
    sort: 'modified'
  }
  const scope = filterIndexedNotes(index, scopeFilter)
  const limit = Math.max(1, Math.trunc(options.limit ?? OBSIDIAN_DEFAULT_SEARCH_LIMIT))
  const hits: ObsidianSearchHit[] = []
  for (const note of scope) {
    const titleHit = testOnce(matcher, note.title) || testOnce(matcher, note.path)
    let matches: ObsidianSearchMatch[] = []
    if (!options.titlesOnly) {
      const record = index.notes.get(note.path)
      if (record) {
        try {
          matches = matchesInText(
            readFileSync(path.join(vault.path, record.path), 'utf-8'),
            matcher
          )
        } catch {
          matches = []
        }
      }
    }
    if (!titleHit && matches.length === 0) {
      continue
    }
    hits.push({
      path: note.path,
      title: note.title,
      score: (titleHit ? 10 : 0) + matches.length,
      matches
    })
    if (hits.length >= limit * 4) {
      break
    }
  }
  return hits
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, limit)
}
