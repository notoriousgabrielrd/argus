import type {
  ObsidianTagCount,
  ObsidianVault,
  ObsidianVaultStats
} from '../../shared/obsidian-types'
import { getVaultIndex } from './vault-index'

export function vaultStats(vault: ObsidianVault): ObsidianVaultStats {
  const index = getVaultIndex(vault)
  let totalBytes = 0
  for (const note of index.notes.values()) {
    totalBytes += note.size
  }
  for (const attachment of index.attachments) {
    totalBytes += attachment.size
  }
  return {
    vault,
    notes: index.notes.size,
    attachments: index.attachments.length,
    folders: index.folders.length,
    tags: index.tagCounts.size,
    unresolvedLinks: index.unresolvedLinks,
    totalBytes,
    indexedAt: index.indexedAt
  }
}

export function vaultTags(
  vault: ObsidianVault,
  options: { prefix?: string; limit?: number } = {}
): ObsidianTagCount[] {
  const index = getVaultIndex(vault)
  const prefix = options.prefix?.replace(/^#/, '').toLowerCase()
  const counts = [...index.tagCounts.entries()]
    .filter(([tag]) => !prefix || tag.toLowerCase().startsWith(prefix))
    .map(([tag, count]) => ({ tag, count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
  const limit = options.limit && options.limit > 0 ? Math.trunc(options.limit) : counts.length
  return counts.slice(0, limit)
}
