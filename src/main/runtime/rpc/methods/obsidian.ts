import { defineMethod, type RpcAnyMethod } from '../core'
import {
  AddVault,
  CreateNote,
  DailyNote,
  DeleteNote,
  EditNote,
  ListNotes,
  NoteOnly,
  OpenNote,
  ReadNote,
  RemoveProperty,
  RenameNote,
  SearchNotes,
  SetProperty,
  Tags,
  Tree,
  UnresolvedLinks,
  VaultOnly,
  VaultRequired
} from './obsidian-schemas'

// Why: the vault lives on the host that runs Argus, so every note read and
// write is a host RPC — a CLI pane on an SSH worktree reaches the same vault.
export const OBSIDIAN_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'obsidian.listVaults',
    params: null,
    handler: (_params, { runtime }) => runtime.obsidianListVaults()
  }),
  defineMethod({
    name: 'obsidian.addVault',
    params: AddVault,
    handler: (params, { runtime }) => runtime.obsidianAddVault(params)
  }),
  defineMethod({
    name: 'obsidian.removeVault',
    params: VaultRequired,
    handler: (params, { runtime }) => runtime.obsidianRemoveVault(params)
  }),
  defineMethod({
    name: 'obsidian.setDefaultVault',
    params: VaultRequired,
    handler: (params, { runtime }) => runtime.obsidianSetDefaultVault(params)
  }),
  defineMethod({
    name: 'obsidian.vaultInfo',
    params: VaultOnly,
    handler: (params, { runtime }) => runtime.obsidianVaultInfo(params ?? {})
  }),
  defineMethod({
    name: 'obsidian.listNotes',
    params: ListNotes,
    handler: (params, { runtime }) => runtime.obsidianListNotes(params ?? {})
  }),
  defineMethod({
    name: 'obsidian.readNote',
    params: ReadNote,
    handler: (params, { runtime }) => runtime.obsidianReadNote(params)
  }),
  defineMethod({
    name: 'obsidian.search',
    params: SearchNotes,
    handler: (params, { runtime }) => runtime.obsidianSearchNotes(params)
  }),
  defineMethod({
    name: 'obsidian.noteLinks',
    params: NoteOnly,
    handler: (params, { runtime }) => runtime.obsidianNoteLinks(params)
  }),
  defineMethod({
    name: 'obsidian.unresolvedLinks',
    params: UnresolvedLinks,
    handler: (params, { runtime }) => runtime.obsidianUnresolvedLinks(params ?? {})
  }),
  defineMethod({
    name: 'obsidian.tags',
    params: Tags,
    handler: (params, { runtime }) => runtime.obsidianTags(params ?? {})
  }),
  defineMethod({
    name: 'obsidian.tree',
    params: Tree,
    handler: (params, { runtime }) => runtime.obsidianTree(params ?? {})
  }),
  defineMethod({
    name: 'obsidian.dailyNote',
    params: DailyNote,
    handler: (params, { runtime }) => runtime.obsidianDailyNote(params ?? {})
  }),
  defineMethod({
    name: 'obsidian.createNote',
    params: CreateNote,
    handler: (params, { runtime }) => runtime.obsidianCreateNote(params)
  }),
  defineMethod({
    name: 'obsidian.editNote',
    params: EditNote,
    handler: (params, { runtime }) => runtime.obsidianEditNote(params)
  }),
  defineMethod({
    name: 'obsidian.setProperty',
    params: SetProperty,
    handler: (params, { runtime }) => runtime.obsidianSetProperty(params)
  }),
  defineMethod({
    name: 'obsidian.removeProperty',
    params: RemoveProperty,
    handler: (params, { runtime }) => runtime.obsidianRemoveProperty(params)
  }),
  defineMethod({
    name: 'obsidian.renameNote',
    params: RenameNote,
    handler: (params, { runtime }) => runtime.obsidianRenameNote(params)
  }),
  defineMethod({
    name: 'obsidian.deleteNote',
    params: DeleteNote,
    handler: (params, { runtime }) => runtime.obsidianDeleteNote(params)
  }),
  defineMethod({
    name: 'obsidian.openNote',
    params: OpenNote,
    handler: (params, { runtime }) => runtime.obsidianOpenNote(params ?? {})
  })
]
