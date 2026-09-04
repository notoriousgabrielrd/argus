import { ObsidianError } from '../../shared/obsidian-errors'

const HEADING_LINE = /^(#{1,6})\s+(.+?)\s*$/

export type SectionRange = {
  headingIndex: number
  endIndex: number
  level: number
}

function headingText(line: string): { level: number; text: string } | null {
  const match = HEADING_LINE.exec(line)
  return match ? { level: match[1].length, text: match[2].trim() } : null
}

export function findSection(lines: readonly string[], heading: string): SectionRange {
  const wanted = heading
    .replace(/^#+\s*/, '')
    .trim()
    .toLowerCase()
  const headingIndex = lines.findIndex((line) => headingText(line)?.text.toLowerCase() === wanted)
  if (headingIndex === -1) {
    throw new ObsidianError(
      'obsidian_heading_not_found',
      `No heading "${heading}" in this note. Create it first, or append to the end of the note.`
    )
  }
  const level = headingText(lines[headingIndex])?.level ?? 1
  let endIndex = lines.length
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const next = headingText(lines[index])
    if (next && next.level <= level) {
      endIndex = index
      break
    }
  }
  return { headingIndex, endIndex, level }
}

/** Appends inside a section, right after its last non-empty line. */
export function appendToSection(body: string, heading: string, content: string): string {
  const lines = body.split('\n')
  const section = findSection(lines, heading)
  let insertAt = section.endIndex
  while (insertAt > section.headingIndex + 1 && lines[insertAt - 1].trim() === '') {
    insertAt -= 1
  }
  const block = content.replace(/\s+$/, '').split('\n')
  return [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)].join('\n')
}

export function readSection(body: string, heading: string): string {
  const lines = body.split('\n')
  const section = findSection(lines, heading)
  return lines.slice(section.headingIndex, section.endIndex).join('\n').trimEnd()
}

export function replaceSection(body: string, heading: string, content: string): string {
  const lines = body.split('\n')
  const section = findSection(lines, heading)
  return [
    ...lines.slice(0, section.headingIndex + 1),
    ...content.replace(/\s+$/, '').split('\n'),
    ...lines.slice(section.endIndex)
  ].join('\n')
}
