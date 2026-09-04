import { z } from 'zod'
import {
  OBSIDIAN_MAX_LIST_LIMIT,
  OBSIDIAN_MAX_WRITE_BYTES
} from '../../../../shared/obsidian-types'

const NOTE_SELECTOR_MAX = 2_048

export const VaultScope = { vault: z.string().min(1).max(NOTE_SELECTOR_MAX).optional() }

export const NoteSelector = z.string().min(1).max(NOTE_SELECTOR_MAX)

// Why: a vault-scoped read is meaningful with no parameters at all, so the
// whole object stays optional rather than forcing callers to send `{}`.
export const VaultOnly = z.object(VaultScope).optional()

export const VaultRequired = z.object({ vault: z.string().min(1).max(NOTE_SELECTOR_MAX) })

export const AddVault = z.object({
  path: z.string().min(1).max(4_096),
  name: z.string().min(1).max(200).optional(),
  makeDefault: z.boolean().optional()
})

export const ListNotes = z
  .object({
    ...VaultScope,
    folder: z.string().max(1_024).optional(),
    tag: z.array(z.string().min(1).max(200)).max(20).optional(),
    property: z.array(z.string().min(1).max(1_024)).max(20).optional(),
    hasProperty: z.array(z.string().min(1).max(200)).max(20).optional(),
    modifiedSince: z.string().min(1).max(64).optional(),
    namePattern: z.string().max(400).optional(),
    sort: z.enum(['modified', 'created', 'name', 'path', 'size']).optional(),
    desc: z.boolean().optional(),
    limit: z.number().int().min(1).max(OBSIDIAN_MAX_LIST_LIMIT).optional()
  })
  .optional()

export const ReadNote = z.object({
  ...VaultScope,
  note: NoteSelector,
  section: z.string().max(400).optional(),
  includeContent: z.boolean().optional(),
  includeBacklinks: z.boolean().optional()
})

export const SearchNotes = z.object({
  ...VaultScope,
  query: z.string().min(1).max(2_048),
  regex: z.boolean().optional(),
  caseSensitive: z.boolean().optional(),
  folder: z.string().max(1_024).optional(),
  tag: z.array(z.string().min(1).max(200)).max(20).optional(),
  limit: z.number().int().min(1).max(OBSIDIAN_MAX_LIST_LIMIT).optional(),
  titlesOnly: z.boolean().optional()
})

export const NoteOnly = z.object({ ...VaultScope, note: NoteSelector })

export const UnresolvedLinks = z
  .object({
    ...VaultScope,
    limit: z.number().int().min(1).max(OBSIDIAN_MAX_LIST_LIMIT).optional()
  })
  .optional()

export const Tags = z
  .object({
    ...VaultScope,
    prefix: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(OBSIDIAN_MAX_LIST_LIMIT).optional()
  })
  .optional()

export const Tree = z
  .object({
    ...VaultScope,
    folder: z.string().max(1_024).optional(),
    depth: z.number().int().min(1).max(10).optional(),
    includeNotes: z.boolean().optional()
  })
  .optional()

export const DailyNote = z
  .object({
    ...VaultScope,
    date: z.string().max(64).optional(),
    create: z.boolean().optional()
  })
  .optional()

const NoteContent = z.string().max(OBSIDIAN_MAX_WRITE_BYTES)

export const CreateNote = z.object({
  ...VaultScope,
  path: z.string().min(1).max(NOTE_SELECTOR_MAX),
  content: NoteContent.optional(),
  property: z.array(z.string().min(1).max(4_096)).max(50).optional(),
  overwrite: z.boolean().optional(),
  template: z.string().max(NOTE_SELECTOR_MAX).optional()
})

export const EditNote = z.object({
  ...VaultScope,
  note: NoteSelector,
  content: NoteContent,
  mode: z.enum(['append', 'prepend', 'replace']),
  heading: z.string().max(400).optional()
})

const PropertyType = z.enum(['text', 'number', 'checkbox', 'list', 'date'])

export const SetProperty = z.object({
  ...VaultScope,
  note: NoteSelector,
  key: z.string().min(1).max(200),
  value: z.string().max(8_192),
  type: PropertyType.optional()
})

export const RemoveProperty = z.object({
  ...VaultScope,
  note: NoteSelector,
  key: z.string().min(1).max(200)
})

export const RenameNote = z.object({
  ...VaultScope,
  note: NoteSelector,
  to: z.string().min(1).max(NOTE_SELECTOR_MAX),
  asFolder: z.boolean().optional(),
  updateLinks: z.boolean().optional(),
  overwrite: z.boolean().optional()
})

export const DeleteNote = z.object({
  ...VaultScope,
  note: NoteSelector,
  permanent: z.boolean().optional()
})

export const OpenNote = z
  .object({
    ...VaultScope,
    note: NoteSelector.optional()
  })
  .optional()
