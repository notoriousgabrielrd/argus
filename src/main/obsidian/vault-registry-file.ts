import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type ManualVaultRecord = {
  id: string
  name?: string
  path: string
}

export type ObsidianRegistryFile = {
  version: 1
  vaults: ManualVaultRecord[]
  defaultVaultId?: string
}

export const OBSIDIAN_REGISTRY_FILENAME = 'obsidian-vaults.json'

const EMPTY_REGISTRY: ObsidianRegistryFile = { version: 1, vaults: [] }

export function obsidianRegistryPath(userDataPath: string): string {
  return path.join(userDataPath, OBSIDIAN_REGISTRY_FILENAME)
}

function normalizeRecords(value: unknown): ManualVaultRecord[] {
  if (!Array.isArray(value)) {
    return []
  }
  const records: ManualVaultRecord[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const id = (entry as { id?: unknown }).id
    const vaultPath = (entry as { path?: unknown }).path
    if (typeof id !== 'string' || !id.trim()) {
      continue
    }
    if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
      continue
    }
    const name = (entry as { name?: unknown }).name
    records.push({
      id,
      path: path.resolve(vaultPath),
      ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {})
    })
  }
  return records
}

/** A corrupt or absent registry reads as empty so vault discovery still works. */
export function readObsidianRegistry(userDataPath: string): ObsidianRegistryFile {
  let raw: string
  try {
    raw = readFileSync(obsidianRegistryPath(userDataPath), 'utf-8')
  } catch {
    return { ...EMPTY_REGISTRY, vaults: [] }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...EMPTY_REGISTRY, vaults: [] }
  }
  const defaultVaultId = (parsed as { defaultVaultId?: unknown } | null)?.defaultVaultId
  return {
    version: 1,
    vaults: normalizeRecords((parsed as { vaults?: unknown } | null)?.vaults),
    ...(typeof defaultVaultId === 'string' && defaultVaultId.trim()
      ? { defaultVaultId: defaultVaultId.trim() }
      : {})
  }
}

// Why: a truncated registry would silently drop the user's manually added
// vaults, so publish through a sibling temp file and rename.
export function writeObsidianRegistry(userDataPath: string, file: ObsidianRegistryFile): void {
  const target = obsidianRegistryPath(userDataPath)
  mkdirSync(path.dirname(target), { recursive: true })
  const tempPath = `${target}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 })
  renameSync(tempPath, target)
}
