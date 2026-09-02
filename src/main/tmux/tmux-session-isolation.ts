import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { buildTmuxSessionIsolationShim } from './tmux-session-isolation-shim-script'

const SHIM_ROOT_DIR = 'orca-tmux-session-isolation'
export const TMUX_SHIM_DIR_ENV = 'ORCA_TMUX_SHIM_DIR'
export const TMUX_REAL_BINARY_ENV = 'ORCA_REAL_TMUX'

/**
 * Puts a `tmux` shim on a pane's PATH so panes sharing a tmux session stop
 * mirroring each other. See tmux-session-isolation-shim-script.ts for why a
 * shared session mirrors at all.
 *
 * No-ops when tmux is absent (nothing to isolate) or on native Windows (no
 * tmux). WSL panes are not covered: the shim dir is a Windows path their PATH
 * cannot use.
 */
export function applyTmuxSessionIsolationEnv(
  baseEnv: Record<string, string>,
  options: { userDataPath: string; platform?: NodeJS.Platform }
): void {
  const platform = options.platform ?? process.platform
  if (platform === 'win32') {
    delete baseEnv[TMUX_SHIM_DIR_ENV]
    delete baseEnv[TMUX_REAL_BINARY_ENV]
    return
  }

  const basePath = baseEnv.PATH ?? process.env.PATH ?? ''
  const shimDir = join(options.userDataPath, SHIM_ROOT_DIR)
  const realTmux = resolveRealTmux(basePath, shimDir, baseEnv)
  if (!realTmux) {
    delete baseEnv[TMUX_SHIM_DIR_ENV]
    delete baseEnv[TMUX_REAL_BINARY_ENV]
    return
  }

  try {
    writeShimIfChanged(join(shimDir, 'tmux'), buildTmuxSessionIsolationShim(realTmux))
  } catch {
    return
  }

  baseEnv[TMUX_SHIM_DIR_ENV] = shimDir
  baseEnv[TMUX_REAL_BINARY_ENV] = realTmux
  // Why: sit immediately ahead of the real tmux instead of at the head of PATH,
  // so every other precedence the pane depends on (the bundled Argus CLI first
  // among them) is left exactly as it was.
  const entries = basePath.split(delimiter).filter((dir) => dir !== shimDir)
  entries.splice(entries.indexOf(dirname(realTmux)), 0, shimDir)
  baseEnv.PATH = entries.join(delimiter)
}

/**
 * Skips both Argus shim dirs: resolving to one of them would make the shim
 * re-enter itself, or hand real attaches to the agent-teams pane emulator.
 */
function resolveRealTmux(
  pathValue: string,
  shimDir: string,
  baseEnv: Record<string, string>
): string | null {
  const excluded = new Set([shimDir, baseEnv.ORCA_AGENT_TEAMS_SHIM_DIR].filter(Boolean) as string[])
  for (const dir of pathValue.split(delimiter)) {
    if (!dir || excluded.has(dir)) {
      continue
    }
    const candidate = join(dir, 'tmux')
    try {
      if (existsSync(candidate)) {
        accessSync(candidate, constants.X_OK)
        return candidate
      }
    } catch {
      continue
    }
  }
  return null
}

function writeShimIfChanged(path: string, contents: string): void {
  try {
    if (readFileSync(path, 'utf8') === contents) {
      return
    }
  } catch {
    // absent or unreadable: rewrite below
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents, 'utf8')
  chmodSync(path, 0o755)
}
