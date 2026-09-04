import type { ObsidianLinkReport, ObsidianVault } from '../../shared/obsidian-types'
import { findNote } from './note-lookup'
import { collectBacklinks } from './note-read'
import { getVaultIndex } from './vault-index'

export function noteLinkReport(vault: ObsidianVault, selector: string): ObsidianLinkReport {
  const index = getVaultIndex(vault)
  const note = findNote(index, selector)
  return {
    path: note.path,
    outgoing: note.links,
    backlinks: collectBacklinks(index, note.path),
    unresolved: note.links.filter((link) => link.resolvedPath === null)
  }
}

/** Vault-wide dangling links: the maintenance sweep an automation runs weekly. */
export function unresolvedVaultLinks(
  vault: ObsidianVault,
  limit = 100
): { path: string; target: string; line: number }[] {
  const index = getVaultIndex(vault)
  const dangling: { path: string; target: string; line: number }[] = []
  for (const note of index.notes.values()) {
    for (const link of note.links) {
      if (link.resolvedPath !== null) {
        continue
      }
      dangling.push({ path: note.path, target: link.target, line: link.line })
      if (dangling.length >= limit) {
        return dangling
      }
    }
  }
  return dangling
}
