import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, LoaderCircle, NotebookPen, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ObsidianNote } from '../../../../shared/obsidian-types'
import { ObsidianNoteMarkdown } from './ObsidianNoteMarkdown'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Main-area screen for one vault note. Notes are not workspace files, so this is
 * a top-level view rather than an editor tab — opening one creates no project,
 * no workspace, and no terminal.
 */
export default function ObsidianNotesPage(): React.JSX.Element {
  const openNote = useAppStore((s) => s.obsidianOpenNote)
  const closeObsidianNote = useAppStore((s) => s.closeObsidianNote)
  const openObsidianNote = useAppStore((s) => s.openObsidianNote)
  const [note, setNote] = useState<ObsidianNote | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vaultId = openNote?.vaultId ?? null
  const notePath = openNote?.notePath ?? null

  const load = useCallback(async (): Promise<void> => {
    if (!vaultId || !notePath) {
      setNote(null)
      return
    }
    try {
      setNote(await window.api.obsidian.readNote({ vault: vaultId, note: notePath }))
      setDraft(null)
      setError(null)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }, [vaultId, notePath])

  useEffect(() => {
    void load()
  }, [load])

  const save = (): void => {
    if (!vaultId || !note || draft === null) {
      return
    }
    setSaving(true)
    void (async () => {
      try {
        await window.api.obsidian.editNote({
          vault: vaultId,
          note: note.path,
          content: draft,
          mode: 'replace'
        })
        await load()
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setSaving(false)
      }
    })()
  }

  if (!openNote || !note) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <NotebookPen className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {error ??
            translate(
              'auto.components.obsidian.ObsidianNotesPage.empty',
              'Pick a note in the Obsidian sidebar to read or edit it here.'
            )}
        </p>
      </div>
    )
  }

  const editing = draft !== null
  const dirty = editing && draft !== note.content
  const properties = Object.entries(note.frontmatter)

  return (
    <div className="flex h-full min-h-0 flex-col bg-editor-surface">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {note.title}
            {dirty ? ' •' : ''}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {openNote.vaultName} · {note.path}
          </div>
        </div>
        {editing ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving || !dirty}
              onClick={save}
            >
              {saving ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                translate('auto.components.obsidian.ObsidianNotesPage.save', 'Save')
              )}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
              {translate('auto.components.obsidian.ObsidianNotesPage.cancel', 'Cancel')}
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(note.content)}>
            <Pencil className="size-3.5" />
            {translate('auto.components.obsidian.ObsidianNotesPage.edit', 'Edit')}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={translate(
            'auto.components.obsidian.ObsidianNotesPage.openInObsidian',
            'Open in Obsidian'
          )}
          onClick={() => {
            void window.api.obsidian
              .openNote({ ...(vaultId ? { vault: vaultId } : {}), note: note.path })
              .catch((cause: unknown) => setError(errorMessage(cause)))
          }}
        >
          <ExternalLink className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={translate('auto.components.obsidian.ObsidianNotesPage.close', 'Close note')}
          onClick={closeObsidianNote}
        >
          <X className="size-4" />
        </Button>
      </div>

      {error && <div className="shrink-0 px-4 py-2 text-xs text-destructive">{error}</div>}

      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          className="scrollbar-editor min-h-0 flex-1 resize-none border-0 bg-editor-surface px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none"
        />
      ) : (
        <div className="scrollbar-editor min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {properties.length > 0 && (
            <dl className="mb-4 grid max-w-2xl grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-border/60 p-3 text-xs">
              {properties.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="text-foreground">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <ObsidianNoteMarkdown
            content={note.content}
            onOpenNote={(target) => {
              if (openNote) {
                openObsidianNote({ ...openNote, notePath: target })
              }
            }}
          />
          {note.backlinks.length > 0 && (
            <div className="mt-6 border-t border-border pt-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {translate('auto.components.obsidian.ObsidianNotesPage.backlinks', 'Backlinks')}
              </div>
              {note.backlinks.map((backlink) => (
                <button
                  key={`${backlink.path}:${backlink.line}`}
                  type="button"
                  onClick={() => {
                    if (openNote) {
                      openObsidianNote({ ...openNote, notePath: backlink.path })
                    }
                  }}
                  className="block w-full truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  {backlink.path}:{backlink.line} — {backlink.context}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
