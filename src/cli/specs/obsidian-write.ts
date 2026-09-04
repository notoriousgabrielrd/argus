import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const VAULT_FLAGS = [...GLOBAL_FLAGS, 'vault']
const CONTENT_FLAGS = ['content', 'content-file']

export const OBSIDIAN_WRITE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['obsidian', 'create'],
    aliases: [['obsidian', 'new']],
    summary: 'Create a note, optionally with frontmatter properties or from a template note',
    usage:
      'argus obsidian create <path> [--vault <vault>] [--content <text> | --content-file <path|->] [--property <key=value>...] [--template <note>] [--overwrite] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'path', ...CONTENT_FLAGS, 'property', 'template', 'overwrite'],
    positionalArgs: ['path'],
    examples: [
      'argus obsidian create "Meetings/2026-09-02 Kickoff.md" --content-file ./notes.md --property status=open --json',
      'argus obsidian create "Projects/New.md" --template "Templates/Project" --json'
    ]
  },
  {
    path: ['obsidian', 'append'],
    summary: 'Append content to a note, or to one heading section of it',
    usage:
      'argus obsidian append <note> --content <text> | --content-file <path|-> [--vault <vault>] [--heading <heading>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', ...CONTENT_FLAGS, 'heading'],
    positionalArgs: ['note'],
    notes: ['Frontmatter is preserved; only the note body changes.'],
    examples: [
      'argus obsidian append "Daily/2026-09-02.md" --content "- shipped the vault index" --json',
      'argus obsidian append Roadmap --heading "## Now" --content "- Obsidian integration" --json'
    ]
  },
  {
    path: ['obsidian', 'prepend'],
    summary: 'Insert content at the top of a note body',
    usage:
      'argus obsidian prepend <note> --content <text> | --content-file <path|-> [--vault <vault>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', ...CONTENT_FLAGS],
    positionalArgs: ['note']
  },
  {
    path: ['obsidian', 'replace'],
    summary: 'Replace a note body, or the content under one heading',
    usage:
      'argus obsidian replace <note> --content <text> | --content-file <path|-> [--vault <vault>] [--heading <heading>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', ...CONTENT_FLAGS, 'heading'],
    positionalArgs: ['note'],
    notes: ['Without --heading this rewrites the whole body. Frontmatter is kept either way.']
  },
  {
    path: ['obsidian', 'set-property'],
    summary: 'Set a frontmatter property on a note',
    usage:
      'argus obsidian set-property <note> --key <key> --value <value> [--type text|number|checkbox|list|date] [--vault <vault>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', 'key', 'value', 'type'],
    positionalArgs: ['note'],
    examples: [
      'argus obsidian set-property "Projects/Argus.md" --key status --value shipped --json'
    ]
  },
  {
    path: ['obsidian', 'remove-property'],
    destructive: true,
    summary: 'Remove a frontmatter property from a note',
    usage: 'argus obsidian remove-property <note> --key <key> [--vault <vault>] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', 'key'],
    positionalArgs: ['note']
  },
  {
    path: ['obsidian', 'rename'],
    summary: 'Rename a note and rewrite every link that pointed at it',
    usage:
      'argus obsidian rename <note> --to <path> [--vault <vault>] [--no-update-links] [--overwrite] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', 'to', 'no-update-links', 'overwrite'],
    positionalArgs: ['note'],
    examples: ['argus obsidian rename "Projects/Old.md" --to "Projects/New.md" --json']
  },
  {
    path: ['obsidian', 'move'],
    summary: 'Move a note into another folder, rewriting links that used a path',
    usage:
      'argus obsidian move <note> --to <folder> [--vault <vault>] [--no-update-links] [--overwrite] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', 'to', 'no-update-links', 'overwrite'],
    positionalArgs: ['note'],
    examples: ['argus obsidian move "Inbox/Idea.md" --to Projects --json']
  },
  {
    path: ['obsidian', 'delete'],
    aliases: [['obsidian', 'rm']],
    destructive: true,
    summary: 'Move a note to the vault trash, or delete it outright',
    usage: 'argus obsidian delete <note> [--vault <vault>] [--permanent] [--json]',
    allowedFlags: [...VAULT_FLAGS, 'note', 'permanent'],
    positionalArgs: ['note'],
    notes: [
      'Without --permanent the note lands in the vault’s .trash folder and stays recoverable in Obsidian.'
    ]
  }
]
