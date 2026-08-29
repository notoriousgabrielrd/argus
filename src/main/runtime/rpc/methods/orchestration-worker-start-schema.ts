import { z } from 'zod'
import { OptionalFiniteNumber, OptionalString, requiredString } from '../schemas'

export const OptionalWorkerLaunchPreference = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value === value.trim(), 'Surrounding whitespace is invalid')
  .optional()

export const WorkerStartParams = z.object({
  task: requiredString('Missing --task'),
  on: OptionalString,
  run: OptionalString,
  from: requiredString('Missing --from'),
  worktree: OptionalString,
  name: OptionalString,
  repo: OptionalString,
  baseBranch: OptionalString,
  displayName: OptionalString,
  comment: OptionalString,
  setup: z.enum(['run', 'skip', 'inherit']).optional(),
  terminal: OptionalString,
  agent: OptionalString,
  model: OptionalWorkerLaunchPreference,
  effort: OptionalWorkerLaunchPreference,
  retryOf: OptionalString,
  timeoutMs: OptionalFiniteNumber,
  // Why a tri-state: absent means "the caller did not say", which the handler reads as the
  // default (on). Only an explicit false forbids the watchdog from replacing a dead worker.
  autoRestart: z.boolean().optional(),
  devMode: z.boolean().optional()
})

export type WorkerStartInput = z.infer<typeof WorkerStartParams>
