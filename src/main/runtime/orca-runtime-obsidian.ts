import type {
  ObsidianDailyNote,
  ObsidianDeleteResult,
  ObsidianFrontmatter,
  ObsidianLinkReport,
  ObsidianNote,
  ObsidianNoteFilter,
  ObsidianNoteList,
  ObsidianNoteWriteResult,
  ObsidianOpenResult,
  ObsidianRenameResult,
  ObsidianSearchHit,
  ObsidianTagCount,
  ObsidianTreeEntry,
  ObsidianVault,
  ObsidianVaultStats
} from '../../shared/obsidian-types'
import { ObsidianError } from '../../shared/obsidian-errors'
import { openInObsidian } from '../obsidian/app-open'
import { resolveDailyNote } from '../obsidian/daily-note'
import { createNote } from '../obsidian/note-create'
import { editNote, type EditMode } from '../obsidian/note-edit'
import { coercePropertyValue } from '../obsidian/note-frontmatter'
import { listNotes } from '../obsidian/note-list'
import { noteLinkReport, unresolvedVaultLinks } from '../obsidian/note-links-report'
import { removeNoteProperty, setNoteProperty } from '../obsidian/note-properties'
import { readNote } from '../obsidian/note-read'
import { renameNote } from '../obsidian/note-rename'
import { searchVault } from '../obsidian/note-search'
import { deleteNote } from '../obsidian/note-trash'
import { invalidateVaultIndex } from '../obsidian/vault-index'
import { ObsidianVaultRegistry } from '../obsidian/vault-registry'
import type { DiscoveredVault } from '../obsidian/vault-config-discovery'
import { vaultStats, vaultTags } from '../obsidian/vault-stats'
import { vaultTree } from '../obsidian/vault-tree'

export type RuntimeObsidianCommandHost = {
  getUserDataPath(): string
  openExternalUrl(url: string): Promise<void>
  /** Overridable so tests never pick up the developer's real Obsidian vaults. */
  discoverVaults?: () => DiscoveredVault[]
}

type VaultScoped = { vault?: string }

export type ObsidianPropertyType = 'text' | 'number' | 'checkbox' | 'list' | 'date'

function frontmatterFromPairs(
  pairs: readonly string[] | undefined,
  type?: ObsidianPropertyType
): ObsidianFrontmatter {
  const frontmatter: ObsidianFrontmatter = {}
  for (const pair of pairs ?? []) {
    const separator = pair.indexOf('=')
    if (separator <= 0) {
      throw new ObsidianError(
        'obsidian_invalid_argument',
        `Property must be written as key=value, got "${pair}".`
      )
    }
    frontmatter[pair.slice(0, separator).trim()] = coercePropertyValue(
      pair.slice(separator + 1),
      type
    )
  }
  return frontmatter
}

export class RuntimeObsidianCommands {
  // Why: the runtime is constructed before Electron's app is ready in tests and
  // in headless entrypoints, so the userData path is read on first use, not here.
  private cachedRegistry: ObsidianVaultRegistry | null = null

  constructor(private readonly host: RuntimeObsidianCommandHost) {}

  private get registry(): ObsidianVaultRegistry {
    this.cachedRegistry ??= new ObsidianVaultRegistry({
      userDataPath: this.host.getUserDataPath(),
      ...(this.host.discoverVaults ? { discover: this.host.discoverVaults } : {})
    })
    return this.cachedRegistry
  }

  private vault(params: VaultScoped): ObsidianVault {
    return this.registry.resolve(params.vault)
  }

  obsidianListVaults(): { vaults: ObsidianVault[] } {
    return { vaults: this.registry.list() }
  }

  obsidianAddVault(params: { path: string; name?: string; makeDefault?: boolean }): {
    vault: ObsidianVault
  } {
    return { vault: this.registry.add(params.path, params) }
  }

  obsidianRemoveVault(params: { vault: string }): { vault: ObsidianVault } {
    const vault = this.registry.remove(params.vault)
    invalidateVaultIndex(vault.id)
    return { vault }
  }

