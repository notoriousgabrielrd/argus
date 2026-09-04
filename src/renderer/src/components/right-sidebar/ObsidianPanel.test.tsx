// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ObsidianTreeEntry,
  ObsidianVault,
  ObsidianVaultStats
} from '../../../../shared/obsidian-types'
import ObsidianPanel from './ObsidianPanel'

const store = vi.hoisted(() => ({
  openObsidianNote: vi.fn(),
  obsidianOpenNote: null as { notePath: string } | null
}))

vi.mock('@/store', () => ({
  useAppStore: <T,>(selector: (state: unknown) => T): T =>
    selector({
      openObsidianNote: store.openObsidianNote,
      obsidianOpenNote: store.obsidianOpenNote
    })
}))

const vault: ObsidianVault = {
  id: 'vault-1',
  name: 'Personal',
  path: '/home/x/Personal',
  source: 'obsidian-config',
  isDefault: true,
  available: true
}

const stats: ObsidianVaultStats = {
  vault,
  notes: 3,
  attachments: 0,
  folders: 2,
  tags: 1,
  unresolvedLinks: 0,
  totalBytes: 2048,
  indexedAt: '2026-09-03T00:00:00.000Z'
}

const tree: ObsidianTreeEntry = {
  path: '',
  name: 'Personal',
  type: 'folder',
  noteCount: 3,
  children: [
    {
      path: 'Projects',
      name: 'Projects',
      type: 'folder',
      noteCount: 1,
      children: [{ path: 'Projects/Argus.md', name: 'Argus.md', type: 'note' }]
    },
    {
      path: 'Archive',
      name: 'Archive',
      type: 'folder',
      noteCount: 0,
      children: [{ path: 'Archive/Old.md', name: 'Old.md', type: 'note' }]
    },
    { path: 'Inbox.md', name: 'Inbox.md', type: 'note' }
  ]
}

const api = vi.hoisted(() => ({
  listVaults: vi.fn(),
  vaultInfo: vi.fn(),
  tags: vi.fn(),
  tree: vi.fn(),
  search: vi.fn(),
  openNote: vi.fn(),
  pickVault: vi.fn()
}))

let container: HTMLDivElement
let root: Root

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes(text)
  )
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(<ObsidianPanel />)
  })
  await flush()
}

async function openArgusNote(): Promise<void> {
  await act(async () => {
    buttonWithText('Argus')?.click()
  })
  await flush()
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ shouldAdvanceTime: true })
  api.listVaults.mockResolvedValue({ vaults: [vault] })
  api.vaultInfo.mockResolvedValue(stats)
  api.tags.mockResolvedValue({ tags: [] })
  api.tree.mockResolvedValue(tree)
  api.search.mockResolvedValue({ hits: [] })
  store.openObsidianNote.mockReset()
  store.obsidianOpenNote = null
  api.openNote.mockResolvedValue({ uri: 'obsidian://open', opened: true })
  ;(globalThis as { window: { api: unknown } }).window.api = { obsidian: api }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('ObsidianPanel folder tree', () => {
  it('renders the vault as folders rather than a flat note list', async () => {
    await render()

    expect(api.tree).toHaveBeenCalledWith({ vault: 'vault-1', depth: 10, includeNotes: true })
    expect(buttonWithText('Projects')).toBeDefined()
    expect(buttonWithText('Archive')).toBeDefined()
    // Root-level notes render beside the folders, with the extension trimmed.
    expect(container.textContent).toContain('Inbox')
    expect(container.textContent).not.toContain('Inbox.md')
  })

  it('expands folders that hold notes and collapses them on click', async () => {
    await render()
    expect(buttonWithText('Argus')).toBeDefined()

    await act(async () => {
      buttonWithText('Projects')?.click()
    })
    await flush()
    expect(buttonWithText('Argus')).toBeUndefined()
  })

  it('leaves an empty folder collapsed until it is opened', async () => {
    await render()
    expect(buttonWithText('Old')).toBeUndefined()

    await act(async () => {
      buttonWithText('Archive')?.click()
    })
    await flush()
    expect(buttonWithText('Old')).toBeDefined()
  })
})

describe('ObsidianPanel note activation', () => {
  it('hands the clicked note to the main-area view instead of previewing it inline', async () => {
    await render()
    await openArgusNote()

    expect(store.openObsidianNote).toHaveBeenCalledWith({
      vaultId: 'vault-1',
      vaultName: 'Personal',
      notePath: 'Projects/Argus.md'
    })
    // The sidebar stays a navigator: no inline editor is mounted here.
    expect(container.querySelector('textarea')).toBeNull()
  })

  it('marks the note the main area is showing as the selected row', async () => {
    store.obsidianOpenNote = { notePath: 'Projects/Argus.md' }
    await render()

    const row = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Argus')
    )
    expect(row?.getAttribute('data-current')).toBe('true')
  })
})

describe('ObsidianPanel search', () => {
  it('swaps the tree for flat search results while a query is active', async () => {
    api.search.mockResolvedValue({
      hits: [
        { path: 'Notes/Hit.md', title: 'Hit', score: 1, matches: [{ line: 2, text: 'found' }] }
      ]
    })
    await render()

    const input = container.querySelector('input')
    await act(async () => {
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, 'found')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    await flush()

    expect(api.search).toHaveBeenCalledWith(
      expect.objectContaining({ vault: 'vault-1', query: 'found' })
    )
    expect(container.textContent).toContain('found')
    expect(buttonWithText('Projects')).toBeUndefined()
  })
})
