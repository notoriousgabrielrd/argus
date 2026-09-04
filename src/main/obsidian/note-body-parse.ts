import type { ObsidianLinkKind } from '../../shared/obsidian-types'

export type RawNoteLink = {
  kind: ObsidianLinkKind
  target: string
  alias?: string
  heading?: string
  blockRef?: string
  line: number
}

export type NoteHeading = {
  text: string
  level: number
  line: number
}

export type ParsedNoteBody = {
  links: RawNoteLink[]
  tags: string[]
  headings: NoteHeading[]
}

const WIKILINK = /(!?)\[\[([^\]\n]+)\]\]/g
const MARKDOWN_LINK = /(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g
const INLINE_TAG = /(^|[\s(>[])#([A-Za-zÀ-ɏ][\wÀ-ɏ/-]*)/g
const HEADING = /^(#{1,6})\s+(.+?)\s*$/
const FENCE = /^\s*(?:```|~~~)/

function splitWikilinkTarget(inner: string): Omit<RawNoteLink, 'kind' | 'line'> {
  const [linkPart, ...aliasParts] = inner.split('|')
  const alias = aliasParts.join('|').trim()
  const blockSplit = linkPart.split('^')
  const headingSplit = blockSplit[0].split('#')
  return {
    target: headingSplit[0].trim(),
    ...(headingSplit.length > 1 && headingSplit.slice(1).join('#').trim()
      ? { heading: headingSplit.slice(1).join('#').trim() }
      : {}),
    ...(blockSplit.length > 1 && blockSplit[1].trim() ? { blockRef: blockSplit[1].trim() } : {}),
    ...(alias ? { alias } : {})
  }
}

function isExternalTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')
}

function collectLinks(line: string, lineNumber: number, into: RawNoteLink[]): void {
  for (const match of line.matchAll(WIKILINK)) {
    const parts = splitWikilinkTarget(match[2])
    if (!parts.target && !parts.heading && !parts.blockRef) {
      continue
    }
    into.push({ kind: match[1] === '!' ? 'embed' : 'wikilink', line: lineNumber, ...parts })
  }
  for (const match of line.matchAll(MARKDOWN_LINK)) {
    const rawTarget = match[3].split(/\s+/)[0].replace(/^<|>$/g, '')
    if (!rawTarget || isExternalTarget(rawTarget) || rawTarget.startsWith('#')) {
      continue
    }
    const decoded = safeDecode(rawTarget)
    const [pathPart, ...headingParts] = decoded.split('#')
    into.push({
      kind: match[1] === '!' ? 'embed' : 'markdown',
      target: pathPart.trim(),
      line: lineNumber,
      ...(headingParts.length > 0 && headingParts.join('#').trim()
        ? { heading: headingParts.join('#').trim() }
        : {}),
      ...(match[2].trim() ? { alias: match[2].trim() } : {})
    })
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function stripInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, ' ')
}

/**
 * Obsidian ignores links, tags, and headings inside fenced code, so the parser
 * tracks fences instead of matching the whole file blindly.
 */
export function parseNoteBody(body: string, bodyStartLine = 1): ParsedNoteBody {
  const links: RawNoteLink[] = []
  const headings: NoteHeading[] = []
  const tags = new Set<string>()
  let inFence = false
  const lines = body.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = bodyStartLine + index
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      headings.push({ text: heading[2].trim(), level: heading[1].length, line: lineNumber })
    }
    const scannable = stripInlineCode(line)
    collectLinks(scannable, lineNumber, links)
    for (const match of scannable.matchAll(INLINE_TAG)) {
      tags.add(match[2].replace(/[.,;:]+$/, ''))
    }
  }
  return { links, tags: [...tags], headings }
}
