import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * Obsidian records every vault the desktop app has opened in a single
 * `obsidian.json`. Reading it means the integration works with zero setup for
 * anyone who already uses the app.
 */
export type DiscoveredVault = {
  id: string
  path: string
  open: boolean
  lastOpenedAt: number | null
}

type DiscoveryEnvironment = {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  home?: string
}

export function obsidianConfigPaths(environment: DiscoveryEnvironment = {}): string[] {
  const platform = environment.platform ?? process.platform
  const env = environment.env ?? process.env
  const home = environment.home ?? homedir()
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')]
  }
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    return [path.join(appData, 'obsidian', 'obsidian.json')]
  }
  const configHome = env.XDG_CONFIG_HOME ?? path.join(home, '.config')
  return [
    path.join(configHome, 'obsidian', 'obsidian.json'),
    // Flatpak keeps its own config root, which is where the Flathub build writes.
    path.join(home, '.var', 'app', 'md.obsidian.Obsidian', 'config', 'obsidian.json'),
    path.join(home, 'snap', 'obsidian', 'current', '.config', 'obsidian', 'obsidian.json')
  ]
}

function parseVaultEntries(raw: string): DiscoveredVault[] {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') {
    return []
  }
  const vaults = (parsed as { vaults?: unknown }).vaults
  if (!vaults || typeof vaults !== 'object') {
    return []
  }
  const entries: DiscoveredVault[] = []
  for (const [id, value] of Object.entries(vaults as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue
    }
    const vaultPath = (value as { path?: unknown }).path
    if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
      continue
    }
    const timestamp = (value as { ts?: unknown }).ts
    entries.push({
      id,
      path: path.resolve(vaultPath),
      open: (value as { open?: unknown }).open === true,
      lastOpenedAt: typeof timestamp === 'number' ? timestamp : null
    })
  }
  return entries
}

/** Never throws: a missing or corrupt Obsidian config just means no discovery. */
export function discoverObsidianVaults(environment: DiscoveryEnvironment = {}): DiscoveredVault[] {
  const seen = new Set<string>()
  const discovered: DiscoveredVault[] = []
  for (const configPath of obsidianConfigPaths(environment)) {
    let raw: string
    try {
      raw = readFileSync(configPath, 'utf-8')
    } catch {
      continue
    }
    let entries: DiscoveredVault[]
    try {
      entries = parseVaultEntries(raw)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (seen.has(entry.id)) {
        continue
      }
      seen.add(entry.id)
      discovered.push(entry)
    }
  }
  return discovered
}
