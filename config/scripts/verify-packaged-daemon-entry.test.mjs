import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  assertPackagedDaemonEntryExists,
  verifyPackagedDaemonEntryBoots
} = require('./verify-packaged-daemon-entry.cjs')

describe('verify-packaged-daemon-entry', () => {
  let resourcesDir

  beforeEach(() => {
    resourcesDir = mkdtempSync(join(tmpdir(), 'orca-daemon-entry-verify-'))
  })

  afterEach(() => {
    delete process.env.ORCA_DAEMON_ENTRY_BOOT_TIMEOUT_MS
    rmSync(resourcesDir, { recursive: true, force: true })
  })

  function writePackagedEntry(source) {
    const entryDir = join(resourcesDir, 'app.asar.unpacked', 'out', 'main')
    mkdirSync(entryDir, { recursive: true })
    writeFileSync(join(entryDir, 'daemon-entry.js'), source)
  }

  // Why: a silent skip on a missing entry false-passed exactly the packaged
  // layout regression this gate exists to catch (rc.1 daemon-load incident).
  it('throws when the unpacked daemon entry is missing', () => {
    expect(() => assertPackagedDaemonEntryExists(resourcesDir)).toThrow(
      /missing unpacked daemon entry/
    )
    expect(() => verifyPackagedDaemonEntryBoots(resourcesDir)).toThrow(
      /missing unpacked daemon entry/
    )
  })

  it('passes when the packaged entry loads and reaches argv parsing', () => {
    writePackagedEntry('console.error("Usage: daemon-entry <socket>"); process.exit(1)\n')
    expect(() => verifyPackagedDaemonEntryBoots(resourcesDir)).not.toThrow()
  })

  it('fails when the packaged entry cannot resolve its module graph', () => {
    writePackagedEntry('require("orca-module-that-does-not-exist")\n')
    expect(() => verifyPackagedDaemonEntryBoots(resourcesDir)).toThrow(
      /failed to load under plain Node/
    )
  })

  // Why: afterPack cold-starts Node off a tree XProtect/Spotlight is still
  // sweeping, so a stalled boot must retry rather than read as a load failure.
  it('retries once when the first boot exceeds the timeout', () => {
    const stampPath = join(resourcesDir, 'boot-attempted')
    writePackagedEntry(
      `const { existsSync, writeFileSync } = require('node:fs')\n` +
        `const stamp = ${JSON.stringify(stampPath)}\n` +
        `if (existsSync(stamp)) {\n` +
        `  console.error('Usage: daemon-entry <socket>')\n` +
        `  process.exit(1)\n` +
        `}\n` +
        `writeFileSync(stamp, '1')\n` +
        `setTimeout(() => {}, 60_000)\n`
    )
    process.env.ORCA_DAEMON_ENTRY_BOOT_TIMEOUT_MS = '750'
    expect(() => verifyPackagedDaemonEntryBoots(resourcesDir)).not.toThrow()
  })

  it('fails when every boot attempt exceeds the timeout', () => {
    writePackagedEntry('setTimeout(() => {}, 60_000)\n')
    process.env.ORCA_DAEMON_ENTRY_BOOT_TIMEOUT_MS = '750'
    expect(() => verifyPackagedDaemonEntryBoots(resourcesDir)).toThrow(/ETIMEDOUT/)
  })

  it('fails when the packaged entry never reaches argv parsing', () => {
    writePackagedEntry('process.exit(0)\n')
    expect(() => verifyPackagedDaemonEntryBoots(resourcesDir)).toThrow(/did not reach argv parsing/)
  })
})
