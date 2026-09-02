import { rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { resolveRecursiveRemove } from './host-tree-removal'

describe('resolveRecursiveRemove', () => {
  it('uses node fs outside Electron', () => {
    const requireModule = vi.fn()
    expect(resolveRecursiveRemove({ isElectron: false, requireModule })).toBe(rm)
    expect(requireModule).not.toHaveBeenCalled()
  })

  it('uses the asar-unaware original-fs inside Electron', async () => {
    const originalRm = vi.fn(async () => undefined)
    const requireModule = vi.fn((id: string) => {
      expect(id).toBe('original-fs')
      return { promises: { rm: originalRm } }
    })
    const remove = resolveRecursiveRemove({ isElectron: true, requireModule })
    await remove('/tmp/x', { recursive: true, force: true })
    expect(originalRm).toHaveBeenCalledWith('/tmp/x', { recursive: true, force: true })
  })

  it('falls back to node fs when original-fs is unavailable', () => {
    const requireModule = vi.fn(() => {
      throw new Error("Cannot find module 'original-fs'")
    })
    expect(resolveRecursiveRemove({ isElectron: true, requireModule })).toBe(rm)
  })
})
