import type {
  ObsidianDailyNote,
  ObsidianDeleteResult,
  ObsidianLinkReport,
  ObsidianNote,
  ObsidianNoteList,
  ObsidianNoteWriteResult,
  ObsidianOpenResult,
  ObsidianRenameResult,
  ObsidianSearchHit,
  ObsidianTagCount,
  ObsidianTreeEntry,
  ObsidianVault,
  ObsidianVaultStats
} from '../shared/obsidian-types'

function shortDate(iso: string): string {
  return iso.slice(0, 10)
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const kilobytes = bytes / 1024
  return kilobytes < 1024 ? `${kilobytes.toFixed(1)} KB` : `${(kilobytes / 1024).toFixed(1)} MB`
}

export function formatObsidianVaults(result: { vaults: ObsidianVault[] }): string {
  if (result.vaults.length === 0) {
    return 'No Obsidian vaults found. Add one with `argus obsidian vault-add <path>`.'
  }
  return result.vaults
    .map((vault) => {
      const marks = [
        vault.isDefault ? 'default' : '',
        vault.available ? '' : 'missing',
        vault.source === 'manual' ? 'manual' : 'obsidian'
      ]
        .filter(Boolean)
        .join(',')
      return `${vault.id}  ${vault.name}  [${marks}]  ${vault.path}`
    })
    .join('\n')
}

export function formatObsidianVault(result: { vault: ObsidianVault }): string {
  return formatObsidianVaults({ vaults: [result.vault] })
}

export function formatObsidianVaultInfo(stats: ObsidianVaultStats): string {
  return [
    `${stats.vault.name}  ${stats.vault.path}`,
    `notes: ${stats.notes}   attachments: ${stats.attachments}   folders: ${stats.folders}`,
    `tags: ${stats.tags}   dangling links: ${stats.unresolvedLinks}   size: ${humanBytes(
      stats.totalBytes
    )}`,
    `indexed at ${stats.indexedAt}`
  ].join('\n')
}

export function formatObsidianNoteList(result: ObsidianNoteList): string {
  if (result.notes.length === 0) {
    return 'No notes matched.'
  }
  const rows = result.notes
    .map((note) => {
      const tags = note.tags.length > 0 ? `  #${note.tags.join(' #')}` : ''
      return `${shortDate(note.modifiedAt)}  ${note.path}${tags}`
    })
    .join('\n')
  return result.truncated ? `${rows}\n… ${result.total} notes matched.` : rows
}

export function formatObsidianNote(note: ObsidianNote): string {
  const properties = Object.entries(note.frontmatter)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
    .join('\n')
  const header = [
    `# ${note.title}`,
    `path: ${note.path}   modified: ${note.modifiedAt}`,
    note.tags.length > 0 ? `tags: #${note.tags.join(' #')}` : '',
    properties ? `properties:\n${properties}` : '',
    note.backlinks.length > 0 ? `backlinks: ${note.backlinks.length}` : ''
  ]
    .filter(Boolean)
    .join('\n')
  return note.content ? `${header}\n\n---\n${note.content}` : header
}

export function formatObsidianSearch(result: { hits: ObsidianSearchHit[] }): string {
  if (result.hits.length === 0) {
    return 'No notes matched.'
  }
  return result.hits
    .map((hit) => {
      const matches = hit.matches.map((match) => `    ${match.line}: ${match.text}`).join('\n')
      return matches ? `${hit.path}\n${matches}` : hit.path
    })
    .join('\n')
}

export function formatObsidianLinks(report: ObsidianLinkReport): string {
  const outgoing = report.outgoing
    .map((link) => `  → ${link.resolvedPath ?? `${link.target} (unresolved)`}`)
    .join('\n')
  const backlinks = report.backlinks
    .map((backlink) => `  ← ${backlink.path}:${backlink.line}  ${backlink.context}`)
    .join('\n')
  return [
    report.path,
    outgoing ? `outgoing:\n${outgoing}` : 'outgoing: none',
    backlinks ? `backlinks:\n${backlinks}` : 'backlinks: none'
  ].join('\n')
}

export function formatObsidianUnresolvedLinks(result: {
  links: { path: string; target: string; line: number }[]
}): string {
  if (result.links.length === 0) {
    return 'No dangling links.'
  }
  return result.links.map((link) => `${link.path}:${link.line}  → ${link.target}`).join('\n')
}

export function formatObsidianTags(result: { tags: ObsidianTagCount[] }): string {
  if (result.tags.length === 0) {
    return 'No tags in this vault.'
  }
  return result.tags.map((entry) => `${String(entry.count).padStart(5)}  #${entry.tag}`).join('\n')
}

export function formatObsidianTree(entry: ObsidianTreeEntry, depth = 0): string {
  const indent = '  '.repeat(depth)
  const label =
    entry.type === 'folder'
      ? `${indent}${entry.name}/  (${entry.noteCount ?? 0})`
      : `${indent}${entry.name}`
  const children = (entry.children ?? [])
    .map((child) => formatObsidianTree(child, depth + 1))
    .join('\n')
  return children ? `${label}\n${children}` : label
}

export function formatObsidianWrite(result: ObsidianNoteWriteResult): string {
  return `${result.created ? 'created' : 'updated'}  ${result.path}  ${result.bytes} bytes`
}

export function formatObsidianRename(result: ObsidianRenameResult): string {
  const links =
    result.updatedLinks > 0
      ? `\nrewrote ${result.updatedLinks} link(s) in ${result.updatedNotes.length} note(s)`
      : ''
  return `moved  ${result.from} → ${result.to}${links}`
}

export function formatObsidianDelete(result: ObsidianDeleteResult): string {
  return result.permanent
    ? `deleted  ${result.path}`
    : `trashed  ${result.path} → ${result.trashedTo}`
}

export function formatObsidianDailyNote(result: ObsidianDailyNote): string {
  const state = result.created ? 'created' : result.exists ? 'exists' : 'missing'
  return `${result.date}  ${result.path}  (${state})`
}

export function formatObsidianOpen(result: ObsidianOpenResult): string {
  return `opened ${result.uri}`
}
