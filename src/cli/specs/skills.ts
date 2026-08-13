import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const SKILL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['skills', 'list'],
    summary: 'List version-matched skill guides bundled with this Argus CLI',
    usage: 'argus skills list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads bundled guide metadata locally without contacting the Argus runtime.',
      'With --json, prints a topics array of canonical names and one-line descriptions.',
      'Use `argus skills get <name>` for the full guide, or `argus skills install` to install skills.'
    ]
  },
  {
    path: ['skills', 'get'],
    aliases: [['skills', 'show']],
    summary: 'Print a version-matched skill guide as Markdown',
    usage: 'argus skills get <topic> [--full] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'topic', 'full'],
    positionalArgs: ['topic'],
    notes: [
      'Reads bundled guide content locally without contacting the Argus runtime.',
      'Use --full to include bundled reference documents when the guide provides them.',
      'Use --json for a deterministic object containing canonical topic metadata and content.'
    ],
    examples: ['argus skills get argus-cli', 'argus skills get orchestration --full']
  },
  {
    path: ['skills', 'install'],
    summary: 'Install bundled Argus skills via the community skills CLI',
    usage:
      'argus skills install [--skill <name>]... [--all] [--agent <name>[,<name>]] ' +
      '[--local] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'all', 'agent', 'local', 'dry-run'],
    notes: [
      'Reads the bundled skill registry locally without contacting the Argus runtime.',
      'Resolves to the same `npx skills add <repo> --skill <name> ...` command used by ' +
        'Argus Settings, plus the non-interactive flags an unattended host needs ' +
        '(`npx --yes` and `-y`), then runs it and forwards its output and exit code.',
      'Installs globally (all projects, adds --global) by default. Use --local to install ' +
        'into the current project instead.',
      'Targets the coding agents Argus detects on this host, plus the shared ' +
        '.agents/skills directory. Without an explicit target the skills CLI installs ' +
        'into every agent it knows about, which litters a host with config ' +
        'directories for agents it does not have.',
      'Use --agent <name>[,<name>...] to choose targets yourself, or --agent universal ' +
        'for the shared directory alone. Required when Argus detects no agent.',
      'Use --dry-run to print the resolved command without running it.',
      'With --json, the skill listing and --dry-run emit JSON; a real install streams ' +
        "npx's own non-JSON output live and rejects --json.",
      'Omit --skill and --all to list installable skill names.',
      'Intended for headless hosts (SSH, containers, CI) with no desktop Settings UI to copy the install command from.'
    ],
    examples: [
      'argus skills install',
      'argus skills install --skill argus-cli --skill orchestration',
      'argus skills install --skill argus-cli --local',
      'argus skills install --skill argus-cli --agent claude-code,codex',
      'argus skills install --all --dry-run'
    ]
  },
  {
    path: ['skills', 'update'],
    summary: 'Update already-installed Argus skills via the community skills CLI',
    usage: 'argus skills update [--skill <name>]... [--all] [--local] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'skill', 'all', 'local', 'dry-run'],
    notes: [
      'Reads the bundled skill registry locally without contacting the Argus runtime.',
      'Resolves to the same `npx skills update <names...>` command used by Argus Settings, ' +
        'plus the non-interactive flags an unattended host needs (`npx --yes` and `-y`), ' +
        'then runs it and forwards its output and exit code.',
      'Updates the global install (all projects, adds --global) by default. Use --local to ' +
        'update the current project instead.',
      'Only refreshes skills that are already installed; use `argus skills install` first.',
      'Use --dry-run to print the resolved command without running it.',
      'With --json, the skill listing and --dry-run emit JSON; a real update streams ' +
        "npx's own non-JSON output live and rejects --json.",
      'Omit --skill and --all to list updatable skill names.',
      'Intended for headless hosts (SSH, containers, CI) with no desktop Settings UI to copy the update command from.'
    ],
    examples: [
      'argus skills update',
      'argus skills update --skill argus-cli --skill orchestration',
      'argus skills update --skill argus-cli --local',
      'argus skills update --all --dry-run'
    ]
  }
]
