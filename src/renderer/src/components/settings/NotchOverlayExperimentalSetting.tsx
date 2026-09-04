import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { SettingsSwitch } from './SettingsFormControls'
import { getExperimentalSearchEntry } from './experimental-search'

type NotchOverlayExperimentalSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function NotchOverlayExperimentalSetting({
  settings,
  updateSettings
}: NotchOverlayExperimentalSettingProps): React.JSX.Element {
  const enabled = settings.experimentalMacNotchOverlay === true
  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.ExperimentalPane.notchOverlay.title',
        'Notch Overlay'
      )}
      description={translate(
        'auto.components.settings.ExperimentalPane.notchOverlay.description',
        'Live agent status around the MacBook notch.'
      )}
      keywords={getExperimentalSearchEntry().notchOverlay.keywords}
      className="py-2"
      id="experimental-notch-overlay"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {translate(
              'auto.components.settings.ExperimentalPane.notchOverlay.title',
              'Notch Overlay'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.notchOverlay.copy',
              'Shows how many agents need you or are working beside the notch. Hover it to list them and jump to one.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={enabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.notchOverlay.toggleLabel',
            'Toggle Notch Overlay'
          )}
          onChange={() => updateSettings({ experimentalMacNotchOverlay: !enabled })}
        />
      </div>
    </SearchableSetting>
  )
}
