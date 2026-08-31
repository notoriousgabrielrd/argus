import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyTmuxSessionIsolationEnv,
  TMUX_REAL_BINARY_ENV,
  TMUX_SHIM_DIR_ENV
} from './tmux-session-isolation'

const roots: string[] = []

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'orca-tmux-isolation-'))
  roots.push(root)
  return root
}

function fakeTmuxDir(root: string, name = 'bin'): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  const binary = join(dir, 'tmux')
  writeFileSync(binary, '#!/bin/sh\nexit 0\n')
  chmodSync(binary, 0o755)
  return dir
}

afterEach(() => {
  roots.length = 0
})

describe.skipIf(process.platform === 'win32')('applyTmuxSessionIsolationEnv', () => {
  it('prepends the shim and points it at the real tmux', () => {
    const root = scratch()
    const realDir = fakeTmuxDir(root)
    const env: Record<string, string> = { PATH: realDir }

    applyTmuxSessionIsolationEnv(env, { userDataPath: root })

    const shimDir = env[TMUX_SHIM_DIR_ENV]
    expect(shimDir).toBeTruthy()
    expect(env.PATH.split(delimiter)).toEqual([shimDir, realDir])
    expect(env[TMUX_REAL_BINARY_ENV]).toBe(join(realDir, 'tmux'))
    expect(readFileSync(join(shimDir, 'tmux'), 'utf8')).toContain(join(realDir, 'tmux'))
  })

  it('slots in just ahead of tmux, leaving earlier PATH entries first', () => {
    const root = scratch()
    const realDir = fakeTmuxDir(root)
    const cliDir = join(root, 'argus-cli')
    mkdirSync(cliDir, { recursive: true })
    const env: Record<string, string> = { PATH: [cliDir, realDir].join(delimiter) }

    applyTmuxSessionIsolationEnv(env, { userDataPath: root })

    expect(env.PATH.split(delimiter)).toEqual([cliDir, env[TMUX_SHIM_DIR_ENV], realDir])
  })

  it('never resolves the real tmux to its own shim, which would recurse', () => {
    const root = scratch()
    const realDir = fakeTmuxDir(root)
    const env: Record<string, string> = { PATH: realDir }

    applyTmuxSessionIsolationEnv(env, { userDataPath: root })
    const firstPath = env.PATH
    // A second pane inherits the first pane's PATH, shim dir included.
    applyTmuxSessionIsolationEnv(env, { userDataPath: root })

    expect(env[TMUX_REAL_BINARY_ENV]).toBe(join(realDir, 'tmux'))
    expect(env.PATH).toBe(firstPath)
    expect(env.PATH.split(delimiter).filter((dir) => dir === env[TMUX_SHIM_DIR_ENV])).toHaveLength(
      1
    )
  })

  it('leaves the agent-teams tmux emulator alone', () => {
    const root = scratch()
    const teamsDir = fakeTmuxDir(root, 'agent-teams')
    const realDir = fakeTmuxDir(root)
    const env: Record<string, string> = {
      PATH: [teamsDir, realDir].join(delimiter),
      ORCA_AGENT_TEAMS_SHIM_DIR: teamsDir
    }

    applyTmuxSessionIsolationEnv(env, { userDataPath: root })

    expect(env[TMUX_REAL_BINARY_ENV]).toBe(join(realDir, 'tmux'))
  })

  it('stays out of the way when the host has no tmux', () => {
    const root = scratch()
    const emptyDir = join(root, 'empty')
    mkdirSync(emptyDir, { recursive: true })
    const env: Record<string, string> = { PATH: emptyDir }

    applyTmuxSessionIsolationEnv(env, { userDataPath: root })

    expect(env[TMUX_SHIM_DIR_ENV]).toBeUndefined()
    expect(env[TMUX_REAL_BINARY_ENV]).toBeUndefined()
    expect(env.PATH).toBe(emptyDir)
  })

  it('clears stale isolation env on Windows, where tmux does not exist', () => {
    const root = scratch()
    const env: Record<string, string> = {
      PATH: fakeTmuxDir(root),
      [TMUX_SHIM_DIR_ENV]: 'C:\\stale',
      [TMUX_REAL_BINARY_ENV]: 'C:\\stale\\tmux.exe'
    }

    applyTmuxSessionIsolationEnv(env, { userDataPath: root, platform: 'win32' })

    expect(env[TMUX_SHIM_DIR_ENV]).toBeUndefined()
    expect(env[TMUX_REAL_BINARY_ENV]).toBeUndefined()
  })
})

describe.skipIf(process.platform === 'win32')('the generated shim', () => {
  function renderShim(root: string, realDir: string): string {
    const env: Record<string, string> = { PATH: realDir }
    applyTmuxSessionIsolationEnv(env, { userDataPath: root })
    return join(env[TMUX_SHIM_DIR_ENV], 'tmux')
  }

  // The shim's `#!/usr/bin/env sh` needs a PATH that can still find sh.
  const runnablePath = (dir: string): string => [dir, '/bin', '/usr/bin'].join(delimiter)

  function echoingTmux(root: string, name: string, marker: string): string {
    const dir = join(root, name)
    mkdirSync(dir, { recursive: true })
    const binary = join(dir, 'tmux')
    writeFileSync(binary, `#!/bin/sh\necho ${marker}\n`)
    chmodSync(binary, 0o755)
    return dir
  }

  it('hands tmux to the agent-teams emulator when that mode owns the name', () => {
    const root = scratch()
    const realDir = echoingTmux(root, 'bin', 'real-tmux')
    const teamsDir = echoingTmux(root, 'agent-teams', 'agent-teams-tmux')
    const shim = renderShim(root, realDir)

    const result = spawnSync(shim, ['attach'], {
      encoding: 'utf8',
      env: {
        PATH: runnablePath(realDir),
        ORCA_PANE_KEY: 'tab:leaf',
        ORCA_AGENT_TEAMS_SHIM_DIR: teamsDir
      }
    })

    expect(result.stdout.trim()).toBe('agent-teams-tmux')
  })

  it('reaches the real tmux untouched outside an Argus pane', () => {
    const root = scratch()
    const realDir = echoingTmux(root, 'bin', 'real-tmux')
    const shim = renderShim(root, realDir)

    const result = spawnSync(shim, ['attach'], {
      encoding: 'utf8',
      env: { PATH: runnablePath(realDir) }
    })

    expect(result.stdout.trim()).toBe('real-tmux')
  })

  it('reaches the real tmux untouched when the pane opts out', () => {
    const root = scratch()
    const realDir = echoingTmux(root, 'bin', 'real-tmux')
    const shim = renderShim(root, realDir)

    const result = spawnSync(shim, ['attach'], {
      encoding: 'utf8',
      env: {
        PATH: runnablePath(realDir),
        ORCA_PANE_KEY: 'tab:leaf',
        ORCA_TMUX_SESSION_ISOLATION: 'off'
      }
    })

    expect(result.stdout.trim()).toBe('real-tmux')
  })
})
