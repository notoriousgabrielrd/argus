import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const VAULT_FLAGS = [...GLOBAL_FLAGS, 'vault']

export const OBSIDIAN_READ_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['obsidian', 'vaults'],
    summary: 'List the Obsidian vaults Argus can reach',
    usage: 'argus obsidian vaults [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Vaults the Obsidian desktop app has opened are discovered automatically; `vault-add` registers extra folders.'
    ],
    examples: ['argus obsidian vaults --json']
  },
  {
    path: ['obsidian', 'vault-add'],
    summary: 'Register a vault folder Obsidian has not opened on this machine',
    usage: 'argus obsidian vault-add <path> [--name <name>] [--make-default] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'name', 'make-default'],
    positionalArgs: ['path'],
    examples: ['argus obsidian vault-add ~/Notes --name Personal --make-default --json']
  },
  {
    path: ['obsidian', 'vault-remove'],
    aliases: [['obsidian', 'vault-rm']],
    destructive: true,
    summary: 'Forget a manually registered vault (the folder is left untouched)',
    usage: 'argus obsidian vault-remove <vault> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'vault'],
    positionalArgs: ['vault']
  },
  {
    path: ['obsidian', 'vault-default'],
    summary: 'Pick the vault used when a command omits --vault',
    usage: 'argus obsidian vault-default <vault> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'vault'],
    positionalArgs: ['vault']
  },
  {
    path: ['obsidian', 'info'],
    summary: 'Show note, folder, tag, and dangling-link counts for a vault',
    usage: 'argus obsidian info [--vault <vault>] [--json]',
    allowedFlags: VAULT_FLAGS,
    examples: ['argus obsidian info --json']
  },
  {
    path: ['obsidian', 'notes'],
    aliases: [['obsidian', 'list']],
    summary: 'List notes, filtered by folder, tag, frontmatter property, or edit time',
    usage:
      'argus obsidian notes [--vault <vault>] [--folder <folder>] [--tag <tag>...] [--property <key=value>...] [--has-property <key>...] [--modified-since <7d|iso>] [--name <text>] [--sort modified|created|name|path|size] [--desc] [--limit <n>] [--json]',
    allowedFlags: [
      ...VAULT_FLAGS,
      'folder',
      'tag',
      'property',
      'has-property',
      'modified-since',
      'name',
      'sort',
      'desc',
      'limit'
    ],
    examples: [
      'argus obsidian notes --tag project --modified-since 7d --json',
      'argus obsidian notes --folder Meetings --property status=open --limit 20 --json'
    ]
  },
  {
    path: ['obsidian', 'read'],
    aliases: [['obsidian', 'get']],
    summary: 'Read a note with its frontmatter, links, and backlinks',
    usage:
      'argus obsidian read <note> [--vault <vault>] [--section <heading>] [--no-content] [--no-backlinks] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', 'section', 'no-content', 'no-backlinks'],
    positionalArgs: ['note'],
    notes: [
      'A note can be named by vault-relative path, filename, or title; ambiguous names return the candidates.'
    ],
    examples: [
      'argus obsidian read "Projects/Argus.md" --json',
      'argus obsidian read Argus --section "## Decisions" --json'
    ]
  },
  {
    path: ['obsidian', 'search'],
    summary: 'Full-text search across the vault',
    usage:
      'argus obsidian search <query> [--vault <vault>] [--regex] [--case-sensitive] [--folder <folder>] [--tag <tag>...] [--titles-only] [--limit <n>] [--json]',
    allowedFlags: [
      ...VAULT_FLAGS,
      'query',
      'regex',
      'case-sensitive',
      'folder',
      'tag',
      'titles-only',
      'limit'
    ],
    positionalArgs: ['query'],
    examples: [
      'argus obsidian search "rate limit" --limit 10 --json',
      'argus obsidian search "^TODO" --regex --folder Work --json'
    ]
  },
  {
    path: ['obsidian', 'links'],
    summary: 'Show a note’s outgoing links and backlinks, or the vault’s dangling links',
    usage: 'argus obsidian links [<note>] [--vault <vault>] [--unresolved] [--limit <n>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', 'unresolved', 'limit'],
    positionalArgs: ['note'],
    notes: [
      'With --unresolved and no note, reports every link in the vault that resolves to nothing.'
    ],
    examples: [
      'argus obsidian links "Projects/Argus.md" --json',
      'argus obsidian links --unresolved --json'
    ]
  },
  {
    path: ['obsidian', 'tags'],
    summary: 'List vault tags with note counts',
    usage: 'argus obsidian tags [--vault <vault>] [--prefix <prefix>] [--limit <n>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'prefix', 'limit'],
    examples: ['argus obsidian tags --prefix project --json']
  },
  {
    path: ['obsidian', 'tree'],
    summary: 'Show the vault folder structure with note counts',
    usage:
      'argus obsidian tree [--vault <vault>] [--folder <folder>] [--depth <n>] [--include-notes] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'folder', 'depth', 'include-notes'],
    examples: ['argus obsidian tree --depth 2 --json']
  },
  {
    path: ['obsidian', 'daily'],
    summary: 'Resolve the daily note for a date, optionally creating it',
    usage:
      'argus obsidian daily [--vault <vault>] [--date <today|yesterday|yyyy-mm-dd>] [--create] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'date', 'create'],
    notes: ['Uses the vault’s Daily Notes settings for folder, filename format, and template.'],
    examples: ['argus obsidian daily --create --json']
  },
  {
    path: ['obsidian', 'open'],
    summary: 'Open a vault or note in the Obsidian desktop app',
    usage: 'argus obsidian open [<note>] [--vault <vault>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note'],
    positionalArgs: ['note'],
    examples: ['argus obsidian open "Projects/Argus.md" --json']
  }
]
