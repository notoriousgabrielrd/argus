import { describe, expect, it } from 'vitest'
import {
  assignSeat,
  clearSeatForLeaf,
  findSeatForLeaf,
  InvalidSeatNameError,
  isSeatNameValid,
  normalizeSeatName,
  parseSeatSelector,
  pruneSeats,
  SeatOccupiedError,
  type TerminalSeatMap
} from './terminal-seat'

describe('normalizeSeatName', () => {
  it('case-folds so --seat auditor and --seat AUDITOR name one seat', () => {
    expect(normalizeSeatName('auditor')).toBe('AUDITOR')
    expect(normalizeSeatName('  Engineer  ')).toBe('ENGINEER')
    expect(normalizeSeatName('AUDITOR')).toBe('AUDITOR')
  })

  it('accepts the identifier shapes the project .md files use', () => {
    expect(isSeatNameValid('BOSS')).toBe(true)
    expect(isSeatNameValid('PRIME_AGENT')).toBe(true)
    expect(isSeatNameValid('QWEN-CODE')).toBe(true)
    expect(isSeatNameValid('FRONT2')).toBe(true)
  })

  it('rejects names that would break the seat: selector or the shell', () => {
    for (const invalid of ['', '  ', 'AUD ITOR', 'seat:AUDITOR', '2FAST', 'AUD/ITOR', 'AUD"ITOR']) {
      expect(isSeatNameValid(invalid)).toBe(false)
    }
    expect(() => normalizeSeatName('AUD ITOR')).toThrow(InvalidSeatNameError)
  })
})

describe('parseSeatSelector', () => {
  it('reads seat:NAME and leaves plain handles alone', () => {
    expect(parseSeatSelector('seat:auditor')).toBe('AUDITOR')
    expect(parseSeatSelector('term_abc123')).toBeNull()
    // Why: `seats:` is a different command, not a selector prefix.
    expect(parseSeatSelector('seats:AUDITOR')).toBeNull()
  })

  it('propagates an invalid name rather than resolving a bogus seat', () => {
    expect(() => parseSeatSelector('seat:')).toThrow(InvalidSeatNameError)
  })
})

describe('assignSeat', () => {
  it('seats a pane in a vacant seat', () => {
    const { seats, displacedLeafId, vacatedSeat } = assignSeat({}, 'AUDITOR', 'leaf-1')
    expect(seats).toEqual({ AUDITOR: 'leaf-1' })
    expect(displacedLeafId).toBeNull()
    expect(vacatedSeat).toBeNull()
  })

  it('refuses an occupied seat so the command can protest instead of moving a label', () => {
    const current: TerminalSeatMap = { AUDITOR: 'leaf-1' }
    expect(() => assignSeat(current, 'AUDITOR', 'leaf-2')).toThrow(SeatOccupiedError)
    // The refusal must not mutate the caller's map.
    expect(current).toEqual({ AUDITOR: 'leaf-1' })
  })

  it('names the displaced pane when force takes an occupied seat', () => {
    const { seats, displacedLeafId } = assignSeat({ AUDITOR: 'leaf-1' }, 'AUDITOR', 'leaf-2', {
      force: true
    })
    expect(seats).toEqual({ AUDITOR: 'leaf-2' })
    expect(displacedLeafId).toBe('leaf-1')
  })

  it('is idempotent for the pane that already holds the seat, without needing force', () => {
    const { seats, displacedLeafId } = assignSeat({ AUDITOR: 'leaf-1' }, 'AUDITOR', 'leaf-1')
    expect(seats).toEqual({ AUDITOR: 'leaf-1' })
    expect(displacedLeafId).toBeNull()
  })

  it('vacates the seat a pane already held, so one pane never holds two', () => {
    const { seats, vacatedSeat } = assignSeat(
      { ENGINEER: 'leaf-1', AUDITOR: 'leaf-9' },
      'BOSS',
      'leaf-1'
    )
    expect(seats).toEqual({ BOSS: 'leaf-1', AUDITOR: 'leaf-9' })
    expect(vacatedSeat).toBe('ENGINEER')
  })

  it('leaves other seats untouched', () => {
    const { seats } = assignSeat({ BOSS: 'leaf-2' }, 'AUDITOR', 'leaf-1')
    expect(seats).toEqual({ BOSS: 'leaf-2', AUDITOR: 'leaf-1' })
  })
})

describe('clearSeatForLeaf', () => {
  it('releases the seat a pane holds', () => {
    const { seats, clearedSeat } = clearSeatForLeaf({ AUDITOR: 'leaf-1', BOSS: 'leaf-2' }, 'leaf-1')
    expect(seats).toEqual({ BOSS: 'leaf-2' })
    expect(clearedSeat).toBe('AUDITOR')
  })

  it('reports no seat for an unseated pane instead of throwing', () => {
    const current: TerminalSeatMap = { AUDITOR: 'leaf-1' }
    const { seats, clearedSeat } = clearSeatForLeaf(current, 'leaf-7')
    expect(clearedSeat).toBeNull()
    expect(seats).toBe(current)
  })
})

describe('findSeatForLeaf', () => {
  it('maps a pane back to its seat', () => {
    expect(findSeatForLeaf({ AUDITOR: 'leaf-1' }, 'leaf-1')).toBe('AUDITOR')
    expect(findSeatForLeaf({ AUDITOR: 'leaf-1' }, 'leaf-2')).toBeNull()
  })
})

describe('pruneSeats', () => {
  it('drops seats whose pane is gone so seat:NAME cannot resolve to a dead leaf', () => {
    const { seats, pruned } = pruneSeats(
      { AUDITOR: 'leaf-live', BOSS: 'leaf-dead' },
      (leafId) => leafId === 'leaf-live'
    )
    expect(seats).toEqual({ AUDITOR: 'leaf-live' })
    expect(pruned).toEqual([{ seat: 'BOSS', leafId: 'leaf-dead' }])
  })
})
