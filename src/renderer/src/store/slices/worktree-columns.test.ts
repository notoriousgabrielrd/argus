import { describe, expect, it } from 'vitest'
import {
  closeWorktreeColumn,
  focusWorktreeColumn,
  isSingleColumn,
  MAX_VISIBLE_WORKTREE_COLUMNS,
  MIN_WORKTREE_COLUMN_RATIO,
  normalizeWorktreeColumnRatios,
  openWorktreeColumn,
  pruneWorktreeColumns,
  renameWorktreeColumn,
  resolveVisibleWorktreeIds,
  worktreeColumnMenuState
} from './worktree-columns'

describe('resolveVisibleWorktreeIds', () => {
  it('derives a single column from the focused worktree, which is the pre-columns behavior', () => {
    expect(resolveVisibleWorktreeIds({ visibleWorktreeIds: [], activeWorktreeId: 'wt-1' })).toEqual(
      ['wt-1']
    )
    expect(isSingleColumn({ visibleWorktreeIds: [], activeWorktreeId: 'wt-1' })).toBe(true)
  })

  it('renders nothing when no worktree is focused', () => {
    expect(resolveVisibleWorktreeIds({ visibleWorktreeIds: [], activeWorktreeId: null })).toEqual(
      []
    )
  })

  it('adopts a focused worktree that is missing from the row rather than rendering it invisible', () => {
    expect(
      resolveVisibleWorktreeIds({ visibleWorktreeIds: ['wt-1'], activeWorktreeId: 'wt-2' })
    ).toEqual(['wt-1', 'wt-2'])
  })
})

