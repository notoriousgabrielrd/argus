import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { RuntimeObsidianCommands } from '../runtime/orca-runtime-obsidian'

/**
 * The renderer talks to the same command surface the CLI reaches over RPC, so a
 * vault panel and `argus obsidian ...` can never drift apart.
 */
const commands = new RuntimeObsidianCommands({
  getUserDataPath: () => app.getPath('userData'),
  openExternalUrl: (url) => shell.openExternal(url)
})

type CommandName = {
  [Key in keyof RuntimeObsidianCommands]: RuntimeObsidianCommands[Key] extends (
    params: never
  ) => unknown
    ? Key
    : never
}[keyof RuntimeObsidianCommands]

const CHANNELS: Record<string, CommandName> = {
  'obsidian:listVaults': 'obsidianListVaults',
  'obsidian:addVault': 'obsidianAddVault',
  'obsidian:removeVault': 'obsidianRemoveVault',
  'obsidian:setDefaultVault': 'obsidianSetDefaultVault',
  'obsidian:vaultInfo': 'obsidianVaultInfo',
  'obsidian:listNotes': 'obsidianListNotes',
  'obsidian:readNote': 'obsidianReadNote',
  'obsidian:search': 'obsidianSearchNotes',
  'obsidian:noteLinks': 'obsidianNoteLinks',
  'obsidian:unresolvedLinks': 'obsidianUnresolvedLinks',
  'obsidian:tags': 'obsidianTags',
  'obsidian:tree': 'obsidianTree',
  'obsidian:dailyNote': 'obsidianDailyNote',
  'obsidian:createNote': 'obsidianCreateNote',
  'obsidian:editNote': 'obsidianEditNote',
  'obsidian:setProperty': 'obsidianSetProperty',
  'obsidian:removeProperty': 'obsidianRemoveProperty',
  'obsidian:renameNote': 'obsidianRenameNote',
  'obsidian:deleteNote': 'obsidianDeleteNote',
  'obsidian:openNote': 'obsidianOpenNote'
}

/**
 * The vault panel needs a folder picker before it can register anything, so the
 * dialog and the registration land in one round trip.
 */
async function pickVaultFolder(event: Electron.IpcMainInvokeEvent): Promise<unknown> {
  const ownerWindow = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.OpenDialogOptions = {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select an Obsidian vault folder'
  }
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options)
  const selected = result.canceled ? undefined : result.filePaths[0]
  if (!selected) {
    return { vault: null }
  }
  return commands.obsidianAddVault({ path: selected })
}

export function registerObsidianHandlers(): void {
  ipcMain.handle('obsidian:pickVault', async (event) => pickVaultFolder(event))
  for (const [channel, method] of Object.entries(CHANNELS)) {
    ipcMain.handle(channel, async (_event, params: unknown) => {
      // Why: reading the method off the instance drops its receiver, and every
      // command reaches the vault registry through `this`.
      const handler = commands[method] as (this: typeof commands, input: unknown) => unknown
      return await handler.call(commands, (params ?? {}) as never)
    })
  }
}
