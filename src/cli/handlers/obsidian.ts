import type {
  ObsidianDailyNote,
  ObsidianLinkReport,
  ObsidianNote,
  ObsidianNoteList,
  ObsidianOpenResult,
  ObsidianSearchHit,
  ObsidianTagCount,
  ObsidianTreeEntry,
  ObsidianVault,
  ObsidianVaultStats
} from '../../shared/obsidian-types'
import type { CommandHandler } from '../dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { printResult } from '../format'
import {
  formatObsidianDailyNote,
  formatObsidianLinks,
  formatObsidianNote,
  formatObsidianNoteList,
  formatObsidianOpen,
  formatObsidianSearch,
  formatObsidianTags,
  formatObsidianTree,
  formatObsidianUnresolvedLinks,
  formatObsidianVault,
  formatObsidianVaultInfo,
  formatObsidianVaults
} from '../obsidian-format'
import {
  booleanFlag,
  optionalLimit,
  optionalString,
  repeated,
  vaultScope
} from '../obsidian-request'

export const OBSIDIAN_READ_HANDLERS: Record<string, CommandHandler> = {
  'obsidian vaults': async (ctx) => {
    const result = await ctx.client.call<{ vaults: ObsidianVault[] }>('obsidian.listVaults')
    printResult(result, ctx.json, formatObsidianVaults)
  },
  'obsidian vault-add': async (ctx) => {
    const result = await ctx.client.call<{ vault: ObsidianVault }>('obsidian.addVault', {
      path: getRequiredStringFlag(ctx.flags, 'path'),
      ...optionalString(ctx, 'name'),
      ...(booleanFlag(ctx, 'make-default') ? { makeDefault: true } : {})
    })
    printResult(result, ctx.json, formatObsidianVault)
  },
  'obsidian vault-remove': async (ctx) => {
    const result = await ctx.client.call<{ vault: ObsidianVault }>('obsidian.removeVault', {
      vault: getRequiredStringFlag(ctx.flags, 'vault')
    })
    printResult(result, ctx.json, formatObsidianVault)
  },
  'obsidian vault-default': async (ctx) => {
    const result = await ctx.client.call<{ vault: ObsidianVault }>('obsidian.setDefaultVault', {
      vault: getRequiredStringFlag(ctx.flags, 'vault')
    })
    printResult(result, ctx.json, formatObsidianVault)
  },
  'obsidian info': async (ctx) => {
    const result = await ctx.client.call<ObsidianVaultStats>('obsidian.vaultInfo', vaultScope(ctx))
    printResult(result, ctx.json, formatObsidianVaultInfo)
  },
  'obsidian notes': async (ctx) => {
    const tag = repeated(ctx, 'tag')
    const property = repeated(ctx, 'property')
    const hasProperty = repeated(ctx, 'has-property')
    const result = await ctx.client.call<ObsidianNoteList>('obsidian.listNotes', {
      ...vaultScope(ctx),
      ...optionalString(ctx, 'folder'),
      ...(tag.length > 0 ? { tag } : {}),
      ...(property.length > 0 ? { property } : {}),
      ...(hasProperty.length > 0 ? { hasProperty } : {}),
      ...(getOptionalStringFlag(ctx.flags, 'modified-since')
        ? { modifiedSince: getRequiredStringFlag(ctx.flags, 'modified-since') }
        : {}),
      ...(getOptionalStringFlag(ctx.flags, 'name')
        ? { namePattern: getRequiredStringFlag(ctx.flags, 'name') }
        : {}),
      ...(getOptionalStringFlag(ctx.flags, 'sort')
        ? { sort: getRequiredStringFlag(ctx.flags, 'sort') }
        : {}),
      ...(booleanFlag(ctx, 'desc') ? { desc: true } : {}),
      ...optionalLimit(ctx)
    })
    printResult(result, ctx.json, formatObsidianNoteList)
  },
  'obsidian read': async (ctx) => {
    const result = await ctx.client.call<ObsidianNote>('obsidian.readNote', {
      ...vaultScope(ctx),
      note: getRequiredStringFlag(ctx.flags, 'note'),
      ...optionalString(ctx, 'section'),
      ...(booleanFlag(ctx, 'no-content') ? { includeContent: false } : {}),
      ...(booleanFlag(ctx, 'no-backlinks') ? { includeBacklinks: false } : {})
    })
    printResult(result, ctx.json, formatObsidianNote)
  },
  'obsidian search': async (ctx) => {
    const tag = repeated(ctx, 'tag')
    const result = await ctx.client.call<{ hits: ObsidianSearchHit[] }>('obsidian.search', {
      ...vaultScope(ctx),
      query: getRequiredStringFlag(ctx.flags, 'query'),
      ...optionalString(ctx, 'folder'),
      ...(tag.length > 0 ? { tag } : {}),
      ...(booleanFlag(ctx, 'regex') ? { regex: true } : {}),
      ...(booleanFlag(ctx, 'case-sensitive') ? { caseSensitive: true } : {}),
      ...(booleanFlag(ctx, 'titles-only') ? { titlesOnly: true } : {}),
      ...optionalLimit(ctx)
    })
    printResult(result, ctx.json, formatObsidianSearch)
  },
  'obsidian links': async (ctx) => {
    const note = getOptionalStringFlag(ctx.flags, 'note')
    if (!note) {
      const result = await ctx.client.call<{
        links: { path: string; target: string; line: number }[]
      }>('obsidian.unresolvedLinks', { ...vaultScope(ctx), ...optionalLimit(ctx) })
      printResult(result, ctx.json, formatObsidianUnresolvedLinks)
      return
    }
    const result = await ctx.client.call<ObsidianLinkReport>('obsidian.noteLinks', {
      ...vaultScope(ctx),
      note
    })
    printResult(result, ctx.json, formatObsidianLinks)
  },
  'obsidian tags': async (ctx) => {
    const result = await ctx.client.call<{ tags: ObsidianTagCount[] }>('obsidian.tags', {
      ...vaultScope(ctx),
      ...optionalString(ctx, 'prefix'),
      ...optionalLimit(ctx)
    })
    printResult(result, ctx.json, formatObsidianTags)
  },
  'obsidian tree': async (ctx) => {
    const depth = getOptionalPositiveIntegerFlag(ctx.flags, 'depth')
    const result = await ctx.client.call<ObsidianTreeEntry>('obsidian.tree', {
      ...vaultScope(ctx),
      ...optionalString(ctx, 'folder'),
      ...(depth === undefined ? {} : { depth }),
      ...(booleanFlag(ctx, 'include-notes') ? { includeNotes: true } : {})
    })
    printResult(result, ctx.json, (value) => formatObsidianTree(value))
  },
  'obsidian daily': async (ctx) => {
    const result = await ctx.client.call<ObsidianDailyNote>('obsidian.dailyNote', {
      ...vaultScope(ctx),
      ...optionalString(ctx, 'date'),
      ...(booleanFlag(ctx, 'create') ? { create: true } : {})
    })
    printResult(result, ctx.json, formatObsidianDailyNote)
  },
  'obsidian open': async (ctx) => {
    const note = getOptionalStringFlag(ctx.flags, 'note')
    const result = await ctx.client.call<ObsidianOpenResult>('obsidian.openNote', {
      ...vaultScope(ctx),
      ...(note ? { note } : {})
    })
    printResult(result, ctx.json, formatObsidianOpen)
  }
}