describe('openWorktreeColumn', () => {
  it('opens beside the focused column and focuses the new one', () => {
    expect(
      openWorktreeColumn({ visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-1' }, 'wt-3')
    ).toEqual({ visibleWorktreeIds: ['wt-1', 'wt-3', 'wt-2'], activeWorktreeId: 'wt-3' })
  })

  it('focuses an already-open column instead of duplicating it', () => {
    expect(
      openWorktreeColumn({ visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-1' }, 'wt-2')
    ).toEqual({ visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-2' })
  })

  it('grows a single column into a row', () => {
    expect(
      openWorktreeColumn({ visibleWorktreeIds: [], activeWorktreeId: 'wt-1' }, 'wt-2')
    ).toEqual({ visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-2' })
  })

  it('drops the oldest column at the cap so the gesture never silently no-ops', () => {
    const full = Array.from({ length: MAX_VISIBLE_WORKTREE_COLUMNS }, (_, i) => `wt-${i + 1}`)
    const result = openWorktreeColumn(
      { visibleWorktreeIds: full, activeWorktreeId: full[0] },
      'wt-new'
    )
    expect(result.visibleWorktreeIds).toHaveLength(MAX_VISIBLE_WORKTREE_COLUMNS)
    expect(result.visibleWorktreeIds).toContain('wt-new')
    expect(result.activeWorktreeId).toBe('wt-new')
  })
})

describe('closeWorktreeColumn', () => {
  it('focuses the left neighbor when closing the focused column', () => {
    expect(
      closeWorktreeColumn(
        { visibleWorktreeIds: ['wt-1', 'wt-2', 'wt-3'], activeWorktreeId: 'wt-2' },
        'wt-2'
      )
    ).toEqual({ visibleWorktreeIds: ['wt-1', 'wt-3'], activeWorktreeId: 'wt-1' })
  })

  it('leaves focus alone when closing an unfocused column', () => {
    expect(
      closeWorktreeColumn(
        { visibleWorktreeIds: ['wt-1', 'wt-2', 'wt-3'], activeWorktreeId: 'wt-1' },
        'wt-3'
      )
    ).toEqual({ visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-1' })
  })

  it('collapses to implicit single-column rather than leaving a one-entry row', () => {
    expect(
      closeWorktreeColumn(
        { visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-2' },
        'wt-2'
      )
    ).toEqual({ visibleWorktreeIds: [], activeWorktreeId: 'wt-1' })
  })

  it('never leaves a focused worktree with no column', () => {
    expect(
      closeWorktreeColumn({ visibleWorktreeIds: [], activeWorktreeId: 'wt-1' }, 'wt-1')
    ).toEqual({ visibleWorktreeIds: [], activeWorktreeId: 'wt-1' })
  })
})

describe('focusWorktreeColumn', () => {
  it('stays implicit in single-column mode, so switching worktrees behaves exactly as before', () => {
    expect(
      focusWorktreeColumn({ visibleWorktreeIds: [], activeWorktreeId: 'wt-1' }, 'wt-2')
    ).toEqual([])
  })

  it('swaps an off-screen worktree into the focused column instead of growing the row', () => {
    expect(
      focusWorktreeColumn(
        { visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-2' },
        'wt-9'
      )
    ).toEqual(['wt-1', 'wt-9'])
  })

  it('is a no-op when the target is already a column', () => {
    expect(
      focusWorktreeColumn(
        { visibleWorktreeIds: ['wt-1', 'wt-2'], activeWorktreeId: 'wt-1' },
        'wt-2'
      )
    ).toEqual(['wt-1', 'wt-2'])
  })

  it('clears the row when nothing is focused', () => {
    expect(
      focusWorktreeColumn({ visibleWorktreeIds: ['wt-1'], activeWorktreeId: 'wt-1' }, null)
    ).toEqual([])
  })
})

describe('pruneWorktreeColumns / renameWorktreeColumn', () => {
  it('drops a column whose worktree no longer exists', () => {
    expect(pruneWorktreeColumns(['wt-1', 'gone'], (id) => id !== 'gone')).toEqual(['wt-1'])
  })

  it('re-keys a column after a rename, which changes the worktree id', () => {
    expect(renameWorktreeColumn(['wt-1', 'wt-2'], 'wt-2', 'wt-2-renamed')).toEqual([
      'wt-1',
      'wt-2-renamed'
    ])
    expect(renameWorktreeColumn(['wt-1'], 'other', 'new')).toEqual(['wt-1'])
  })
})

describe('normalizeWorktreeColumnRatios', () => {
  it('splits evenly when no ratios are stored or the count changed', () => {
    expect(normalizeWorktreeColumnRatios(undefined, 2)).toEqual([0.5, 0.5])
    expect(normalizeWorktreeColumnRatios([0.9], 2)).toEqual([0.5, 0.5])
  })

  it('normalizes to a total of 1', () => {
    const ratios = normalizeWorktreeColumnRatios([2, 2], 2)
    expect(ratios.reduce((sum, ratio) => sum + ratio, 0)).toBeCloseTo(1)
  })

  it('keeps a column from being squeezed to nothing', () => {
    const [first] = normalizeWorktreeColumnRatios([0.01, 0.99], 2)
    expect(first).toBeGreaterThanOrEqual(MIN_WORKTREE_COLUMN_RATIO / 2)
  })

  it('returns nothing for an empty row', () => {
    expect(normalizeWorktreeColumnRatios(undefined, 0)).toEqual([])
  })
})

describe('worktreeColumnMenuState', () => {
  it('offers to open a worktree that is not on screen', () => {
    const state = { visibleWorktreeIds: [], activeWorktreeId: 'a' }
    expect(worktreeColumnMenuState(state, 'b')).toEqual({ canOpen: true, canClose: false })
  })

  it('offers neither for the only visible column', () => {
    const state = { visibleWorktreeIds: [], activeWorktreeId: 'a' }
    // Closing the last column would leave a focused worktree with nothing rendered.
    expect(worktreeColumnMenuState(state, 'a')).toEqual({ canOpen: false, canClose: false })
  })

  it('offers to close a column once the row holds more than one', () => {
    const state = { visibleWorktreeIds: ['a', 'b'], activeWorktreeId: 'a' }
    expect(worktreeColumnMenuState(state, 'a')).toEqual({ canOpen: false, canClose: true })
    expect(worktreeColumnMenuState(state, 'b')).toEqual({ canOpen: false, canClose: true })
  })

  it('stops offering to open at the cap instead of silently evicting a column', () => {
    const state = {
      visibleWorktreeIds: Array.from({ length: MAX_VISIBLE_WORKTREE_COLUMNS }, (_, i) => `w${i}`),
      activeWorktreeId: 'w0'
    }
    expect(worktreeColumnMenuState(state, 'extra').canOpen).toBe(false)
  })
})
