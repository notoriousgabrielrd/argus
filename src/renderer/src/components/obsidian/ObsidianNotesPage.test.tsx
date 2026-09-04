// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ObsidianNote } from '../../../../shared/obsidian-types'
import ObsidianNotesPage from './ObsidianNotesPage'

const store = vi.hoisted(() => ({
  obsidianOpenNote: null as { vaultId: string; vaultName: string; notePath: string } | null,
  closeObsidianNote: vi.fn(),
  openObsidianNote: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: <T,>(selector: (state: unknown) => T): T =>
    selector({
      obsidianOpenNote: store.obsidianOpenNote,
      closeObsidianNote: store.closeObsidianNote,
      openObsidianNote: store.openObsidianNote
    })
}))

const api = vi.hoisted(() => ({
  readNote: vi.fn(),
  editNote: vi.fn(),
  openNote: vi.fn()
}))

const note: ObsidianNote = {
  path: 'Projects/Argus.md',
  name: 'Argus',
  title: 'Argus',
  folder: 'Projects',
  size: 100,
  modifiedAt: '2026-09-03T00:00:00.000Z',
  createdAt: '2026-09-01T00:00:00.000Z',
  tags: ['project'],
  frontmatter: { status: 'open' },
  headings: ['Argus'],
  outgoingLinks: 0,
  content:
    '# Argus\n\nvault **integration** with a [[Notes/Design|design note]].\n\n- one\n- two\n',
  links: [],
  backlinks: [{ path: 'Notes/Design.md', title: 'Design', line: 4, context: 'See [[Argus]]' }]
}

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
    root.render(<ObsidianNotesPage />)
  })
  await flush()
}

function typeInto(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  store.obsidianOpenNote = { vaultId: 'vault-1', vaultName: 'Personal', notePath: note.path }
  store.closeObsidianNote.mockReset()
  store.openObsidianNote.mockReset()
  api.readNote.mockReset().mockResolvedValue(note)
  api.editNote.mockReset().mockResolvedValue({ path: note.path, created: false, bytes: 30 })
  api.openNote.mockReset().mockResolvedValue({ uri: 'obsidian://open', opened: true })
  ;(globalThis as { window: { api: unknown } }).window.api = { obsidian: api }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

describe('ObsidianNotesPage', () => {
  it('renders the open note with its vault, properties, body, and backlinks', async () => {
    await render()

    expect(api.readNote).toHaveBeenCalledWith({ vault: 'vault-1', note: 'Projects/Argus.md' })
    expect(container.textContent).toContain('Personal')
    expect(container.textContent).toContain('status')
    expect(container.textContent).toContain('Notes/Design.md:4')
  })

  it('reads the body as rendered markdown, not raw source', async () => {
    await render()

    // Headings, emphasis, and lists become real elements; the syntax disappears.
    expect(container.querySelector('h1')?.textContent).toBe('Argus')
    expect(container.querySelector('strong')?.textContent).toBe('integration')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.textContent).not.toContain('# Argus')
    expect(container.textContent).not.toContain('**integration**')
  })

  it('turns a wikilink into a control that opens the linked note', async () => {
    await render()

    const link = buttonWithText('design note')
    expect(link).toBeDefined()
    await act(async () => {
      link?.click()
    })
    await flush()

    expect(store.openObsidianNote).toHaveBeenCalledWith({
      vaultId: 'vault-1',
      vaultName: 'Personal',
      notePath: 'Notes/Design'
    })
  })

  it('opens a backlink as the next note', async () => {
    await render()
    await act(async () => {
      buttonWithText('Notes/Design.md:4')?.click()
    })
    await flush()

    expect(store.openObsidianNote).toHaveBeenCalledWith(
      expect.objectContaining({ notePath: 'Notes/Design.md' })
    )
  })

  it('edits the raw markdown source, not the rendered output', async () => {
    await render()
    await act(async () => {
      buttonWithText('Edit')?.click()
    })
    await flush()

    expect(container.querySelector('textarea')?.value).toContain('**integration**')
    expect(container.querySelector('h1')).toBeNull()
  })

  it('prompts for a note when nothing is open instead of rendering an empty editor', async () => {
    store.obsidianOpenNote = null
    await render()

    expect(api.readNote).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Pick a note in the Obsidian sidebar')
  })

  it('edits the body and writes it back with the frontmatter-preserving mode', async () => {
    await render()
    await act(async () => {
      buttonWithText('Edit')?.click()
    })
    await flush()

    const textarea = container.querySelector('textarea')
    expect(textarea?.value).toBe(note.content)
    await act(async () => {
      if (textarea) {
        typeInto(textarea, '# Argus\nedited in the main pane')
      }
    })
    await flush()

    await act(async () => {
      buttonWithText('Save')?.click()
    })
    await flush()

    expect(api.editNote).toHaveBeenCalledWith({
      vault: 'vault-1',
      note: 'Projects/Argus.md',
      content: '# Argus\nedited in the main pane',
      mode: 'replace'
    })
    // A successful save reloads, which drops the draft and leaves read mode.
    expect(container.querySelector('textarea')).toBeNull()
  })

  it('keeps Save disabled until the body changes', async () => {
    await render()
    await act(async () => {
      buttonWithText('Edit')?.click()
    })
    await flush()

    expect(buttonWithText('Save')?.disabled).toBe(true)
  })

  it('discards the draft on cancel without writing', async () => {
    await render()
    await act(async () => {
      buttonWithText('Edit')?.click()
    })
    await flush()
    await act(async () => {
      buttonWithText('Cancel')?.click()
    })
    await flush()

    expect(container.querySelector('textarea')).toBeNull()
    expect(api.editNote).not.toHaveBeenCalled()
  })

  it('surfaces a read failure instead of rendering a blank page', async () => {
    api.readNote.mockRejectedValue(new Error('Vault folder is missing.'))
    await render()

    expect(container.textContent).toContain('Vault folder is missing.')
  })
})
