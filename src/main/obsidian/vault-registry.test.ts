import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { obsidianConfigPaths, discoverObsidianVaults } from './vault-config-discovery'
import { ObsidianVaultRegistry } from './vault-registry'

let userData = ''
let vaultA = ''
let vaultB = ''

function registry(
  discovered: { id: string; path: string; open: boolean; lastOpenedAt: number | null }[]
) {
  return new ObsidianVaultRegistry({ userDataPath: userData, discover: () => discovered })
}

beforeEach(() => {
  const base = mkdtempSync(path.join(tmpdir(), 'argus-obsidian-'))
  userData = path.join(base, 'userData')
  vaultA = path.join(base, 'Personal')
  vaultB = path.join(base, 'Work')
  mkdirSync(userData, { recursive: true })
  mkdirSync(vaultA, { recursive: true })
  mkdirSync(vaultB, { recursive: true })
})

afterEach(() => {
  rmSync(path.dirname(userData), { recursive: true, force: true })
})

describe('obsidian config discovery', () => {
  it('looks in the platform config location', () => {
    expect(obsidianConfigPaths({ platform: 'darwin', home: '/Users/x' })[0]).toBe(
      '/Users/x/Library/Application Support/obsidian/obsidian.json'
    )
    expect(
      obsidianConfigPaths({ platform: 'win32', home: 'C:\\u', env: { APPDATA: 'C:\\A' } })[0]
    ).toBe(path.join('C:\\A', 'obsidian', 'obsidian.json'))
    expect(obsidianConfigPaths({ platform: 'linux', home: '/home/x', env: {} })).toHaveLength(3)
  })

  it('reads the vault list and survives a missing or corrupt config', () => {
    const home = path.dirname(userData)
    const configDir = path.join(home, '.config', 'obsidian')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      path.join(configDir, 'obsidian.json'),
      JSON.stringify({ vaults: { abc: { path: vaultA, ts: 42, open: true }, bad: {} } })
    )
    const found = discoverObsidianVaults({ platform: 'linux', home, env: {} })
    expect(found).toEqual([{ id: 'abc', path: vaultA, open: true, lastOpenedAt: 42 }])

    writeFileSync(path.join(configDir, 'obsidian.json'), 'not json')
    expect(discoverObsidianVaults({ platform: 'linux', home, env: {} })).toEqual([])
  })
})

describe('vault registry', () => {
  it('lists discovered vaults with no setup at all', () => {
    const vaults = registry([{ id: 'x', path: vaultA, open: false, lastOpenedAt: 1 }]).list()
    expect(vaults).toHaveLength(1)
    expect(vaults[0]).toMatchObject({
      name: 'Personal',
      source: 'obsidian-config',
      available: true
    })
  })

  it('defaults to the vault Obsidian currently has open', () => {
    const vaults = registry([
      { id: 'a', path: vaultA, open: false, lastOpenedAt: 10 },
      { id: 'b', path: vaultB, open: true, lastOpenedAt: 1 }
    ]).list()
    expect(vaults.find((vault) => vault.isDefault)?.name).toBe('Work')
  })

  it('falls back to the most recently opened vault', () => {
    const vaults = registry([
      { id: 'a', path: vaultA, open: false, lastOpenedAt: 10 },
      { id: 'b', path: vaultB, open: false, lastOpenedAt: 99 }
    ]).list()
    expect(vaults.find((vault) => vault.isDefault)?.name).toBe('Work')
  })

  it('lets an explicit default win over Obsidian’s own open flag', () => {
    const store = registry([
      { id: 'a', path: vaultA, open: false, lastOpenedAt: 1 },
      { id: 'b', path: vaultB, open: true, lastOpenedAt: 2 }
    ])
    store.setDefault('Personal')
    expect(store.resolve().name).toBe('Personal')
  })

  it('collapses a manually added folder onto the same discovered vault', () => {
    const store = registry([{ id: 'a', path: vaultA, open: true, lastOpenedAt: 1 }])
    store.add(vaultA, { name: 'My Notes' })
    const vaults = store.list()
    expect(vaults).toHaveLength(1)
    expect(vaults[0]).toMatchObject({ name: 'My Notes', source: 'manual', openInApp: true })
  })

  it('resolves by id, name, or path and reports an unknown selector', () => {
    const store = registry([])
    const added = store.add(vaultB)
    expect(store.resolve(added.id).path).toBe(vaultB)
    expect(store.resolve('work').path).toBe(vaultB)
    expect(store.resolve(vaultB).path).toBe(vaultB)
    expect(() => store.resolve('nope')).toThrowError(
      expect.objectContaining({ code: 'obsidian_vault_not_found' })
    )
  })

  it('refuses to register a path that is not a folder', () => {
    expect(() => registry([]).add(path.join(vaultA, 'missing'))).toThrowError(
      expect.objectContaining({ code: 'obsidian_vault_unavailable' })
    )
  })

  it('reports a vault whose folder disappeared instead of resolving it', () => {
    const store = registry([])
    store.add(vaultA)
    rmSync(vaultA, { recursive: true, force: true })
    expect(store.list()[0].available).toBe(false)
    expect(() => store.resolve('Personal')).toThrowError(
      expect.objectContaining({ code: 'obsidian_vault_unavailable' })
    )
  })

  it('still forgets a vault whose folder disappeared', () => {
    const store = registry([])
    store.add(vaultA)
    rmSync(vaultA, { recursive: true, force: true })
    expect(store.remove('Personal').name).toBe('Personal')
    expect(store.list()).toHaveLength(0)
  })

  it('fails clearly when no vault is known at all', () => {
    expect(() => registry([]).resolve()).toThrowError(
      expect.objectContaining({ code: 'obsidian_no_vault' })
    )
  })
})
