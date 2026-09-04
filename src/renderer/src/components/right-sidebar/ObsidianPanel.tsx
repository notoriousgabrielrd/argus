import { FolderPlus, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { ObsidianVaultTree } from './ObsidianVaultTree'
import { useObsidianVaultBrowser } from './obsidian-vault-browser-state'
import { useAppStore } from '@/store'

type ObsidianPanelProps = {
  isVisible?: boolean
}

export default function ObsidianPanel({ isVisible = true }: ObsidianPanelProps): React.JSX.Element {
  const browser = useObsidianVaultBrowser(isVisible)
  const openObsidianNote = useAppStore((s) => s.openObsidianNote)
  const openedNotePath = useAppStore((s) => s.obsidianOpenNote?.notePath ?? null)
  const vault = browser.activeVault

  // Why: the note renders in the main area, beside where terminals live — the
  // sidebar stays a navigator, the way the file explorer does.
  const selectNote = (path: string): void => {
    if (vault) {
      openObsidianNote({ vaultId: vault.id, vaultName: vault.name, notePath: path })
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-sidebar-border px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="max-w-full truncate text-left text-xs font-semibold text-foreground hover:text-foreground/80"
                >
                  {browser.activeVault?.name ??
                    translate('auto.components.right.sidebar.ObsidianPanel.noVault', 'No vault')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-w-80">
                {browser.vaults.map((vault) => (
                  <DropdownMenuItem
                    key={vault.id}
                    onSelect={() => browser.selectVault(vault.id)}
                    disabled={!vault.available}
                  >
                    <span className="truncate">{vault.name}</span>
                    <span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
                      {vault.path}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={browser.addVault}>
                  <FolderPlus className="size-3.5" />
                  {translate(
                    'auto.components.right.sidebar.ObsidianPanel.addVault',
                    'Add vault folder…'
                  )}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="truncate text-[11px] text-muted-foreground">
              {browser.stats
                ? translate(
                    'auto.components.right.sidebar.ObsidianPanel.vaultSummary',
                    '{{value0}} notes · {{value1}} tags',
                    { value0: browser.stats.notes, value1: browser.stats.tags }
                  )
                : translate(
                    'auto.components.right.sidebar.ObsidianPanel.subtitle',
                    'Obsidian vault'
                  )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={browser.refresh}
            title={translate('auto.components.right.sidebar.ObsidianPanel.refresh', 'Refresh')}
          >
            {browser.loading ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={browser.query}
            onChange={(event) => browser.setQuery(event.target.value)}
            placeholder={translate(
              'auto.components.right.sidebar.ObsidianPanel.searchPlaceholder',
              'Search notes'
            )}
            className="h-7 w-full rounded border border-border bg-input pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {browser.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {browser.tags.map((tag) => (
              <button
                key={tag.tag}
                type="button"
                onClick={() => browser.toggleTag(tag.tag)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                  browser.activeTag === tag.tag
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                #{tag.tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {browser.error && (
        <div className="shrink-0 border-b border-sidebar-border px-2.5 py-2 text-[11px] text-destructive">
          {browser.error}
        </div>
      )}

      {browser.vaults.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <div className="text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.ObsidianPanel.emptyState',
              'No Obsidian vault found on this machine.'
            )}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={browser.addVault}>
            <FolderPlus className="size-3.5" />
            {translate('auto.components.right.sidebar.ObsidianPanel.addVault', 'Add vault folder…')}
          </Button>
        </div>
      ) : (
        <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto py-1">
          {browser.searchRows ? (
            browser.searchRows.length === 0 ? (
              <div className="px-2.5 py-3 text-[11px] text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.ObsidianPanel.noResults',
                  'No notes matched.'
                )}
              </div>
            ) : (
              browser.searchRows.map((row) => (
                <button
                  key={row.path}
                  type="button"
                  onClick={() => selectNote(row.path)}
                  data-current={openedNotePath === row.path ? 'true' : undefined}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 px-2.5 py-1 text-left hover:bg-accent',
                    openedNotePath === row.path && 'bg-accent'
                  )}
                >
                  <span className="w-full truncate text-xs text-foreground">{row.title}</span>
                  <span className="w-full truncate font-mono text-[10px] text-muted-foreground">
                    {row.detail}
                  </span>
                </button>
              ))
            )
          ) : browser.tree ? (
            <ObsidianVaultTree
              entry={browser.tree}
              expandedFolders={browser.expandedFolders}
              selectedPath={openedNotePath}
              onToggleFolder={browser.toggleFolder}
              onSelectNote={selectNote}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}
