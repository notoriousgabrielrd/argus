/**
 * Wire types for the Obsidian vault integration. Kept dependency-free so the
 * renderer, the CLI, and the main process all read the same contract.
 */

export type ObsidianVaultSource = 'obsidian-config' | 'manual'

export type ObsidianVault = {
  id: string
  name: string
  path: string
  source: ObsidianVaultSource
  isDefault: boolean
  /** Obsidian's own config marks which vault the desktop app had open last. */
  openInApp?: boolean
  /** False when the registered folder no longer exists on disk. */
  available: boolean
}

export type ObsidianFrontmatter = Record<string, unknown>

export type ObsidianLinkKind = 'wikilink' | 'embed' | 'markdown'

export type ObsidianLinkRef = {
  kind: ObsidianLinkKind
  /** Raw link target as written in the note, without heading/block suffix. */
  target: string
  alias?: string
  heading?: string
  blockRef?: string
  /** Vault-relative path the target resolves to, or null when unresolved. */
  resolvedPath: string | null
  line: number
}

export type ObsidianBacklink = {
  path: string
  title: string
  line: number
  context: string
}

export type ObsidianNoteSummary = {
  /** Vault-relative POSIX path, e.g. `Projects/Argus.md`. */
  path: string
  /** File basename without the extension. */
  name: string
  title: string
  folder: string
  size: number
  modifiedAt: string
  createdAt: string
  tags: string[]
  frontmatter: ObsidianFrontmatter
  headings: string[]
  outgoingLinks: number
}

export type ObsidianNote = ObsidianNoteSummary & {
  /** Note body with the frontmatter block stripped. */
  content: string
  links: ObsidianLinkRef[]
  backlinks: ObsidianBacklink[]
}

export type ObsidianSearchMatch = {
  line: number
  text: string
}

export type ObsidianSearchHit = {
  path: string
  title: string
  score: number
  matches: ObsidianSearchMatch[]
}

export type ObsidianTagCount = {
  tag: string
  count: number
}

export type ObsidianVaultStats = {
  vault: ObsidianVault
  notes: number
  attachments: number
  folders: number
  tags: number
  unresolvedLinks: number
  totalBytes: number
  indexedAt: string
}

export type ObsidianTreeEntry = {
  path: string
  name: string
  type: 'folder' | 'note' | 'file'
  noteCount?: number
  children?: ObsidianTreeEntry[]
}

export type ObsidianLinkReport = {
  path: string
  outgoing: ObsidianLinkRef[]
  backlinks: ObsidianBacklink[]
  unresolved: ObsidianLinkRef[]
}

export type ObsidianNoteWriteResult = {
  path: string
  created: boolean
  bytes: number
  modifiedAt: string
}

export type ObsidianRenameResult = {
  from: string
  to: string
  updatedNotes: string[]
  updatedLinks: number
}

export type ObsidianDeleteResult = {
  path: string
  trashedTo: string | null
  permanent: boolean
}

export type ObsidianDailyNote = {
  path: string
  date: string
  created: boolean
  exists: boolean
}

export type ObsidianOpenResult = {
  uri: string
  opened: boolean
}

export type ObsidianNoteSort = 'modified' | 'created' | 'name' | 'path' | 'size'

export type ObsidianNoteFilter = {
  folder?: string
  tag?: string[]
  /** `key=value` equality checks against frontmatter properties. */
  property?: string[]
  hasProperty?: string[]
  modifiedSince?: string
  namePattern?: string
  sort?: ObsidianNoteSort
  desc?: boolean
  limit?: number
}

export type ObsidianNoteList = {
  notes: ObsidianNoteSummary[]
  total: number
  truncated: boolean
}

export const OBSIDIAN_DEFAULT_LIST_LIMIT = 50
export const OBSIDIAN_MAX_LIST_LIMIT = 1000
export const OBSIDIAN_DEFAULT_SEARCH_LIMIT = 20
export const OBSIDIAN_MAX_NOTE_BYTES = 4 * 1024 * 1024
export const OBSIDIAN_MAX_WRITE_BYTES = 2 * 1024 * 1024
