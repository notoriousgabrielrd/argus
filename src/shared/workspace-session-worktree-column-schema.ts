import { z } from 'zod'
import { salvagedOptional, salvagingArray } from './zod-salvage'

/**
 * Visible worktree columns and their split ratios.
 *
 * Why salvaging: a column naming a worktree that was removed is dropped at read time by the
 * store, and an absent/empty list simply means single-column. Neither should be able to fail the
 * whole-session parse and reset every worktree's tabs.
 */
export const visibleWorktreeIdsField = salvagedOptional(
  'visibleWorktreeIds',
  salvagingArray(z.string().min(1))
)

export const worktreeColumnRatiosField = salvagedOptional(
  'worktreeColumnRatios',
  salvagingArray(z.number().finite().positive())
)
