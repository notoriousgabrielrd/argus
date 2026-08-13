import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from '../runtime-client'
import { parseArgs } from '../args'
import { printHelp } from '../help'
import { COMMAND_SPECS } from '../specs'
import { TERMINAL_HANDLERS } from './terminal'

function seatResult(seat: string | null, extra: Record<string, unknown> = {}) {
  return {
    result: {
      seat: {
        handle: 'term-1',
        tabId: 'tab-1',
        leafId: 'leaf-1',
        worktreeId: 'repo::/w',
        seat,
        ...extra
      }
    }
  }
}

describe('terminal assign CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the seat and defaults force to false, so an occupied seat protests', async () => {
    const parsed = parseArgs(['terminal', 'assign', '--terminal', 'term-1', '--seat', 'AUDITOR'])
    const call = vi.fn().mockResolvedValue(seatResult('AUDITOR'))
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await TERMINAL_HANDLERS['terminal assign']({
      flags: parsed.flags,
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: true
    })

    expect(call).toHaveBeenCalledWith('terminal.assignSeat', {
      terminal: 'term-1',
      seat: 'AUDITOR',
      force: false
    })
  })

  it('passes --force through as the explicit confirmation', async () => {
    const parsed = parseArgs([
      'terminal',
      'assign',
      '--terminal',
      'term-1',
      '--seat',
      'AUDITOR',
      '--force'
    ])
    const call = vi.fn().mockResolvedValue(seatResult('AUDITOR', { displacedHandle: 'term-9' }))
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await TERMINAL_HANDLERS['terminal assign']({
      flags: parsed.flags,
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: true
    })

    expect(call).toHaveBeenCalledWith('terminal.assignSeat', {
      terminal: 'term-1',
      seat: 'AUDITOR',
      force: true
    })
  })

  it('reports the displaced terminal in human output', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = vi.fn().mockResolvedValue(seatResult('AUDITOR', { displacedHandle: 'term-9' }))

    await TERMINAL_HANDLERS['terminal assign']({
      flags: new Map([
        ['terminal', 'term-1'],
        ['seat', 'AUDITOR']
      ]),
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: false
    })

    const printed = log.mock.calls.map((args) => String(args[0])).join('\n')
    expect(printed).toContain('AUDITOR')
    expect(printed).toContain('term-9')
  })

  it('fails without --seat rather than assigning something ambiguous', async () => {
    const call = vi.fn()
    await expect(
      TERMINAL_HANDLERS['terminal assign']({
        flags: new Map([['terminal', 'term-1']]),
        client: { call } as unknown as RuntimeClient,
        cwd: '/tmp/worktree',
        json: true
      })
    ).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
  })

  it('keeps --seat separate from --agent in help, since they name different things', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    printHelp(COMMAND_SPECS, ['terminal', 'assign'])

    const help = String(log.mock.calls[0]?.[0])
    expect(help).toContain('--seat <PROJECT_AGENT>')
    expect(help).toContain('.claude/agents')
    expect(help).toContain('not the Argus agent')
  })
})

describe('terminal unassign CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('releases the seat and says the terminal keeps running', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = vi.fn().mockResolvedValue(seatResult('AUDITOR'))

    await TERMINAL_HANDLERS['terminal unassign']({
      flags: new Map([['terminal', 'term-1']]),
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: false
    })

    expect(call).toHaveBeenCalledWith('terminal.clearSeat', { terminal: 'term-1' })
    expect(log.mock.calls.map((args) => String(args[0])).join('\n')).toContain('still running')
  })

  it('says so plainly when the terminal held no seat', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = vi.fn().mockResolvedValue(seatResult(null))

    await TERMINAL_HANDLERS['terminal unassign']({
      flags: new Map([['terminal', 'term-1']]),
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: false
    })

    expect(log.mock.calls.map((args) => String(args[0])).join('\n')).toContain('no project-agent')
  })
})

describe('seat: terminal selector', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves seat:AUDITOR to a handle before the command RPC', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = vi.fn(async (method: string) => {
      if (method === 'worktree.list') {
        return { result: { worktrees: [{ id: 'repo::/tmp/worktree', path: '/tmp/worktree' }] } }
      }
      if (method === 'terminal.resolveSeat') {
        return { result: { handle: 'term-seated', seat: 'AUDITOR' } }
      }
      return { result: { send: { handle: 'term-seated', accepted: true, bytesWritten: 6 } } }
    })

    await TERMINAL_HANDLERS['terminal send']({
      flags: new Map<string, string | boolean>([
        ['terminal', 'seat:auditor'],
        ['text', 'revise'],
        ['enter', true]
      ]),
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: true
    })

    expect(call).toHaveBeenCalledWith('terminal.resolveSeat', {
      seat: 'AUDITOR',
      worktree: 'id:repo::/tmp/worktree'
    })
    expect(call).toHaveBeenCalledWith(
      'terminal.send',
      expect.objectContaining({ terminal: 'term-seated', text: 'revise' })
    )
  })

  it('leaves a plain handle untouched, with no resolution round-trip', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = vi
      .fn()
      .mockResolvedValue({
        result: { send: { handle: 'term-1', accepted: true, bytesWritten: 1 } }
      })

    await TERMINAL_HANDLERS['terminal send']({
      flags: new Map([
        ['terminal', 'term-1'],
        ['text', 'x']
      ]),
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: true
    })

    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith(
      'terminal.send',
      expect.objectContaining({ terminal: 'term-1' })
    )
  })
})

describe('terminal seats CLI', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists each project agent with its occupant, marking vacant seats', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const call = vi.fn().mockResolvedValue({
      result: {
        seats: {
          worktreeId: 'repo::/w',
          worktreePath: '/w',
          seats: [
            { seat: 'AUDITOR', description: 'Guardião', tools: ['Read'], handle: 'term-1' },
            { seat: 'BOSS', description: 'Infra', tools: [], handle: null }
          ]
        }
      }
    })

    await TERMINAL_HANDLERS['terminal seats']({
      flags: new Map(),
      client: { call } as unknown as RuntimeClient,
      cwd: '/tmp/worktree',
      json: false
    })

    const printed = log.mock.calls.map((args) => String(args[0])).join('\n')
    expect(printed).toContain('AUDITOR  term-1')
    expect(printed).toContain('(vacant)')
    expect(printed).toContain('inherits every tool')
  })
})
