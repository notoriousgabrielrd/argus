import { describe, expect, it } from 'vitest'
import { OBSIDIAN_METHODS } from './obsidian'

function schemaFor(name: string) {
  const method = OBSIDIAN_METHODS.find((candidate) => candidate.name === name)
  if (!method) {
    throw new Error(`Missing ${name} method`)
  }
  return method.params
}

describe('obsidian RPC methods', () => {
  it('exposes one method per CLI command that needs the host', () => {
    const names = OBSIDIAN_METHODS.map((method) => method.name).sort()
    expect(names).toEqual([
      'obsidian.addVault',
      'obsidian.createNote',
      'obsidian.dailyNote',
      'obsidian.deleteNote',
      'obsidian.editNote',
      'obsidian.listNotes',
      'obsidian.listVaults',
      'obsidian.noteLinks',
      'obsidian.openNote',
      'obsidian.readNote',
      'obsidian.removeProperty',
      'obsidian.removeVault',
      'obsidian.renameNote',
      'obsidian.search',
      'obsidian.setDefaultVault',
      'obsidian.setProperty',
      'obsidian.tags',
      'obsidian.tree',
      'obsidian.unresolvedLinks',
      'obsidian.vaultInfo'
    ])
  })

  it('accepts the vault-scoped read shape and rejects unknown sort fields', () => {
    const schema = schemaFor('obsidian.listNotes')
    expect(
      schema?.safeParse({ vault: 'v1', tag: ['project'], sort: 'modified', limit: 10 }).success
    ).toBe(true)
    expect(schema?.safeParse({ sort: 'relevance' }).success).toBe(false)
  })

  it('requires a note selector for reads and edits', () => {
    expect(schemaFor('obsidian.readNote')?.safeParse({}).success).toBe(false)
    expect(
      schemaFor('obsidian.editNote')?.safeParse({ note: 'a', content: 'b', mode: 'append' }).success
    ).toBe(true)
    expect(
      schemaFor('obsidian.editNote')?.safeParse({ note: 'a', content: 'b', mode: 'upsert' }).success
    ).toBe(false)
  })

  it('lets vault-wide reads run with no parameters at all', () => {
    expect(schemaFor('obsidian.vaultInfo')?.safeParse(undefined).success).toBe(true)
    expect(schemaFor('obsidian.listVaults')).toBeNull()
  })
})
