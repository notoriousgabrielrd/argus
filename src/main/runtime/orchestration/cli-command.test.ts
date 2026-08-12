import { describe, expect, it } from 'vitest'
import { resolveTerminalOrchestrationCliCommand } from './cli-command'

describe('resolveTerminalOrchestrationCliCommand', () => {
  // Why this collapsed to a single case: upstream branched between `orca` and `orca-ide`
  // because GNOME's Orca screen reader owns /usr/bin/orca on Linux. Argus has no such
  // collision, so local, WSL, and SSH-remote panes all type the same command.
  it('always types argus, on every platform and transport', () => {
    expect(resolveTerminalOrchestrationCliCommand()).toBe('argus')
  })
})
