import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { ObsidianError } from '../../shared/obsidian-errors'

/** Folders Obsidian owns; agents must never read or write through them. */
export const RESERVED_VAULT_FOLDERS = ['.obsidian', '.trash', '.git'] as const

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const

export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/')
}

export function vaultRelativePath(vaultRoot: string, absolutePath: string): string {
  return toPosixPath(path.relative(vaultRoot, absolutePath))
}

export function isReservedVaultPath(relativePath: string): boolean {
  const [head] = toPosixPath(relativePath).split('/')
  return (RESERVED_VAULT_FOLDERS as readonly string[]).includes(head)
}

export function isMarkdownPath(filePath: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(path.extname(filePath).toLowerCase())
}

export function withMarkdownExtension(notePath: string): string {
  return isMarkdownPath(notePath) ? notePath : `${notePath}.md`
}

/**
 * An absolute path is accepted only when it already points inside the vault.
 * Obsidian also writes vault-root links as `/Folder/Note.md`, so that spelling
 * is honoured when the file it names actually exists in the vault.
 */
function resolveCandidate(root: string, trimmed: string): string {
  const asVaultRelative = path.resolve(root, toPosixPath(trimmed).replace(/^\/+/, ''))
  if (!path.isAbsolute(trimmed)) {
    return asVaultRelative
  }
  const asAbsolute = path.resolve(trimmed)
  if (!escapes(root, asAbsolute)) {
    return asAbsolute
  }
  if (existsSync(asVaultRelative)) {
    return asVaultRelative
  }
  throw new ObsidianError('obsidian_path_escape', `Path escapes the vault: ${trimmed}`)
}

function escapes(vaultRoot: string, candidate: string): boolean {
  const relative = path.relative(vaultRoot, candidate)
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
}

/**
 * Resolves a vault-relative path to an absolute one, refusing anything that
 * would land outside the vault. Symlinks are resolved before the check so a
 * link planted inside the vault cannot be used to reach the wider filesystem.
 */
export function resolveInVault(vaultRoot: string, relativePath: string): string {
  const trimmed = relativePath.trim()
  if (!trimmed) {
    throw new ObsidianError('obsidian_invalid_argument', 'A note path is required.')
  }
  const root = path.resolve(vaultRoot)
  const candidate = resolveCandidate(root, trimmed)
  if (escapes(root, candidate)) {
    throw new ObsidianError('obsidian_path_escape', `Path escapes the vault: ${trimmed}`)
  }
  const relative = vaultRelativePath(root, candidate)
  if (isReservedVaultPath(relative)) {
    throw new ObsidianError(
      'obsidian_path_reserved',
      `"${relative}" lives in a folder Obsidian owns and is not writable through Argus.`
    )
  }
  assertRealPathInsideVault(root, candidate)
  return candidate
}

function assertRealPathInsideVault(root: string, candidate: string): void {
  let realRoot: string
  try {
    realRoot = realpathSync(root)
  } catch {
    return
  }
  let realCandidate: string
  try {
    realCandidate = realpathSync(candidate)
  } catch {
    // A path that does not exist yet cannot be a symlink; creation is checked
    // against its parent instead.
    let parent = path.dirname(candidate)
    try {
      parent = realpathSync(parent)
    } catch {
      return
    }
    if (escapes(realRoot, path.join(parent, path.basename(candidate)))) {
      throw new ObsidianError('obsidian_path_escape', `Path escapes the vault: ${candidate}`)
    }
    return
  }
  if (escapes(realRoot, realCandidate)) {
    throw new ObsidianError('obsidian_path_escape', `Path escapes the vault: ${candidate}`)
  }
}
