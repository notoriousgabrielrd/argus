import { existsSync } from 'node:fs'
import path from 'node:path'
import { ObsidianError } from '../../shared/obsidian-errors'
import type { ObsidianOpenResult, ObsidianVault } from '../../shared/obsidian-types'
import { findNote } from './note-lookup'
import { getVaultIndex } from './vault-index'

export function obsidianOpenUri(vault: ObsidianVault, notePath?: string): string {
  const params = new URLSearchParams({ vault: vault.name })
  if (notePath) {
    params.set('file', notePath.replace(/\.(?:md|markdown)$/i, ''))
  }
  return `obsidian://open?${params.toString()}`
}

export type OpenInAppOptions = {
  selector?: string
  openExternal: (uri: string) => Promise<void>
}

/**
 * Hands the note to the desktop app through Obsidian's own URI scheme, which
 * needs no plugin. The vault must still exist locally for the app to open it.
 */
export async function openInObsidian(
  vault: ObsidianVault,
  options: OpenInAppOptions
): Promise<ObsidianOpenResult> {
  const notePath = options.selector
    ? findNote(getVaultIndex(vault), options.selector).path
    : undefined
  if (notePath && !existsSync(path.join(vault.path, notePath))) {
    throw new ObsidianError('obsidian_note_not_found', `"${notePath}" is missing on disk.`)
  }
  const uri = obsidianOpenUri(vault, notePath)
  try {
    await options.openExternal(uri)
  } catch (error) {
    throw new ObsidianError(
      'obsidian_app_unavailable',
      `Could not hand the vault to Obsidian: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  return { uri, opened: true }
}
