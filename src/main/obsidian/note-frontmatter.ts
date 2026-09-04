import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { ObsidianError } from '../../shared/obsidian-errors'
import type { ObsidianFrontmatter } from '../../shared/obsidian-types'

export type ParsedNote = {
  frontmatter: ObsidianFrontmatter
  hasFrontmatter: boolean
  body: string
  /** 1-based line the body starts on, so search hits report real file lines. */
  bodyStartLine: number
}

const FRONTMATTER_FENCE = /^---[ \t]*$/
const FRONTMATTER_END = /^(?:---|\.\.\.)[ \t]*$/

export function parseNote(raw: string): ParsedNote {
  const lines = raw.split('\n')
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0] ?? '')) {
    return { frontmatter: {}, hasFrontmatter: false, body: raw, bodyStartLine: 1 }
  }
  const endIndex = lines.findIndex((line, index) => index > 0 && FRONTMATTER_END.test(line))
  if (endIndex === -1) {
    return { frontmatter: {}, hasFrontmatter: false, body: raw, bodyStartLine: 1 }
  }
  const block = lines.slice(1, endIndex).join('\n')
  let data: unknown
  try {
    data = block.trim() ? parseYaml(block) : {}
  } catch {
    // A malformed block is still readable prose to the agent; do not fail the read.
    data = {}
  }
  return {
    frontmatter:
      data && typeof data === 'object' && !Array.isArray(data) ? (data as ObsidianFrontmatter) : {},
    hasFrontmatter: true,
    body: lines.slice(endIndex + 1).join('\n'),
    bodyStartLine: endIndex + 2
  }
}

function hasEntries(frontmatter: ObsidianFrontmatter): boolean {
  return Object.keys(frontmatter).length > 0
}

export function serializeNote(frontmatter: ObsidianFrontmatter, body: string): string {
  if (!hasEntries(frontmatter)) {
    return body.replace(/^\n+/, '')
  }
  const block = stringifyYaml(frontmatter, { lineWidth: 0 }).replace(/\n$/, '')
  return `---\n${block}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`
}

export function setFrontmatterProperty(raw: string, key: string, value: unknown): string {
  const parsed = parseNote(raw)
  return serializeNote({ ...parsed.frontmatter, [key]: value }, parsed.body)
}

export function removeFrontmatterProperty(raw: string, key: string): string {
  const parsed = parseNote(raw)
  if (!(key in parsed.frontmatter)) {
    throw new ObsidianError('obsidian_property_invalid', `Note has no property "${key}".`)
  }
  const { [key]: _removed, ...rest } = parsed.frontmatter
  return serializeNote(rest, parsed.body)
}

/**
 * CLI property values arrive as strings. Obsidian properties are typed, so
 * infer the obvious ones and let `--type` force the rest.
 */
export function coercePropertyValue(
  input: string,
  type?: 'text' | 'number' | 'checkbox' | 'list' | 'date'
): unknown {
  if (type === 'text') {
    return input
  }
  if (type === 'number') {
    const parsed = Number(input)
    if (!Number.isFinite(parsed)) {
      throw new ObsidianError('obsidian_property_invalid', `"${input}" is not a number.`)
    }
    return parsed
  }
  if (type === 'checkbox') {
    return /^(true|yes|1)$/i.test(input.trim())
  }
  if (type === 'list') {
    return input
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }
  if (type === 'date') {
    return input.trim()
  }
  const trimmed = input.trim()
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true'
  }
  if (trimmed !== '' && Number.isFinite(Number(trimmed)) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }
  return input
}

export function frontmatterTags(frontmatter: ObsidianFrontmatter): string[] {
  const raw = frontmatter.tags ?? frontmatter.tag
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\s]+/) : []
  return values
    .map((entry) => String(entry).trim().replace(/^#/, ''))
    .filter((entry) => entry.length > 0)
}
