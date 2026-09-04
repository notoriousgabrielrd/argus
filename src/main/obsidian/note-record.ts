import { readFileSync } from 'node:fs'
import type { ObsidianLinkRef, ObsidianNoteSummary } from '../../shared/obsidian-types'
import { OBSIDIAN_MAX_NOTE_BYTES } from '../../shared/obsidian-types'
import { frontmatterTags, parseNote } from './note-frontmatter'
import { parseNoteBody, type RawNoteLink } from './note-body-parse'
import type { ScannedFile } from './vault-scan'

export type IndexedNote = ObsidianNoteSummary & {
  absolutePath: string
  /** Unresolved at read time; `resolvedPath` is filled once the whole vault is known. */
  links: ObsidianLinkRef[]
}

function noteName(notePath: string): string {
  return (notePath.split('/').pop() ?? notePath).replace(/\.[^./]+$/, '')
}

function noteFolder(notePath: string): string {
  const parts = notePath.split('/')
  parts.pop()
  return parts.join('/')
}

function resolveTitle(
  frontmatter: Record<string, unknown>,
  headings: { text: string; level: number }[],
  fallback: string
): string {
  const declared = frontmatter.title
  if (typeof declared === 'string' && declared.trim()) {
    return declared.trim()
  }
  return headings.find((heading) => heading.level === 1)?.text ?? fallback
}

function toLinkRef(link: RawNoteLink): ObsidianLinkRef {
  return { ...link, resolvedPath: null }
}

export function noteRecordFromContent(file: ScannedFile, raw: string): IndexedNote {
  const parsed = parseNote(raw)
  const body = parseNoteBody(parsed.body, parsed.bodyStartLine)
  const name = noteName(file.path)
  return {
    path: file.path,
    absolutePath: file.absolutePath,
    name,
    title: resolveTitle(parsed.frontmatter, body.headings, name),
    folder: noteFolder(file.path),
    size: file.size,
    modifiedAt: new Date(file.modifiedMs).toISOString(),
    createdAt: new Date(file.createdMs).toISOString(),
    tags: [...new Set([...frontmatterTags(parsed.frontmatter), ...body.tags])].sort(),
    frontmatter: parsed.frontmatter,
    headings: body.headings.map((heading) => heading.text),
    outgoingLinks: body.links.length,
    links: body.links.map(toLinkRef)
  }
}

/** An unreadable or oversized note is skipped rather than failing the whole index. */
export function readNoteRecord(file: ScannedFile): IndexedNote | null {
  if (file.size > OBSIDIAN_MAX_NOTE_BYTES) {
    return null
  }
  try {
    return noteRecordFromContent(file, readFileSync(file.absolutePath, 'utf-8'))
  } catch {
    return null
  }
}
