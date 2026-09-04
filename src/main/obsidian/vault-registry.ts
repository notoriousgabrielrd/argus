import { ObsidianError } from '../../shared/obsidian-errors'
import type { ObsidianVault } from '../../shared/obsidian-types'
import { discoverObsidianVaults } from './vault-config-discovery'
import {
  readObsidianRegistry,
  writeObsidianRegistry,
  type ObsidianRegistryFile
} from './vault-registry-file'
import {
  normalizeVaultPath,
  sameVaultPath,
  vaultFolderExists,
  vaultIdForPath,
  vaultNameForPath
} from './vault-identity'

type RegistryOptions = {
  userDataPath: string
  discover?: typeof discoverObsidianVaults
}

type VaultDraft = Omit<ObsidianVault, 'isDefault'> & { lastOpenedAt: number | null }

function draftFromPath(
  vaultPath: string,
  source: ObsidianVault['source'],
  extras: { name?: string; openInApp?: boolean; lastOpenedAt?: number | null } = {}
): VaultDraft {
  const normalized = normalizeVaultPath(vaultPath)
  return {
    id: vaultIdForPath(normalized),
    name: extras.name?.trim() || vaultNameForPath(normalized),
    path: normalized,
    source,
    available: vaultFolderExists(normalized),
    lastOpenedAt: extras.lastOpenedAt ?? null,
    ...(extras.openInApp === undefined ? {} : { openInApp: extras.openInApp })
  }
}

export class ObsidianVaultRegistry {
  private readonly userDataPath: string
  private readonly discover: typeof discoverObsidianVaults

  constructor(options: RegistryOptions) {
    this.userDataPath = options.userDataPath
    this.discover = options.discover ?? discoverObsidianVaults
  }

  private drafts(): VaultDraft[] {
    const file = readObsidianRegistry(this.userDataPath)
    const drafts: VaultDraft[] = []
    for (const record of file.vaults) {
      drafts.push(draftFromPath(record.path, 'manual', record.name ? { name: record.name } : {}))
    }
    for (const found of this.discover()) {
      const existing = drafts.find((draft) => sameVaultPath(draft.path, found.path))
      if (existing) {
        existing.openInApp = found.open
        existing.lastOpenedAt = found.lastOpenedAt
        continue
      }
      drafts.push(
        draftFromPath(found.path, 'obsidian-config', {
          openInApp: found.open,
          lastOpenedAt: found.lastOpenedAt
        })
      )
    }
    return drafts
  }

  /**
   * Preference order for the implicit vault: the user's explicit default, then
   * the vault Obsidian currently has open, then the most recently opened one.
   */
  private defaultIdFor(drafts: VaultDraft[], file: ObsidianRegistryFile): string | null {
    const pinned = drafts.find((draft) => draft.id === file.defaultVaultId)
    if (pinned) {
      return pinned.id
    }
    const available = drafts.filter((draft) => draft.available)
    const pool = available.length > 0 ? available : drafts
    const open = pool.find((draft) => draft.openInApp)
    if (open) {
      return open.id
    }
    const ranked = [...pool].sort(
      (left, right) => (right.lastOpenedAt ?? 0) - (left.lastOpenedAt ?? 0)
    )
    return ranked[0]?.id ?? null
  }

  list(): ObsidianVault[] {
    const file = readObsidianRegistry(this.userDataPath)
    const drafts = this.drafts()
    const defaultId = this.defaultIdFor(drafts, file)
    return drafts
      .map(({ lastOpenedAt: _lastOpenedAt, ...vault }) => ({
        ...vault,
        isDefault: vault.id === defaultId
      }))
      .sort(
        (left, right) =>
          Number(right.isDefault) - Number(left.isDefault) || left.name.localeCompare(right.name)
      )
  }

