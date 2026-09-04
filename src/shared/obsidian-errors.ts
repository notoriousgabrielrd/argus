/**
 * Stable error codes for the Obsidian vault surface. Agents branch on these,
 * so entries are added, never renamed — mirroring the Linear/computer contracts.
 */
export const OBSIDIAN_ERROR_CODES = [
  'obsidian_no_vault',
  'obsidian_vault_not_found',
  'obsidian_vault_unavailable',
  'obsidian_vault_ambiguous',
  'obsidian_note_not_found',
  'obsidian_note_ambiguous',
  'obsidian_note_exists',
  'obsidian_path_escape',
  'obsidian_path_reserved',
  'obsidian_note_too_large',
  'obsidian_write_too_large',
  'obsidian_heading_not_found',
  'obsidian_property_invalid',
  'obsidian_invalid_argument',
  'obsidian_app_unavailable',
  'obsidian_error'
] as const

export type ObsidianErrorCode = (typeof OBSIDIAN_ERROR_CODES)[number]

export class ObsidianError extends Error {
  readonly code: ObsidianErrorCode
  readonly data?: unknown

  constructor(code: ObsidianErrorCode, message: string, data?: unknown) {
    super(message)
    this.name = 'ObsidianError'
    this.code = code
    if (data !== undefined) {
      this.data = data
    }
  }
}

export function isObsidianErrorCode(value: unknown): value is ObsidianErrorCode {
  return typeof value === 'string' && (OBSIDIAN_ERROR_CODES as readonly string[]).includes(value)
}
