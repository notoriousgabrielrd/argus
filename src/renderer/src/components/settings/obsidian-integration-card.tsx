import { useCallback, useEffect, useState } from 'react'
import { Check, FolderPlus, NotebookPen, RefreshCw, Star, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { ObsidianVault } from '../../../../shared/obsidian-types'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'

export const OBSIDIAN_INTEGRATION_SECTION_ID = 'integrations-obsidian'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function ObsidianIntegrationCard(): React.JSX.Element {
  const [vaults, setVaults] = useState<readonly ObsidianVault[]>([])
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useMountedRef()
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')

  const reload = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.obsidian.listVaults()
      if (mountedRef.current) {
        setVaults(result.vaults)
        setError(null)
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(errorMessage(cause))
      }
    } finally {
      if (mountedRef.current) {
        setChecked(true)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = useCallback(
    async (operation: () => Promise<unknown>): Promise<void> => {
      setBusy(true)
      try {
        await operation()
        await reload()
      } catch (cause) {
        if (mountedRef.current) {
          setError(errorMessage(cause))
        }
      } finally {
        if (mountedRef.current) {
          setBusy(false)
        }
      }
    },
    [mountedRef, reload]
  )

  // Why: `reload` alone finishes too fast to be visible — without the busy flag the
  // button looks dead even when the vault list came back changed.
  const refresh = useCallback(async (): Promise<void> => {
    setBusy(true)
    await reload()
    if (mountedRef.current) {
      setBusy(false)
    }
  }, [mountedRef, reload])

  const available = vaults.filter((vault) => vault.available)

  return (
    <IntegrationCardShell
      settingsSectionId={OBSIDIAN_INTEGRATION_SECTION_ID}
      icon={<NotebookPen className="size-5" />}
      name={translate('auto.components.settings.obsidian.name', 'Obsidian')}
      description={translate(
        'auto.components.settings.obsidian.description',
        'Read, search, and write the notes in your Obsidian vaults, from the sidebar and from agents.'
      )}
      checking={!checked}
      statusTone={available.length > 0 ? 'connected' : 'neutral'}
      statusLabel={
        available.length > 0
          ? translate('auto.components.settings.obsidian.statusConnected', '{{value0}} vault(s)', {
              value0: available.length
            })
          : translate('auto.components.settings.obsidian.statusNone', 'No vault')
      }
      actions={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
            {translate('auto.components.settings.obsidian.refresh', 'Refresh')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => window.api.obsidian.pickVault())}
          >
            <FolderPlus className="size-3.5" />
            {translate('auto.components.settings.obsidian.addVault', 'Add vault folder…')}
          </Button>
        </>
      }
    >
      <IntegrationCardDetails>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {vaults.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.obsidian.empty',
              'Vaults the Obsidian desktop app has opened on this machine are detected automatically. Add a folder to register one it has not opened.'
            )}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.settings.obsidian.defaultHint',
                'The default vault is the one the sidebar panel and `argus obsidian` commands use when no vault is named.'
              )}
            </p>
            {vaults.map((vault) => (
              <div key={vault.id} className={subordinateRowClass}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {vault.name}
                    {vault.isDefault ? (
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        {translate('auto.components.settings.obsidian.defaultTag', 'default')}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {vault.path}
                  </p>
                </div>
                {!vault.available && (
                  <span className="shrink-0 text-[11px] text-destructive">
                    {translate('auto.components.settings.obsidian.missing', 'Folder missing')}
                  </span>
                )}
                {vault.isDefault ? (
                  <Check className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={busy || !vault.available}
                    onClick={() =>
                      void run(() => window.api.obsidian.setDefaultVault({ vault: vault.id }))
                    }
                  >
                    <Star className="size-3" />
                    {translate('auto.components.settings.obsidian.makeDefault', 'Use by default')}
                  </Button>
                )}
                {vault.source === 'manual' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    onClick={() =>
                      void run(() => window.api.obsidian.removeVault({ vault: vault.id }))
                    }
                  >
                    <Unlink className="size-3" />
                    {translate('auto.components.settings.obsidian.forget', 'Forget')}
                  </Button>
                )}
              </div>
            ))}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.settings.obsidian.editorHint',
            'Opening a note from the sidebar registers its vault folder as an Argus project so the note can open in the center editor.'
          )}
        </p>
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}
