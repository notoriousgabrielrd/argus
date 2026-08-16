import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => '/tmp') }
}))

const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = `tab-1:${LEAF_ID}`

type SelfInternals = {
  leaves: Map<string, { tabId: string; leafId: string }>
  issueHandle: (leaf: { tabId: string; leafId: string }) => string
  listTerminals: (
    worktree?: string,
    limit?: number,
    opts?: object
  ) => Promise<{ terminals: { handle: string; leafId: string }[] }>
}

describe('OrcaRuntimeService.resolveTerminalForPaneKey', () => {
  let runtime: OrcaRuntimeService
  let internals: SelfInternals

  beforeEach(() => {
    runtime = new OrcaRuntimeService(
      {} as unknown as ConstructorParameters<typeof OrcaRuntimeService>[0]
    )
    internals = runtime as unknown as SelfInternals
    vi.spyOn(internals, 'issueHandle').mockReturnValue('term-self')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers with the calling pane, not whichever pane is focused', async () => {
    internals.leaves.set(`tab-1::${LEAF_ID}`, { tabId: 'tab-1', leafId: LEAF_ID })

    await expect(runtime.resolveTerminalForPaneKey(PANE_KEY)).resolves.toBe('term-self')
  })

  it('falls back to the terminal listing when there is no renderer graph', async () => {
    const listTerminals = vi
      .spyOn(internals, 'listTerminals')
      .mockResolvedValue({ terminals: [{ handle: 'term-headless', leafId: LEAF_ID }] })

    await expect(runtime.resolveTerminalForPaneKey(PANE_KEY)).resolves.toBe('term-headless')
    expect(listTerminals).toHaveBeenCalled()
  })

  it('rejects a malformed pane key instead of guessing a terminal', async () => {
    vi.spyOn(internals, 'listTerminals').mockResolvedValue({ terminals: [] })

    await expect(runtime.resolveTerminalForPaneKey('not-a-pane-key')).rejects.toThrow(
      /invalid_pane_key/
    )
  })

  it('reports the pane it could not find rather than any other terminal', async () => {
    vi.spyOn(internals, 'listTerminals').mockResolvedValue({
      terminals: [{ handle: 'term-other', leafId: '22222222-2222-4222-8222-222222222222' }]
    })

    await expect(runtime.resolveTerminalForPaneKey(PANE_KEY)).rejects.toThrow(
      `terminal_not_found_for_pane:${LEAF_ID}`
    )
  })
})
