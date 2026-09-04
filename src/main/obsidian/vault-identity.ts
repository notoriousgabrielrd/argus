import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'

/**
 * Vault identity is derived from the folder path rather than Obsidian's own id
 * so a manually added vault and the same folder discovered from `obsidian.json`
 * collapse to one entry.
 */
export function normalizeVaultPath(input: string): string {
  const resolved = path.resolve(input)
  return resolved.length > 1 ? resolved.replace(/[\\/]+$/, '') : resolved
}

function comparablePath(vaultPath: string): string {
  // Why: macOS and Windows resolve paths case-insensitively, so two spellings of
  // the same folder must not register as two vaults.
  return process.platform === 'linux' ? vaultPath : vaultPath.toLowerCase()
}

export function vaultIdForPath(input: string): string {
  return createHash('sha1')
    .update(comparablePath(normalizeVaultPath(input)))
    .digest('hex')
    .slice(0, 12)
}

export function sameVaultPath(left: string, right: string): boolean {
  return comparablePath(normalizeVaultPath(left)) === comparablePath(normalizeVaultPath(right))
}

export function vaultNameForPath(input: string): string {
  return path.basename(normalizeVaultPath(input)) || input
}

export function vaultFolderExists(vaultPath: string): boolean {
  try {
    return statSync(vaultPath).isDirectory()
  } catch {
    return false
  }
}
