import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getNotchOverlaySearchEntry = createLocalizedCatalog((): SettingsSearchEntry => ({
  title: translate(
    'auto.components.settings.experimental.search.notchOverlay.title',
    'Notch Overlay'
  ),
  description: translate(
    'auto.components.settings.experimental.search.notchOverlay.description',
    'Live agent status around the MacBook notch.'
  ),
  keywords: [
    ...translateSearchKeyword(
      'auto.components.settings.experimental.search.0d24759f14',
      'experimental'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.experimental.search.notchOverlay.notch',
      'notch'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.experimental.search.notchOverlay.overlay',
      'overlay'
    ),
    ...translateSearchKeyword(
      'auto.components.settings.experimental.search.notchOverlay.macos',
      'macos'
    )
  ],
  targetSectionId: 'experimental-notch-overlay'
}))
