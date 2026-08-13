#!/usr/bin/env node
// Argus rebrand codemod. Idempotent and re-runnable: after every upstream merge,
// run `node config/scripts/argus-rebrand.mjs` to re-apply the display-identity
// rename on top of fresh upstream code, then regenerate icons with
// `python3 config/argus-brand/generate-icons.py`.
//
// Scope — display identity only. CamelCase identifiers, env vars, hyphenated
// protocol tokens, and lowercase wire/binary names are intentionally untouched
// (see the guards on each pattern below).
// Deliberately out of scope (deferred): mobile/, docs/, README, and the skill *topic*
// names (argus-cli, argus-linear, …), which are identifiers with a compatibility ledger.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REPO = new URL('../..', import.meta.url).pathname

const SWEEP_DIRS = [
  'src/main',
  'src/renderer',
  'src/shared',
  'src/preload',
  'src/cli',
  'src/relay',
  'tests',
  'config/scripts'
]
// Agent-facing instructions: an un-renamed command here makes an agent type a binary that
// does not exist. Topic names (argus-cli, argus-linear, …) are identifiers and stay.
const SWEEP_DOC_DIRS = ['skill-guides', 'skills', 'skill-stubs']
const SWEEP_EXTS = new Set(['.ts', '.tsx', '.mts', '.mjs', '.cjs', '.json', '.html', '.md'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git'])

// Why: these suites use the upstream name as sample *data* — repo slugs (`acme/orca`),
// project ids (`local-orca`), CLI search terms — where the assertion is about case-folding
// or de-duplication, not display text. Renaming one side of such a pair breaks the very
// equality the test exists to prove, so they keep upstream's fixture vocabulary.
// This file is skipped too: sweeping it would rewrite the patterns below into no-ops.
const SKIP_FILES = new Set([
  'config/scripts/argus-rebrand.mjs',
  // `orca-dev` here is a GitHub repo owner in sample data, not the dev CLI.
  'src/renderer/src/components/terminal-pane/parked-terminal-byte-watcher.test.ts',
  'src/renderer/src/components/terminal-pane/terminal-handle-links.test.ts',
  // The generated hook script points at the userData directory, whose name must not
  // move or every existing dev profile is orphaned.
  'src/main/command-code/hook-service.test.ts',
  // Pins the legacy CLI name on purpose, to prove an older peer's value is honored.
  'src/main/runtime/orchestration/preamble.test.ts',
  // Matches the dev userData directory, which deliberately keeps its upstream name.
  'src/cli/handlers/orchestration.ts',
  'src/main/github/client.test.ts',
  'src/main/github/gh-utils.test.ts',
  'src/main/ipc/created-worktree-reconciliation.test.ts',
  'src/main/ipc/worktree-push-target-cleanup.test.ts',
  'src/main/orca-profiles/profile-project-presence.test.ts',
  'src/main/orca-profiles/profile-project-transfer.test.ts',
  'src/main/persistence.test.ts',
  'src/shared/project-host-setup-projection.test.ts',
  'src/renderer/src/components/task-page-default-repo-selection.test.ts',
  'src/renderer/src/components/cmd-j/palette-filter-options.test.ts',
  'src/renderer/src/components/cmd-j/palette-results.test.ts',
  'src/renderer/src/store/slices/github.test.ts'
])

const OLD = 'Or' + 'ca'
// Why: the negative look-arounds exclude the name inside a hyphenated compound
// (`X-Orca-Agent-Hook-Token`) or a word compound (`OrcaCloud`) — those are wire/protocol
// identifiers whose two sides live in different files, so a one-sided rename silently
// breaks a header or handshake match. Standalone display prose still renames.
const WORD = new RegExp(`(?<![-\\w])${OLD}(?![-\\w])`, 'g')
// Why there is no all-caps rule: bare `ORCA` here is overwhelmingly fixture *data* — a
// Jira project key, a repo search term matched against a lowercase fixture, a query whose
// exact character count a bounds test asserts. The one label that uppercases the product
// name does so at render time from the normal-case name.
// Why: some matchers compare against a lowercased message ("remote orca runtime …"), so
// the display rename would break classification unless the lowercase prose noun is renamed
// in lockstep. Never the bare token (CLI binary, orca.yaml, onorca.dev, GitHub slug).
const LOWER_PHRASE = /(?<![-\w])orca (runtime|cloud|relay)\b/g
const BUNDLE_ID = /com\.stablyai\.orca/g
// Why an explicit subcommand list: `orca` is also a config filename (orca.yaml), a URL
// scheme (orca://), a userData directory, a GitHub slug, and the GNOME screen reader.
// Renaming only where a real subcommand follows keeps every one of those intact.
// Deliberately excludes the subcommands whose names are ordinary English words —
// repo, project, file, agent, send, check, reply, ask, wait — because they also follow
// `orca` in prose and fixtures ("orca repo", owner `orca-dev`), where renaming corrupts
// sample data. Those invocations are renamed by hand where they are genuinely commands.
const CLI_SUBCOMMANDS =
  'status|open|serve|worktree|terminal|orchestration|browser|computer|linear|skills|' +
  'automations|artifacts|account|emulator|vm|agent-context|diagnostics|claude-teams|' +
  'dispatch|snapshot|screenshot|inbox'
const CLI_INVOCATION = new RegExp(`(?<![-/\\w])orca (?=(?:${CLI_SUBCOMMANDS})\\b)`, 'g')
// The dev shim, renamed in lockstep with the primary binary.
const DEV_CLI = /(?<![-/\w])orca-dev\b/g
// Why a second form: tests pin the bundle id inside a regex literal, where every dot is
// backslash-escaped, so the plain-text rule above walks straight past it.
const BUNDLE_ID_IN_REGEX = /com\\\.stablyai\\\.orca/g
// Why: distributable file names and the dev-channel release repos are lowercase, so the
// prose rules above miss them. The leading \b keeps `onorca.dev` out (its `orca` follows a
// word char), and the explicit suffix list keeps the CLI binary names (`orca`, `orca-ide`,
// whose on-disk assets this phase does not rename) intact.
const ARTIFACT = /\borca-(linux|macos|windows-setup|hourly|daily|adhoc)\b/g

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue
    }
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      yield* walk(full)
    } else if (SWEEP_EXTS.has(entry.slice(entry.lastIndexOf('.')))) {
      yield full
    }
  }
}

