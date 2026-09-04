import { ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ObsidianTreeEntry } from '../../../../shared/obsidian-types'

const INDENT_PX = 10

function noteLabel(name: string): string {
  return name.replace(/\.(?:md|markdown)$/i, '')
}

type ObsidianVaultTreeProps = {
  entry: ObsidianTreeEntry
  depth?: number
  expandedFolders: ReadonlySet<string>
  selectedPath: string | null
  onToggleFolder: (path: string) => void
  onSelectNote: (path: string) => void
}

export function ObsidianVaultTree({
  entry,
  depth = 0,
  expandedFolders,
  selectedPath,
  onToggleFolder,
  onSelectNote
}: ObsidianVaultTreeProps): React.JSX.Element {
  const children = entry.children ?? []
  const expanded = expandedFolders.has(entry.path)
  // The vault root renders its children directly; it is not a row of its own.
  const isRoot = depth === 0

  return (
    <>
      {!isRoot && (
        <button
          type="button"
          onClick={() => onToggleFolder(entry.path)}
          className="flex w-full items-center gap-1 py-0.5 pr-2 text-left hover:bg-accent"
          style={{ paddingLeft: `${8 + depth * INDENT_PX}px` }}
        >
          {expanded ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-xs text-foreground">{entry.name}</span>
          <span className="ml-auto shrink-0 pl-1 text-[10px] text-muted-foreground">
            {entry.noteCount ?? 0}
          </span>
        </button>
      )}
      {(isRoot || expanded) &&
        children.map((child) =>
          child.type === 'folder' ? (
            <ObsidianVaultTree
              key={child.path}
              entry={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              selectedPath={selectedPath}
              onToggleFolder={onToggleFolder}
              onSelectNote={onSelectNote}
            />
          ) : (
            <button
              key={child.path}
              type="button"
              onClick={() => onSelectNote(child.path)}
              data-current={selectedPath === child.path ? 'true' : undefined}
              className={cn(
                'flex w-full items-center gap-1 py-0.5 pr-2 text-left hover:bg-accent',
                selectedPath === child.path && 'bg-accent'
              )}
              style={{ paddingLeft: `${8 + (depth + 1) * INDENT_PX}px` }}
            >
              <FileText className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs text-foreground">{noteLabel(child.name)}</span>
            </button>
          )
        )}
    </>
  )
}
