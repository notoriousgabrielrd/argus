/** Href scheme used to route a resolved wikilink back into the notes page. */
export const OBSIDIAN_NOTE_HREF_PREFIX = 'obsidian-note:'

const WIKILINK_PATTERN = /!?\[\[([^\]\n]+)\]\]/g

type MarkdownTextNode = { type: 'text'; value: string }
type MarkdownLinkNode = {
  type: 'link'
  url: string
  title: null
  children: MarkdownTextNode[]
}
export type MarkdownNode = {
  type: string
  value?: string
  url?: string
  title?: string | null
  children?: MarkdownNode[]
}

export function noteHrefTarget(href: string): string | null {
  return href.startsWith(OBSIDIAN_NOTE_HREF_PREFIX)
    ? decodeURIComponent(href.slice(OBSIDIAN_NOTE_HREF_PREFIX.length))
    : null
}

/** `[[Folder/Note#Heading|alias]]` → the note it points at, and the text to show. */
export function parseWikilink(inner: string): { target: string; label: string } | null {
  const [linkPart, ...aliasParts] = inner.split('|')
  const alias = aliasParts.join('|').trim()
  const target = linkPart.split('^')[0].split('#')[0].trim()
  if (!target) {
    return null
  }
  return { target, label: alias || linkPart.trim() }
}

function splitWikilinkText(value: string): MarkdownNode[] {
  const parts: MarkdownNode[] = []
  let cursor = 0
  for (const match of value.matchAll(WIKILINK_PATTERN)) {
    const index = match.index ?? 0
    const parsed = parseWikilink(match[1])
    if (!parsed) {
      continue
    }
    if (index > cursor) {
      parts.push({ type: 'text', value: value.slice(cursor, index) })
    }
    const link: MarkdownLinkNode = {
      type: 'link',
      url: `${OBSIDIAN_NOTE_HREF_PREFIX}${encodeURIComponent(parsed.target)}`,
      title: null,
      children: [{ type: 'text', value: parsed.label }]
    }
    parts.push(link)
    cursor = index + match[0].length
  }
  if (cursor === 0) {
    return [{ type: 'text', value }]
  }
  if (cursor < value.length) {
    parts.push({ type: 'text', value: value.slice(cursor) })
  }
  return parts
}

function transformChildren(node: MarkdownNode): void {
  // Why: walking mdast text nodes (not the raw source) means wikilinks inside
  // fenced code, inline code, and existing links are left exactly as written.
  if (!node.children || node.type === 'link' || node.type === 'image' || node.type === 'code') {
    return
  }
  const next: MarkdownNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && child.value !== undefined) {
      for (const part of splitWikilinkText(child.value)) {
        next.push(part)
      }
      continue
    }
    transformChildren(child)
    next.push(child)
  }
  node.children = next
}

export function remarkObsidianWikilinks(): (tree: MarkdownNode) => void {
  return (tree) => transformChildren(tree)
}
