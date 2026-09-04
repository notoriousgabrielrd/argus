import type { ObsidianTreeEntry, ObsidianVault } from '../../shared/obsidian-types'
import { getVaultIndex } from './vault-index'

type MutableEntry = ObsidianTreeEntry & { children: ObsidianTreeEntry[] }

function ensureFolder(root: MutableEntry, segments: string[]): MutableEntry {
  let current = root
  let prefix = ''
  for (const segment of segments) {
    prefix = prefix ? `${prefix}/${segment}` : segment
    let next = current.children.find(
      (child) => child.type === 'folder' && child.name === segment
    ) as MutableEntry | undefined
    if (!next) {
      next = { path: prefix, name: segment, type: 'folder', noteCount: 0, children: [] }
      current.children.push(next)
    }
    current = next
  }
  return current
}

function prune(entry: ObsidianTreeEntry, depth: number, maxDepth: number): ObsidianTreeEntry {
  if (!entry.children) {
    return entry
  }
  if (depth >= maxDepth) {
    const { children: _children, ...rest } = entry
    return rest
  }
  return { ...entry, children: entry.children.map((child) => prune(child, depth + 1, maxDepth)) }
}

/**
 * Folder view of the vault with per-folder note counts — the cheap orientation
 * call an agent makes before deciding what to read.
 */
export function vaultTree(
  vault: ObsidianVault,
  options: { folder?: string; depth?: number; includeNotes?: boolean } = {}
): ObsidianTreeEntry {
  const index = getVaultIndex(vault)
  const scope = options.folder?.replace(/^\/+|\/+$/g, '') ?? ''
  const root: MutableEntry = {
    path: scope,
    name: scope ? (scope.split('/').pop() as string) : vault.name,
    type: 'folder',
    noteCount: 0,
    children: []
  }
  // Why: seeding from the scan keeps folders the user just created — or that
  // hold only attachments — on the tree, instead of only those a note carved out.
  for (const folder of index.folders) {
    if (folder === scope || (scope && !folder.startsWith(`${scope}/`))) {
      continue
    }
    ensureFolder(root, (scope ? folder.slice(scope.length + 1) : folder).split('/'))
  }
  for (const note of index.notes.values()) {
    if (scope && note.path !== scope && !note.path.startsWith(`${scope}/`)) {
      continue
    }
    const relative = scope ? note.path.slice(scope.length + 1) : note.path
    const segments = relative.split('/')
    const fileName = segments.pop() as string
    const folder = ensureFolder(root, segments)
    folder.noteCount = (folder.noteCount ?? 0) + 1
    if (options.includeNotes) {
      folder.children.push({ path: note.path, name: fileName, type: 'note' })
    }
  }
  root.noteCount = index.notes.size
  const sortEntries = (entry: ObsidianTreeEntry): void => {
    entry.children?.sort(
      (left, right) =>
        Number(right.type === 'folder') - Number(left.type === 'folder') ||
        left.name.localeCompare(right.name)
    )
    entry.children?.forEach(sortEntries)
  }
  sortEntries(root)
  return prune(root, 0, options.depth && options.depth > 0 ? Math.trunc(options.depth) : 3)
}
