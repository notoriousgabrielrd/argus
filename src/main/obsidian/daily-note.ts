import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ObsidianDailyNote, ObsidianVault } from '../../shared/obsidian-types'
import { formatDatePattern, parseDateInput } from './date-format'
import { createNote } from './note-create'
import { getVaultIndex } from './vault-index'
import { withMarkdownExtension } from './vault-paths'

export type DailyNoteSettings = {
  format: string
  folder: string
  template: string | null
}

const DEFAULT_DAILY_FORMAT = 'YYYY-MM-DD'

/** Reads the core Daily Notes plugin config; falls back to Obsidian's defaults. */
export function readDailyNoteSettings(vaultRoot: string): DailyNoteSettings {
  const configPath = path.join(vaultRoot, '.obsidian', 'daily-notes.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return { format: DEFAULT_DAILY_FORMAT, folder: '', template: null }
  }
  const config = (parsed ?? {}) as { format?: unknown; folder?: unknown; template?: unknown }
  return {
    format:
      typeof config.format === 'string' && config.format.trim()
        ? config.format
        : DEFAULT_DAILY_FORMAT,
    folder: typeof config.folder === 'string' ? config.folder.replace(/^\/+|\/+$/g, '') : '',
    template: typeof config.template === 'string' && config.template.trim() ? config.template : null
  }
}

export function dailyNotePath(vault: ObsidianVault, date: Date): string {
  const settings = readDailyNoteSettings(vault.path)
  const name = formatDatePattern(date, settings.format)
  return withMarkdownExtension(settings.folder ? `${settings.folder}/${name}` : name)
}

export type DailyNoteOptions = {
  date?: string
  create?: boolean
}

export function resolveDailyNote(
  vault: ObsidianVault,
  options: DailyNoteOptions = {}
): ObsidianDailyNote {
  const date = parseDateInput(options.date)
  const notePath = dailyNotePath(vault, date)
  const exists = existsSync(path.join(vault.path, notePath))
  const isoDate = formatDatePattern(date, 'YYYY-MM-DD')
  if (exists || !options.create) {
    return { path: notePath, date: isoDate, created: false, exists }
  }
  const settings = readDailyNoteSettings(vault.path)
  const template = settings.template ? findTemplatePath(vault, settings.template) : undefined
  createNote(vault, {
    path: notePath,
    ...(template ? { templatePath: template } : { content: `# ${isoDate}\n` })
  })
  return { path: notePath, date: isoDate, created: true, exists: true }
}

function findTemplatePath(vault: ObsidianVault, template: string): string | undefined {
  const index = getVaultIndex(vault)
  const wanted = withMarkdownExtension(template.replace(/^\/+/, ''))
  return index.notes.has(wanted) ? wanted : undefined
}
