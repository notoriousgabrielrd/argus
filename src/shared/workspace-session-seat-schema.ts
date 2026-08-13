import { z } from 'zod'
import { isSeatNameValid } from './argus/terminal-seat'
import { salvagedOptional, salvagingRecord } from './zod-salvage'

const worktreeIdSchema = z.string().min(1)
const seatNameSchema = z.string().refine(isSeatNameValid, 'seat name must be a project-agent name')

/**
 * Project-agent seat assignments per worktree: seat name → occupying pane's leafId.
 *
 * Why salvaging: a seat naming a pane that no longer exists is pruned at read time by the
 * runtime, so a stale or hand-edited entry must not fail the whole-session parse.
 */
export const seatAssignmentsByWorktreeField = salvagedOptional(
  'seatAssignmentsByWorktree',
  salvagingRecord(worktreeIdSchema, salvagingRecord(seatNameSchema, z.string()))
)
