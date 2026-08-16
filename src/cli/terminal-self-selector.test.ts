import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from './runtime-client'
import { RuntimeClientError } from './runtime/types'
import { getTerminalHandle, isSelfTerminalSelector } from './selectors'

const PANE_KEY = 'tab-1:11111111-1111-4111-8111-111111111111'

describe('--terminal self', () => {
  let previousPaneKey: string | undefined

  beforeEach(() => {
    previousPaneKey = process.env.ORCA_PANE_KEY
    process.env.ORCA_PANE_KEY = PANE_KEY
  })

  afterEach(() => {
    if (previousPaneKey === undefined) {
      delete process.env.ORCA_PANE_KEY
    } else {
      process.env.ORCA_PANE_KEY = previousPaneKey
    }
    vi.restoreAllMocks()
  })

  it('recognizes the selector whatever case it is typed in', () => {
    expect(isSelfTerminalSelector('self')).toBe(true)
    expect(isSelfTerminalSelector(' SELF ')).toBe(true)
    expect(isSelfTerminalSelector('seat:AUDITOR')).toBe(false)
    expect(isSelfTerminalSelector('term_abc')).toBe(false)
  })

  it("resolves the caller's own pane instead of the focused one", async () => {
    const call = vi.fn().mockResolvedValue({ result: { handle: 'term-self' } })

    const handle = await getTerminalHandle(new Map([['terminal', 'self']]), '/tmp/worktree', {
      call
    } as unknown as RuntimeClient)

    expect(handle).toBe('term-self')
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('terminal.resolveSelf', { paneKey: PANE_KEY })
  })

  it('refuses outside an Argus pane rather than falling back to someone else', async () => {
    delete process.env.ORCA_PANE_KEY
    const call = vi.fn()

    await expect(
      getTerminalHandle(new Map([['terminal', 'self']]), '/tmp/worktree', {
        call
      } as unknown as RuntimeClient)
    ).rejects.toThrow(/ORCA_PANE_KEY is unset/)
    expect(call).not.toHaveBeenCalled()
  })

  it('translates an older host’s method_not_found into an upgrade instruction', async () => {
    const call = vi
      .fn()
      .mockRejectedValue(new RuntimeClientError('method_not_found', 'Unknown method'))

    await expect(
      getTerminalHandle(new Map([['terminal', 'self']]), '/tmp/worktree', {
        call
      } as unknown as RuntimeClient)
    ).rejects.toThrow(/predates `--terminal self`/)
  })

  it('leaves seat: and plain handles on their own paths', async () => {
    const call = vi.fn().mockResolvedValue({ result: { handle: 'term-seat' } })
    const client = { call } as unknown as RuntimeClient

    await expect(
      getTerminalHandle(new Map([['terminal', 'term_abc']]), '/tmp/worktree', client)
    ).resolves.toBe('term_abc')
    expect(call).not.toHaveBeenCalled()

    await expect(
      getTerminalHandle(
        new Map([
          ['terminal', 'seat:AUDITOR'],
          ['worktree', 'id:repo::/w']
        ]),
        '/tmp/worktree',
        client
      )
    ).resolves.toBe('term-seat')
    expect(call).toHaveBeenCalledWith('terminal.resolveSeat', {
      seat: 'AUDITOR',
      worktree: 'id:repo::/w'
    })
  })
})
