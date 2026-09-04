import type { ObsidianVault } from '../../shared/obsidian-types'
import { buildLinkResolutionIndex, resolveLinkTarget } from './note-link-resolution'
import { readNoteRecord, type IndexedNote } from './note-record'
import { scanVault, type ScannedFile, type VaultScan } from './vault-scan'

export type BacklinkRef = { path: string; line: number }

export type VaultIndex = {
  vaultId: string
  vaultRoot: string
  notes: Map<string, IndexedNote>
  attachments: ScannedFile[]
  folders: string[]
  backlinks: Map<string, BacklinkRef[]>
  tagCounts: Map<string, number>
  unresolvedLinks: number
  indexedAt: string
  truncated: boolean
}

type CacheEntry = {
  index: VaultIndex
  fingerprints: Map<string, string>
}

const CACHE = new Map<string, CacheEntry>()

function fingerprint(file: ScannedFile): string {
  return `${file.size}:${file.modifiedMs}`
}

function resolveLinks(notes: Map<string, IndexedNote>): {
  backlinks: Map<string, BacklinkRef[]>
  unresolved: number
} {
  const resolution = buildLinkResolutionIndex([...notes.keys()])
  const backlinks = new Map<string, BacklinkRef[]>()
  let unresolved = 0
  for (const note of notes.values()) {
    for (const link of note.links) {
      const resolved = resolveLinkTarget(resolution, link.target, note.path)
      link.resolvedPath = resolved
      if (!resolved) {
        unresolved += 1
        continue
      }
      if (resolved === note.path) {
        continue
      }
      const bucket = backlinks.get(resolved)
      const ref: BacklinkRef = { path: note.path, line: link.line }
      if (bucket) {
        bucket.push(ref)
      } else {
        backlinks.set(resolved, [ref])
      }
    }
  }
  return { backlinks, unresolved }
}

function countTags(notes: Map<string, IndexedNote>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const note of notes.values()) {
    for (const tag of note.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return counts
}

function buildIndex(
  vault: ObsidianVault,
  scan: VaultScan,
  previous: CacheEntry | undefined
): CacheEntry {
  const notes = new Map<string, IndexedNote>()
  const fingerprints = new Map<string, string>()
  for (const file of scan.files) {
    if (!file.isNote) {
      continue
    }
    const stamp = fingerprint(file)
    fingerprints.set(file.path, stamp)
    const cached =
      previous?.fingerprints.get(file.path) === stamp
        ? previous.index.notes.get(file.path)
        : undefined
    // Why: link resolution mutates `resolvedPath`, so a reused record is cloned
    // before it re-enters the graph and picks up a different vault shape.
    const record = cached
      ? { ...cached, links: cached.links.map((link) => ({ ...link })) }
      : readNoteRecord(file)
    if (record) {
      notes.set(file.path, record)
    }
  }
  const { backlinks, unresolved } = resolveLinks(notes)
  return {
    fingerprints,
    index: {
      vaultId: vault.id,
      vaultRoot: vault.path,
      notes,
      attachments: scan.files.filter((file) => !file.isNote),
      folders: scan.folders,
      backlinks,
      tagCounts: countTags(notes),
      unresolvedLinks: unresolved,
      indexedAt: new Date().toISOString(),
      truncated: scan.truncated
    }
  }
}

/**
 * Re-stats the vault on every call and re-reads only the notes whose size or
 * mtime moved. That keeps the index honest when an agent edits a note with
 * plain file tools instead of going through `argus obsidian`.
 */
export function getVaultIndex(vault: ObsidianVault): VaultIndex {
  const previous = CACHE.get(vault.id)
  const entry = buildIndex(vault, scanVault(vault.path), previous)
  CACHE.set(vault.id, entry)
  return entry.index
}

export function invalidateVaultIndex(vaultId?: string): void {
  if (vaultId) {
    CACHE.delete(vaultId)
    return
  }
  CACHE.clear()
}
