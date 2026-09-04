import type {
  ObsidianDeleteResult,
  ObsidianNoteWriteResult,
  ObsidianRenameResult
} from '../../shared/obsidian-types'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { formatObsidianDelete, formatObsidianRename, formatObsidianWrite } from '../obsidian-format'
import { booleanFlag, optionalString, readContent, repeated, vaultScope } from '../obsidian-request'

async function edit(ctx: HandlerContext, mode: 'append' | 'prepend' | 'replace'): Promise<void> {
  const result = await ctx.client.call<ObsidianNoteWriteResult>('obsidian.editNote', {
    ...vaultScope(ctx),
    note: getRequiredStringFlag(ctx.flags, 'note'),
    content: (await readContent(ctx, { required: true })) as string,
    mode,
    ...optionalString(ctx, 'heading')
  })
  printResult(result, ctx.json, formatObsidianWrite)
}

async function move(ctx: HandlerContext, asFolder: boolean): Promise<void> {
  const result = await ctx.client.call<ObsidianRenameResult>('obsidian.renameNote', {
    ...vaultScope(ctx),
    note: getRequiredStringFlag(ctx.flags, 'note'),
    to: getRequiredStringFlag(ctx.flags, 'to'),
    ...(asFolder ? { asFolder: true } : {}),
    ...(booleanFlag(ctx, 'no-update-links') ? { updateLinks: false } : {}),
    ...(booleanFlag(ctx, 'overwrite') ? { overwrite: true } : {})
  })
  printResult(result, ctx.json, formatObsidianRename)
}

export const OBSIDIAN_WRITE_HANDLERS: Record<string, CommandHandler> = {
  'obsidian create': async (ctx) => {
    const content = await readContent(ctx, { required: false })
    const property = repeated(ctx, 'property')
    const result = await ctx.client.call<ObsidianNoteWriteResult>('obsidian.createNote', {
      ...vaultScope(ctx),
      path: getRequiredStringFlag(ctx.flags, 'path'),
      ...(content === undefined ? {} : { content }),
      ...(property.length > 0 ? { property } : {}),
      ...(getOptionalStringFlag(ctx.flags, 'template')
        ? { template: getRequiredStringFlag(ctx.flags, 'template') }
        : {}),
      ...(booleanFlag(ctx, 'overwrite') ? { overwrite: true } : {})
    })
    printResult(result, ctx.json, formatObsidianWrite)
  },
  'obsidian append': async (ctx) => edit(ctx, 'append'),
  'obsidian prepend': async (ctx) => edit(ctx, 'prepend'),
  'obsidian replace': async (ctx) => edit(ctx, 'replace'),
  'obsidian set-property': async (ctx) => {
    const result = await ctx.client.call<ObsidianNoteWriteResult>('obsidian.setProperty', {
      ...vaultScope(ctx),
      note: getRequiredStringFlag(ctx.flags, 'note'),
      key: getRequiredStringFlag(ctx.flags, 'key'),
      value: getRequiredStringFlag(ctx.flags, 'value'),
      ...optionalString(ctx, 'type')
    })
    printResult(result, ctx.json, formatObsidianWrite)
  },
  'obsidian remove-property': async (ctx) => {
    const result = await ctx.client.call<ObsidianNoteWriteResult>('obsidian.removeProperty', {
      ...vaultScope(ctx),
      note: getRequiredStringFlag(ctx.flags, 'note'),
      key: getRequiredStringFlag(ctx.flags, 'key')
    })
    printResult(result, ctx.json, formatObsidianWrite)
  },
  'obsidian rename': async (ctx) => move(ctx, false),
  'obsidian move': async (ctx) => move(ctx, true),
  'obsidian delete': async (ctx) => {
    const result = await ctx.client.call<ObsidianDeleteResult>('obsidian.deleteNote', {
      ...vaultScope(ctx),
      note: getRequiredStringFlag(ctx.flags, 'note'),
      ...(booleanFlag(ctx, 'permanent') ? { permanent: true } : {})
    })
    printResult(result, ctx.json, formatObsidianDelete)
  }
}
