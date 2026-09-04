import { existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { ObsidianError } from '../../shared/obsidian-errors'
import type { ObsidianDeleteResult, ObsidianVault } from '../../shared/obsidian-types'
import { findNote } from './note-lookup'
import { getVaultIndex, invalidateVaultIndex } from './vault-index'
import { toPosixPath } from './vault-paths'

/** Obsidian's own local trash folder, so a deletion is recoverable in the app. */
const VAULT_TRASH_FOLDER = '.trash'

function uniqueTrashTarget(trashRoot: string, relativePath: string): string {
  const candidate = path.join(trashRoot, relativePath)
  if (!existsSync(candidate)) {
    return candidate
  }
  const extension = path.extname(candidate)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${candidate.slice(0, candidate.length - extension.length)}.${stamp}${extension}`
}

export function deleteNote(
  vault: ObsidianVault,
  selector: string,
  options: { permanent?: boolean } = {}
): ObsidianDeleteResult {
  const note = findNote(getVaultIndex(vault), selector)
  if (options.permanent) {
    try {
      unlinkSync(note.absolutePath)
    } catch (error) {
      throw new ObsidianError(
        'obsidian_error',
        `Could not delete "${note.path}": ${error instanceof Error ? error.message : String(error)}`
      )
    }
    invalidateVaultIndex(vault.id)
    return { path: note.path, trashedTo: null, permanent: true }
  }
  const trashRoot = path.join(vault.path, VAULT_TRASH_FOLDER)
  const target = uniqueTrashTarget(trashRoot, note.path)
  mkdirSync(path.dirname(target), { recursive: true })
  try {
    renameSync(note.absolutePath, target)
  } catch (error) {
    throw new ObsidianError(
      'obsidian_error',
      `Could not move "${note.path}" to the vault trash: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  invalidateVaultIndex(vault.id)
  return {
    path: note.path,
    trashedTo: toPosixPath(path.relative(vault.path, target)),
    permanent: false
  }
}
