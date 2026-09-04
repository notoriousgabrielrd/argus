import { existsSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import { ObsidianError } from '../../shared/obsidian-errors'
import type { ObsidianRenameResult, ObsidianVault } from '../../shared/obsidian-types'
import { rewriteLinksInText, type LinkRewrite } from './note-link-rewrite'
import { buildLinkResolutionIndex, resolveLinkTarget } from './note-link-resolution'
import { findNote } from './note-lookup'
import { readNoteFile } from './note-read'
import { writeNoteFile } from './note-file-write'
import { getVaultIndex, invalidateVaultIndex } from './vault-index'
import { resolveInVault, withMarkdownExtension } from './vault-paths'

export type RenameNoteOptions = {
  selector: string
  /** Destination path, or a destination folder when `asFolder` is set. */
  to: string
  asFolder?: boolean
  updateLinks?: boolean
  overwrite?: boolean
}

function destinationPath(sourcePath: string, options: RenameNoteOptions): string {
  if (!options.asFolder) {
    return withMarkdownExtension(options.to)
  }
  const folder = options.to.replace(/^\/+|\/+$/g, '')
  const fileName = sourcePath.split('/').pop() as string
  return folder ? `${folder}/${fileName}` : fileName
}

export function renameNote(vault: ObsidianVault, options: RenameNoteOptions): ObsidianRenameResult {
  const index = getVaultIndex(vault)
  const note = findNote(index, options.selector)
  const target = destinationPath(note.path, options)
  const targetAbsolute = resolveInVault(vault.path, target)
  if (target === note.path) {
    throw new ObsidianError('obsidian_invalid_argument', 'Destination matches the current path.')
  }
  if (existsSync(targetAbsolute) && !options.overwrite) {
    throw new ObsidianError('obsidian_note_exists', `"${target}" already exists in this vault.`)
  }
  mkdirSync(path.dirname(targetAbsolute), { recursive: true })
  renameSync(note.absolutePath, targetAbsolute)
  invalidateVaultIndex(vault.id)
  if (options.updateLinks === false) {
    return { from: note.path, to: target, updatedNotes: [], updatedLinks: 0 }
  }
  const rewritten = rewriteBacklinks(vault, note.path, target)
  return { from: note.path, to: target, ...rewritten }
}

function rewriteBacklinks(
  vault: ObsidianVault,
  fromPath: string,
  toPath: string
): { updatedNotes: string[]; updatedLinks: number } {
  const index = getVaultIndex(vault)
  const paths = [...index.notes.keys()]
  // Resolution runs against the post-move vault, so a link still pointing at the
  // old name resolves to nothing — hence the explicit old-name mapping below.
  const resolution = buildLinkResolutionIndex([...paths, fromPath])
  const baseName = (toPath.split('/').pop() as string).replace(/\.(?:md|markdown)$/i, '')
  const bareNameCollisions = paths.filter(
    (candidate) =>
      (candidate.split('/').pop() as string).replace(/\.(?:md|markdown)$/i, '').toLowerCase() ===
      baseName.toLowerCase()
  ).length
  const rewrite: LinkRewrite = { fromPath, toPath, preferBareName: bareNameCollisions <= 1 }
  const updatedNotes: string[] = []
  let updatedLinks = 0
  for (const note of index.notes.values()) {
    if (note.path === toPath) {
      continue
    }
    const raw = readNoteFile(vault.path, note)
    const result = rewriteLinksInText(raw, note.path, rewrite, (target, sourcePath) =>
      resolveLinkTarget(resolution, target, sourcePath)
    )
    if (result.replacements === 0) {
      continue
    }
    writeNoteFile(vault, note.absolutePath, result.text)
    updatedNotes.push(note.path)
    updatedLinks += result.replacements
  }
  invalidateVaultIndex(vault.id)
  return { updatedNotes, updatedLinks }
}
