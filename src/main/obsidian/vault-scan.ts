import { readdirSync, statSync, type Dirent, type Stats } from 'node:fs'
import path from 'node:path'
import { isMarkdownPath, isReservedVaultPath, toPosixPath } from './vault-paths'

export type ScannedFile = {
  /** Vault-relative POSIX path. */
  path: string
  absolutePath: string
  size: number
  modifiedMs: number
  createdMs: number
  isNote: boolean
}

export type VaultScan = {
  files: ScannedFile[]
  folders: string[]
  truncated: boolean
}

/** Guard against pointing the integration at a home directory by mistake. */
export const VAULT_SCAN_FILE_LIMIT = 50_000

function shouldSkipDirectory(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}

export function scanVault(vaultRoot: string, limit = VAULT_SCAN_FILE_LIMIT): VaultScan {
  const files: ScannedFile[] = []
  const folders: string[] = []
  const queue: string[] = ['']
  let truncated = false
  while (queue.length > 0 && !truncated) {
    const relativeDir = queue.shift() as string
    const absoluteDir = relativeDir ? path.join(vaultRoot, relativeDir) : vaultRoot
    let entries: Dirent[]
    try {
      entries = readdirSync(absoluteDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name) || isReservedVaultPath(relative)) {
          continue
        }
        folders.push(relative)
        queue.push(relative)
        continue
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue
      }
      if (entry.name.startsWith('.')) {
        continue
      }
      const absolutePath = path.join(absoluteDir, entry.name)
      let stats: Stats
      try {
        stats = statSync(absolutePath)
      } catch {
        continue
      }
      if (!stats.isFile()) {
        continue
      }
      files.push({
        path: toPosixPath(relative),
        absolutePath,
        size: stats.size,
        modifiedMs: stats.mtimeMs,
        createdMs: stats.birthtimeMs || stats.ctimeMs,
        isNote: isMarkdownPath(entry.name)
      })
      if (files.length >= limit) {
        truncated = true
        break
      }
    }
  }
  return { files, folders, truncated }
}
