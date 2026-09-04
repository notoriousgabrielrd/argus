import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as pty from 'node-pty'
import { afterEach, describe, expect, it } from 'vitest'
import { applyTmuxSessionIsolationEnv, TMUX_SHIM_DIR_ENV } from './tmux-session-isolation'

const hasTmux = process.platform !== 'win32' && spawnSync('tmux', ['-V']).status === 0
const SOCKET = `orca-isolation-${process.pid}`
const BASE = 'agentes-fixture'
const IDLE = 'sh -c "while :; do sleep 5; done"'

const dirs: string[] = []
const clients: pty.IPty[] = []

function tmux(...args: string[]): string {
  return spawnSync('tmux', ['-L', SOCKET, ...args], { encoding: 'utf8' }).stdout ?? ''
}

function shimEnvFor(paneKey: string): { shim: string; env: Record<string, string> } {
  const root = mkdtempSync(join(tmpdir(), 'orca-tmux-shim-'))
  dirs.push(root)
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', ORCA_PANE_KEY: paneKey }
  applyTmuxSessionIsolationEnv(env, { userDataPath: root })
  return { shim: join(env[TMUX_SHIM_DIR_ENV], 'tmux'), env }
}

/** Replays the shape of a shell wrapper that opens one window per pane and then
 * attaches to the shared project session — the sequence that mirrors panes. */
function openPane(paneKey: string, isolate: boolean): void {
  const { shim, env } = shimEnvFor(paneKey)
  env.ORCA_TMUX_SESSION_ISOLATION = isolate ? 'on' : 'off'
  const window = `win-${paneKey}`
  const create =
    tmux('has-session', '-t', `=${BASE}`).length > 0 ||
    spawnSync('tmux', ['-L', SOCKET, 'has-session', '-t', `=${BASE}`]).status === 0
      ? ['new-window', '-t', `=${BASE}`, '-n', window, IDLE]
      : ['new-session', '-d', '-s', BASE, '-n', window, IDLE]
  spawnSync(shim, ['-L', SOCKET, ...create], { env })
  clients.push(
    pty.spawn(shim, ['-L', SOCKET, 'attach', '-t', `=${BASE}`], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      env
    })
  )
}

async function waitForClients(count: number): Promise<string[]> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const names = tmux('list-clients', '-F', '#{client_name}').split('\n').filter(Boolean)
    if (names.length >= count) {
      return names
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return tmux('list-clients', '-F', '#{client_name}').split('\n').filter(Boolean)
}

function windowsOnScreen(clientNames: string[]): string[] {
  return clientNames.map((name) =>
    tmux('display-message', '-p', '-t', name, '#{window_name}').trim()
  )
}

afterEach(() => {
  for (const client of clients.splice(0)) {
    try {
      client.kill()
    } catch {
      // already gone
    }
  }
  tmux('kill-server')
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe.skipIf(!hasTmux)('tmux session isolation, against a real tmux server', () => {
  it('mirrors every pane onto one window when isolation is off', async () => {
    openPane('tab:pane-one', false)
    openPane('tab:pane-two', false)
    openPane('tab:pane-three', false)

    const seen = windowsOnScreen(await waitForClients(3))

    expect(seen).toHaveLength(3)
    expect(new Set(seen).size).toBe(1)
  })

  it('gives each pane its own window through a grouped view', async () => {
    openPane('tab:pane-one', true)
    openPane('tab:pane-two', true)
    openPane('tab:pane-three', true)

    const names = await waitForClients(3)
    const seen = windowsOnScreen(names)

    expect(new Set(seen).size).toBe(3)
    expect(new Set(seen)).toEqual(
      new Set(['win-tab:pane-one', 'win-tab:pane-two', 'win-tab:pane-three'])
    )
    // The project session keeps every window; views only borrow them.
    const windows = tmux('list-windows', '-t', `=${BASE}`, '-F', '#{window_name}')
      .split('\n')
      .filter(Boolean)
    expect(windows).toHaveLength(3)
  })

  it('collects a view once its pane is gone, leaving the project session intact', async () => {
    openPane('tab:pane-one', true)
    await waitForClients(1)

    const view = () =>
      tmux('list-sessions', '-F', '#{session_name}')
        .split('\n')
        .filter((name) => name.includes('@orca-'))
    expect(view()).toHaveLength(1)

    clients.splice(0).forEach((client) => client.kill())
    // A pane killed before destroy-unattached is armed waits out the shim's arming
    // window, which stretches under parallel-suite load.
    for (let attempt = 0; attempt < 80 && view().length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    expect(view()).toHaveLength(0)
    expect(tmux('list-sessions', '-F', '#{session_name}').trim()).toBe(BASE)
  })
})