  resolve(selector?: string | null): ObsidianVault {
    const vaults = this.list()
    if (vaults.length === 0) {
      throw new ObsidianError(
        'obsidian_no_vault',
        'No Obsidian vault is known to Argus. Add one with `argus obsidian vault-add <path>`.'
      )
    }
    const wanted = selector?.trim()
    if (!wanted) {
      const fallback = vaults.find((vault) => vault.isDefault) ?? vaults[0]
      return this.requireAvailable(fallback)
    }
    const byId = vaults.filter((vault) => vault.id === wanted)
    if (byId.length === 1) {
      return this.requireAvailable(byId[0])
    }
    const byPath = vaults.filter((vault) => sameVaultPath(vault.path, wanted))
    if (byPath.length === 1) {
      return this.requireAvailable(byPath[0])
    }
    const byName = vaults.filter((vault) => vault.name.toLowerCase() === wanted.toLowerCase())
    if (byName.length === 1) {
      return this.requireAvailable(byName[0])
    }
    if (byName.length > 1) {
      throw new ObsidianError(
        'obsidian_vault_ambiguous',
        `More than one vault is named "${wanted}". Select it by id instead.`,
        { candidates: byName.map((vault) => ({ id: vault.id, path: vault.path })) }
      )
    }
    throw new ObsidianError('obsidian_vault_not_found', `No Obsidian vault matches "${wanted}".`, {
      candidates: vaults.map((vault) => ({ id: vault.id, name: vault.name, path: vault.path }))
    })
  }

  private requireAvailable(vault: ObsidianVault): ObsidianVault {
    if (!vault.available) {
      throw new ObsidianError(
        'obsidian_vault_unavailable',
        `Vault folder is missing on disk: ${vault.path}`
      )
    }
    return vault
  }

  add(vaultPath: string, options: { name?: string; makeDefault?: boolean } = {}): ObsidianVault {
    const normalized = normalizeVaultPath(vaultPath)
    if (!vaultFolderExists(normalized)) {
      throw new ObsidianError('obsidian_vault_unavailable', `Not a folder: ${normalized}`)
    }
    const file = readObsidianRegistry(this.userDataPath)
    const id = vaultIdForPath(normalized)
    const rest = file.vaults.filter((record) => !sameVaultPath(record.path, normalized))
    rest.push({
      id,
      path: normalized,
      ...(options.name?.trim() ? { name: options.name.trim() } : {})
    })
    writeObsidianRegistry(this.userDataPath, {
      version: 1,
      vaults: rest,
      ...(options.makeDefault
        ? { defaultVaultId: id }
        : file.defaultVaultId
          ? { defaultVaultId: file.defaultVaultId }
          : {})
    })
    return this.resolve(id)
  }

  remove(selector: string): ObsidianVault {
    const vault = this.resolveForRemoval(selector)
    const file = readObsidianRegistry(this.userDataPath)
    writeObsidianRegistry(this.userDataPath, {
      version: 1,
      vaults: file.vaults.filter((record) => !sameVaultPath(record.path, vault.path)),
      ...(file.defaultVaultId && file.defaultVaultId !== vault.id
        ? { defaultVaultId: file.defaultVaultId }
        : {})
    })
    return vault
  }

  // Why: removing a vault whose folder was deleted is exactly when removal matters,
  // so availability must not gate it the way it gates read/write selection.
  private resolveForRemoval(selector: string): ObsidianVault {
    const wanted = selector.trim()
    const match = this.list().find(
      (vault) =>
        vault.id === wanted ||
        sameVaultPath(vault.path, wanted) ||
        vault.name.toLowerCase() === wanted.toLowerCase()
    )
    if (!match) {
      throw new ObsidianError('obsidian_vault_not_found', `No Obsidian vault matches "${wanted}".`)
    }
    return match
  }

  setDefault(selector: string): ObsidianVault {
    const vault = this.resolve(selector)
    const file = readObsidianRegistry(this.userDataPath)
    const hasRecord = file.vaults.some((record) => sameVaultPath(record.path, vault.path))
    writeObsidianRegistry(this.userDataPath, {
      version: 1,
      // A discovered vault needs a record of its own before it can be pinned.
      vaults: hasRecord ? file.vaults : [...file.vaults, { id: vault.id, path: vault.path }],
      defaultVaultId: vault.id
    })
    return this.resolve(vault.id)
  }
}
