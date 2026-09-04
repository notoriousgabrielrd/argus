import { isMarkdownPath } from './vault-paths'

export type LinkResolutionIndex = {
  byPath: Map<string, string>
  byName: Map<string, string[]>
}

function withoutExtension(value: string): string {
  return isMarkdownPath(value) ? value.replace(/\.[^./]+$/, '') : value
}

function normalizeKey(value: string): string {
  return value.replace(/^\.\//, '').replace(/^\/+/, '').toLowerCase()
}

export function buildLinkResolutionIndex(paths: readonly string[]): LinkResolutionIndex {
  const byPath = new Map<string, string>()
  const byName = new Map<string, string[]>()
  for (const notePath of paths) {
    byPath.set(normalizeKey(notePath), notePath)
    const stripped = withoutExtension(notePath)
    if (!byPath.has(normalizeKey(stripped))) {
      byPath.set(normalizeKey(stripped), notePath)
    }
    const name = normalizeKey(withoutExtension(notePath.split('/').pop() ?? notePath))
    const bucket = byName.get(name)
    if (bucket) {
      bucket.push(notePath)
    } else {
      byName.set(name, [notePath])
    }
  }
  return { byPath, byName }
}

function folderOf(notePath: string): string {
  const parts = notePath.split('/')
  parts.pop()
  return parts.join('/')
}

/**
 * Mirrors Obsidian's own resolution: an explicit path wins, otherwise a bare
 * name resolves to the nearest note with that name — the source's own folder
 * first, then the shallowest path so the answer is stable.
 */
export function resolveLinkTarget(
  index: LinkResolutionIndex,
  target: string,
  fromPath: string
): string | null {
  const wanted = target.trim()
  if (!wanted) {
    return fromPath
  }
  if (wanted.includes('/')) {
    const direct = byPathLookup(index, wanted)
    if (direct) {
      return direct
    }
  }
  const candidates = index.byName.get(
    normalizeKey(withoutExtension(wanted.split('/').pop() ?? wanted))
  )
  if (candidates && candidates.length > 0) {
    return nearest(candidates, fromPath)
  }
  return byPathLookup(index, wanted)
}

function byPathLookup(index: LinkResolutionIndex, target: string): string | null {
  return (
    index.byPath.get(normalizeKey(target)) ?? index.byPath.get(normalizeKey(`${target}.md`)) ?? null
  )
}

function nearest(candidates: readonly string[], fromPath: string): string {
  if (candidates.length === 1) {
    return candidates[0]
  }
  const sourceFolder = folderOf(fromPath)
  const sameFolder = candidates.filter((candidate) => folderOf(candidate) === sourceFolder)
  const pool = sameFolder.length > 0 ? sameFolder : candidates
  return [...pool].sort(
    (left, right) => left.split('/').length - right.split('/').length || left.localeCompare(right)
  )[0]
}
