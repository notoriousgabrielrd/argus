import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectDir = resolve(import.meta.dirname, '../..')
// Why assert the guide rather than the stub: argus-seats ships a hybrid discovery stub, so the
// version-sensitive command guidance lives in the authoritative source. The stub projection is
// checked separately below.
const guidePath = join(projectDir, 'skill-guides', 'argus-seats.md')
const stubPath = join(projectDir, 'skills', 'argus-seats', 'SKILL.md')

function readGuide() {
  return readFileSync(guidePath, 'utf8')
}

function getSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = markdown.match(new RegExp(`## ${escaped}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`))
  expect(match).not.toBeNull()
  return match?.[1] ?? ''
}

describe('argus-seats skill guidance', () => {
  it('draws the seat/subagent boundary by cost and visibility, not by preference', () => {
    const section = getSection(readGuide(), 'Seat or subagent')

    expect(section).toContain('a separate')
    expect(section).toContain('visible pane')
    // The reason a subagent is the wrong default for owned work is mechanical, and a guide
    // that only said "prefer seats" would lose the argument to the tool that is one call away.
    expect(section).toContain('runs inside *your* session')
    expect(section).toContain('invisible')
    expect(section).toContain('read-only search')
  })

  it('makes an agent load its own persona, since Argus reads only the frontmatter', () => {
    const section = getSection(readGuide(), 'Who am I')

    expect(section).toContain('--terminal self')
    expect(section).toContain('reads only the frontmatter')
    expect(section).toContain('injects the role into you')
    expect(section).toContain('definitionPath')
    // All three layers have to be named, or an agent that finds nothing in .claude/agents/
    // concludes it has no persona at all.
    expect(section).toContain('baseline shipped inside Argus')
  })

  it('keeps the trail rule, which is what stops a delegation loop', () => {
    const section = getSection(readGuide(), 'Hand work to another seat')

    expect(section).toContain('Trail:')
    expect(section).toContain('never send to a seat already on it')
    expect(section).toContain('Address the seat, never the handle')
    expect(section).toContain('Do not babysit')
    expect(section).toContain('tui-idle')
  })

  it('warns that a bare claude can collapse every pane onto one process', () => {
    const section = getSection(readGuide(), 'Staff a vacant seat')

    expect(section).toContain('absolute path to the binary')
    expect(section).toContain('tmux')
    expect(section).toContain('--dangerously-skip-permissions')
    expect(section).toContain('unknown_project_agent')
  })

  it('points specialization at the store, never at the checkout', () => {
    const section = getSection(readGuide(), "Give a role this project's knowledge")

    expect(section).toContain('agentStoreDir')
    expect(section).toContain('no file in anyone')
    // A persona that generalizes from another project is the failure this baseline exists to
    // avoid, so the guide has to say it rather than imply it.
    expect(section).toContain('generalizes from another project')
  })

  it('ships a stub that defers to the binary instead of caching flags', () => {
    const stub = readFileSync(stubPath, 'utf8')

    expect(stub).toContain('ORCA skills get argus-seats')
    expect(stub).toContain('discovery stub, not the usage guide')
    expect(stub).toContain('GNOME Orca screen reader')
    expect(stub).toContain('$ORCA_CLI_COMMAND')
  })
})

describe('argus-cli guidance on seats', () => {
  const cliGuide = readFileSync(join(projectDir, 'skill-guides', 'argus-cli.md'), 'utf8')

  it('describes the three layers instead of the project directory alone', () => {
    expect(cliGuide).toContain('resolve across three layers')
    expect(cliGuide).toContain('`source` and `definitionPath`')
    // The old text promised a refusal that no longer happens, which is worse for a new user
    // than saying nothing: they would see `assign` succeed against the documentation.
    expect(cliGuide).toContain('refuses only a name no layer defines')
    expect(cliGuide).not.toContain('refuses a name the workspace does not define')
  })

  it('stops promising a per-project bundled roster', () => {
    expect(cliGuide).toContain('the generic chart shipped with Argus')
    expect(cliGuide).not.toContain('else a roster bundled with Argus')
  })

  it('hands off to the seat protocol rather than restating it', () => {
    expect(cliGuide).toContain('ORCA skills get argus-seats')
  })
})
