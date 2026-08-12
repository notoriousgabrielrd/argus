import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const AGENT_HOOK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'hooks', 'status'],
    summary: 'Show whether Orca-managed agent status hooks are enabled',
    usage: 'argus agent hooks status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['argus agent hooks status', 'argus agent hooks status --json']
  },
  {
    path: ['agent', 'hooks', 'off'],
    summary: 'Disable Orca-managed agent status hooks and remove local hook entries',
    usage: 'argus agent hooks off [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['argus agent hooks off']
  },
  {
    path: ['agent', 'hooks', 'on'],
    summary: 'Enable Orca-managed agent status hooks',
    usage: 'argus agent hooks on [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['argus agent hooks on']
  }
]
