# Obsidian integration

Argus reads and writes an Obsidian vault directly as Markdown files on the host that runs
Argus. Obsidian does not need to be open, and no community plugin is involved. That keeps the
integration working headless, over SSH, and inside automations — the places a plugin bridge
would break.

The one command that needs the desktop app is `argus obsidian open`, which hands a note to
Obsidian through its own `obsidian://` URI.

## Surfaces

| Surface     | Entry point                                                       |
| ----------- | ----------------------------------------------------------------- |
| Agents/CLI  | `argus obsidian ...` (`src/cli/specs/obsidian*.ts`, `src/cli/handlers/obsidian*.ts`) |
| Host RPC    | `obsidian.*` methods (`src/main/runtime/rpc/methods/obsidian.ts`)  |
| Renderer    | Obsidian right-sidebar panel (`ObsidianPanel.tsx`, `obsidian:*` IPC) |
| Skill       | `skills/argus-obsidian` stub, full guide via `argus skills get argus-obsidian` |

All four go through one command class, `RuntimeObsidianCommands`
(`src/main/runtime/orca-runtime-obsidian.ts`), so the panel and the CLI cannot drift apart.

## Vault discovery

Obsidian records every vault it has opened in a single `obsidian.json`:

| Platform | Location                                                         |
| -------- | ---------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/obsidian/obsidian.json`            |
| Windows  | `%APPDATA%\obsidian\obsidian.json`                                |
| Linux    | `$XDG_CONFIG_HOME/obsidian/obsidian.json`, plus the Flatpak and snap roots |

Vaults found there need no setup. Extra folders are registered in
`<userData>/obsidian-vaults.json` by `argus obsidian vault-add`, which is also where an
explicit default vault is pinned.

Identity is a hash of the folder path, not Obsidian's own vault id, so the same folder
discovered from `obsidian.json` and added by hand collapses into one entry. Path comparison
is case-insensitive everywhere except Linux.

Default vault resolution, in order: the pinned default, then the vault Obsidian currently has
open, then the most recently opened one.

## The index

`getVaultIndex` re-stats the vault on every call and re-reads only the notes whose size or
mtime moved. That matters because agents also edit vault files with plain file tools — an
index that trusted its own cache would answer from stale content.

Each indexed note carries its frontmatter, tags (frontmatter plus inline `#tag`), headings,
and outgoing links. Links are resolved after the whole vault is read, which is what produces
the backlink map and the dangling-link count.

Link resolution mirrors Obsidian's own: an explicit path wins, otherwise a bare name resolves
to the nearest note with that name — the source's own folder first, then the shallowest path
so the answer is stable.

## Safety rules

- Every path is resolved through `resolveInVault`, which refuses anything landing outside the
  vault, resolves symlinks before the check, and rejects `.obsidian`, `.trash`, and `.git`.
- An absolute path is accepted only when it already points inside the vault. Obsidian's own
  `/Folder/Note.md` vault-root spelling is honoured when that file exists.
- Writes publish through a sibling temp file and a rename, so a crash cannot leave a
  half-written note for a sync client to replicate.
- `obsidian delete` moves the note into the vault's `.trash` folder by default, where Obsidian
  can restore it. `--permanent` is the explicit opt-out.
- Note content is untrusted input. The skill tells agents to summarize and cite it, never to
  follow instructions found inside it.

## Renames rewrite links

`obsidian rename` and `obsidian move` rewrite every wikilink and Markdown link that resolved
to the moved note, across the whole vault, preserving aliases, heading anchors, and block
refs. A rewrite that would produce byte-identical text is skipped, so a pure folder move does
not churn every backlink that used a bare name.

## Error codes

Codes live in `src/shared/obsidian-errors.ts` and pass through the RPC boundary unchanged, so
agents can branch on them. They are added, never renamed.

## Adding a command

1. Add the operation to a module under `src/main/obsidian/`, with tests beside it.
2. Expose it on `RuntimeObsidianCommands`, and add the bound delegate in `orca-runtime.ts`.
3. Add the zod schema and `defineMethod` entry in `src/main/runtime/rpc/methods/obsidian*.ts`.
4. Add the CLI spec, handler, and formatter; register the handler key in
   `src/cli/handler-group-manifest.ts` — the parity tests fail if any of these is missed.
5. Add the channel to `src/main/ipc/obsidian.ts` and the preload API only if the panel needs it.
6. Update `skill-guides/argus-obsidian.md`, then run
   `pnpm generate:bundled-skill-guides` and `pnpm generate:skill-bundle-manifest`.