// Why: skills/, skill-guides/ and skill-stubs/ are deferred out of this phase, and their
// generators/tests compare generated bundles against those un-renamed sources — renaming
// only the tooling side would fail the drift checks that keep the two in sync.
const isSkillTooling = (relPath) => relPath.startsWith('config/scripts/') && /skill/i.test(relPath)

let filesChanged = 0
for (const dir of SWEEP_DIRS) {
  for (const file of walk(join(REPO, dir))) {
    const relPath = file.slice(REPO.length)
    if (SKIP_FILES.has(relPath) || isSkillTooling(relPath)) {
      continue
    }
    const before = readFileSync(file, 'utf8')
    const after = before
      .replace(WORD, 'Argus')
      .replace(LOWER_PHRASE, (_, kind) => `argus ${kind}`)
      .replace(BUNDLE_ID, 'dev.argus.desktop')
      .replace(BUNDLE_ID_IN_REGEX, 'dev\\.argus\\.desktop')
      .replace(ARTIFACT, 'argus-$1')
      .replace(CLI_INVOCATION, 'argus ')
      .replace(DEV_CLI, 'argus-dev')
      .replace(/GNOME(’s|'s)? Argus/g, (_, poss) => `GNOME${poss ?? ''} Orca`)
    if (after !== before) {
      writeFileSync(file, after)
      filesChanged += 1
    }
  }
}

// Skill docs are agent-facing instructions — an un-renamed command here makes an agent
// type a binary that does not exist. Prose renames apply; topic names do not.
for (const dir of SWEEP_DOC_DIRS) {
  for (const file of walk(join(REPO, dir))) {
    const before = readFileSync(file, 'utf8')
    const after = before
      .replace(WORD, 'Argus')
      .replace(CLI_INVOCATION, 'argus ')
      .replace(DEV_CLI, 'argus-dev')
      .replace(/GNOME(’s|'s)? Argus/g, (_, poss) => `GNOME${poss ?? ''} Orca`)
    if (after !== before) {
      writeFileSync(file, after)
      filesChanged += 1
    }
  }
}

// electron-builder: bundle id + lowercase artifact/executable names.
const builderPath = join(REPO, 'config/electron-builder.config.cjs')
const builderBefore = readFileSync(builderPath, 'utf8')
const builderAfter = builderBefore
  .replace(WORD, 'Argus')
  .replace(BUNDLE_ID, 'dev.argus.desktop')
  .replace(ARTIFACT, 'argus-$1')
if (builderAfter !== builderBefore) {
  writeFileSync(builderPath, builderAfter)
  filesChanged += 1
}

// package.json: package identity (bin names stay `orca` until the CLI rename phase).
const pkgPath = join(REPO, 'package.json')
const pkgBefore = readFileSync(pkgPath, 'utf8')
const pkgAfter = pkgBefore.replace('"name": "orca"', '"name": "argus"')
if (pkgAfter !== pkgBefore) {
  writeFileSync(pkgPath, pkgAfter)
  filesChanged += 1
}

console.log(`argus-rebrand: ${filesChanged} files changed`)
