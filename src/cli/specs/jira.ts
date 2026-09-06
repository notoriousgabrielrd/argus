import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const JIRA_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['jira', 'status'],
    summary: 'Show the connected Jira site and account',
    usage: 'argus jira status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['argus jira status', 'argus jira status --json']
  },
  {
    path: ['jira', 'project', 'list'],
    summary: 'List Jira projects on the connected site',
    usage: 'argus jira project list [--site <siteId>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'site'],
    examples: ['argus jira project list', 'argus jira project list --json']
  },
  {
    path: ['jira', 'type', 'list'],
    summary: 'List issue types available in a Jira project',
    usage: 'argus jira type list --project <key|id> [--site <siteId>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'site'],
    examples: ['argus jira type list --project AB', 'argus jira type list --project AB --json']
  },
  {
    path: ['jira', 'create'],
    summary: 'Create a Jira issue',
    usage:
      'argus jira create --project <key|id> --type <name|id> --title <title> [--body <text> | --body-file <path|->] [--site <siteId>] [--dry-run] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'project',
      'type',
      'title',
      'body',
      'body-file',
      'site',
      'dry-run'
    ],
    examples: [
      'argus jira create --project AB --type Tarefa --title "Fix recurrence update" --body-file card.md',
      'cat card.md | argus jira create --project AB --type Bug --title "Series edit drops fields" --body-file -',
      'argus jira create --project AB --type Tarefa --title "Draft" --body-file card.md --dry-run'
    ]
  }
]
