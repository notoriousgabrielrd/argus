import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, params: unknown) => unknown>(),
  userDataPath: '',
  openedUrls: [] as string[]
}))

vi.mock('electron', () => ({
  app: { getPath: () => state.userDataPath },
  shell: {
    openExternal: async (url: string) => {
      state.openedUrls.push(url)
    }
  },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { fromWebContents: () => null },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, params: unknown) => unknown) => {
      state.handlers.set(channel, handler)
    }
  }
}))

const { registerObsidianHandlers } = await import('./obsidian')
const { invalidateVaultIndex } = await import('../obsidian/vault-index')

let base = ''
let vaultPath = ''

function invoke<T>(channel: string, params?: unknown): Promise<T> {
  const handler = state.handlers.get(channel)
  if (!handler) {
    throw new Error(`Channel ${channel} was never registered`)
  }
  return Promise.resolve(handler({ sender: {} }, params) as T)
}

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'argus-obsidian-ipc-'))
  state.userDataPath = path.join(base, 'userData')
  vaultPath = path.join(base, 'Vault')
  mkdirSync(state.userDataPath, { recursive: true })
  mkdirSync(path.join(vaultPath, 'Projects'), { recursive: true })
  writeFileSync(
    path.join(vaultPath, 'Projects', 'Argus.md'),
    '---\nstatus: open\n---\n# Argus\nbody\n',
    'utf-8'
  )
  state.handlers.clear()
  state.openedUrls = []
  invalidateVaultIndex()
  registerObsidianHandlers()
})

afterEach(() => {
  invalidateVaultIndex()
  rmSync(base, { recursive: true, force: true })
})

describe('obsidian IPC handlers', () => {
  it('registers a channel for every renderer-facing command', () => {
    expect([...state.handlers.keys()].sort()).toEqual([
      'obsidian:addVault',
      'obsidian:createNote',
      'obsidian:dailyNote',
      'obsidian:deleteNote',
      'obsidian:editNote',
      'obsidian:listNotes',
      'obsidian:listVaults',
      'obsidian:noteLinks',
      'obsidian:openNote',
      'obsidian:pickVault',
      'obsidian:readNote',
      'obsidian:removeProperty',
      'obsidian:removeVault',
      'obsidian:renameNote',
      'obsidian:search',
      'obsidian:setDefaultVault',
      'obsidian:setProperty',
      'obsidian:tags',
      'obsidian:tree',
      'obsidian:unresolvedLinks',
      'obsidian:vaultInfo'
    ])
  })

  // Why this test exists: the dispatch table reads each method off the command
  // instance, which drops the receiver unless it is called back on it. Shipping
  // that dropped `this` broke every channel with "Cannot read properties of
  // undefined (reading 'registry')" — a failure no CLI or RPC test could see.
  it('calls every command with its receiver intact', async () => {
    await expect(invoke('obsidian:listVaults')).resolves.toMatchObject({
      vaults: expect.any(Array)
    })
    await expect(invoke('obsidian:listVaults', undefined)).resolves.toBeDefined()
  })

  it('drives a vault end to end across channels', async () => {
    const added = await invoke<{ vault: { id: string; name: string } }>('obsidian:addVault', {
      path: vaultPath,
      makeDefault: true
    })
    expect(added.vault.name).toBe('Vault')

    await expect(invoke('obsidian:vaultInfo', {})).resolves.toMatchObject({ notes: 1 })
    await expect(invoke('obsidian:listNotes', {})).resolves.toMatchObject({ total: 1 })
    await expect(invoke('obsidian:search', { query: 'body' })).resolves.toMatchObject({
      hits: [expect.objectContaining({ path: 'Projects/Argus.md' })]
    })
    await expect(invoke('obsidian:readNote', { note: 'Argus' })).resolves.toMatchObject({
      path: 'Projects/Argus.md'
    })
    await expect(invoke('obsidian:tags', {})).resolves.toMatchObject({ tags: [] })
    await expect(invoke('obsidian:tree', {})).resolves.toMatchObject({ noteCount: 1 })

    await invoke('obsidian:setProperty', { note: 'Argus', key: 'status', value: 'shipped' })
    expect(readFileSync(path.join(vaultPath, 'Projects/Argus.md'), 'utf-8')).toContain(
      'status: shipped'
    )

    await invoke('obsidian:openNote', { note: 'Argus' })
    expect(state.openedUrls).toEqual(['obsidian://open?vault=Vault&file=Projects%2FArgus'])
  })

  it('reports a cancelled folder picker as no vault rather than failing', async () => {
    await expect(invoke('obsidian:pickVault')).resolves.toEqual({ vault: null })
  })
})