  obsidianSetDefaultVault(params: { vault: string }): { vault: ObsidianVault } {
    return { vault: this.registry.setDefault(params.vault) }
  }

  obsidianVaultInfo(params: VaultScoped): ObsidianVaultStats {
    return vaultStats(this.vault(params))
  }

  obsidianListNotes(params: VaultScoped & ObsidianNoteFilter): ObsidianNoteList {
    const { vault: _vault, ...filter } = params
    return listNotes(this.vault(params), filter)
  }

  obsidianReadNote(
    params: VaultScoped & {
      note: string
      section?: string
      includeContent?: boolean
      includeBacklinks?: boolean
    }
  ): ObsidianNote {
    return readNote(this.vault(params), { ...params, selector: params.note })
  }

  obsidianSearchNotes(
    params: VaultScoped & {
      query: string
      regex?: boolean
      caseSensitive?: boolean
      folder?: string
      tag?: string[]
      limit?: number
      titlesOnly?: boolean
    }
  ): { hits: ObsidianSearchHit[] } {
    return { hits: searchVault(this.vault(params), params) }
  }

  obsidianNoteLinks(params: VaultScoped & { note: string }): ObsidianLinkReport {
    return noteLinkReport(this.vault(params), params.note)
  }

  obsidianUnresolvedLinks(params: VaultScoped & { limit?: number }): {
    links: { path: string; target: string; line: number }[]
  } {
    return { links: unresolvedVaultLinks(this.vault(params), params.limit) }
  }

  obsidianTags(params: VaultScoped & { prefix?: string; limit?: number }): {
    tags: ObsidianTagCount[]
  } {
    return { tags: vaultTags(this.vault(params), params) }
  }

  obsidianTree(
    params: VaultScoped & { folder?: string; depth?: number; includeNotes?: boolean }
  ): ObsidianTreeEntry {
    return vaultTree(this.vault(params), params)
  }

  obsidianDailyNote(params: VaultScoped & { date?: string; create?: boolean }): ObsidianDailyNote {
    return resolveDailyNote(this.vault(params), params)
  }

  obsidianCreateNote(
    params: VaultScoped & {
      path: string
      content?: string
      property?: string[]
      overwrite?: boolean
      template?: string
    }
  ): ObsidianNoteWriteResult {
    return createNote(this.vault(params), {
      path: params.path,
      ...(params.content === undefined ? {} : { content: params.content }),
      ...(params.template ? { templatePath: params.template } : {}),
      ...(params.overwrite ? { overwrite: true } : {}),
      frontmatter: frontmatterFromPairs(params.property)
    })
  }

  obsidianEditNote(
    params: VaultScoped & { note: string; content: string; mode: EditMode; heading?: string }
  ): ObsidianNoteWriteResult {
    return editNote(this.vault(params), { ...params, selector: params.note })
  }

  obsidianSetProperty(
    params: VaultScoped & { note: string; key: string; value: string; type?: ObsidianPropertyType }
  ): ObsidianNoteWriteResult {
    return setNoteProperty(
      this.vault(params),
      params.note,
      params.key,
      coercePropertyValue(params.value, params.type)
    )
  }

  obsidianRemoveProperty(
    params: VaultScoped & { note: string; key: string }
  ): ObsidianNoteWriteResult {
    return removeNoteProperty(this.vault(params), params.note, params.key)
  }

  obsidianRenameNote(
    params: VaultScoped & {
      note: string
      to: string
      asFolder?: boolean
      updateLinks?: boolean
      overwrite?: boolean
    }
  ): ObsidianRenameResult {
    return renameNote(this.vault(params), { ...params, selector: params.note })
  }

  obsidianDeleteNote(
    params: VaultScoped & { note: string; permanent?: boolean }
  ): ObsidianDeleteResult {
    return deleteNote(this.vault(params), params.note, params)
  }

  async obsidianOpenNote(params: VaultScoped & { note?: string }): Promise<ObsidianOpenResult> {
    return openInObsidian(this.vault(params), {
      ...(params.note ? { selector: params.note } : {}),
      openExternal: (uri) => this.host.openExternalUrl(uri)
    })
  }
}
