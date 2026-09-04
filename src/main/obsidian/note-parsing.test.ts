import { describe, expect, it } from 'vitest'
import { parseNoteBody } from './note-body-parse'
import {
  coercePropertyValue,
  frontmatterTags,
  parseNote,
  removeFrontmatterProperty,
  serializeNote,
  setFrontmatterProperty
} from './note-frontmatter'
import { buildLinkResolutionIndex, resolveLinkTarget } from './note-link-resolution'
import { rewriteLinksInText } from './note-link-rewrite'
import { appendToSection, readSection, replaceSection } from './note-section'
import { formatDatePattern, parseDateInput } from './date-format'

describe('frontmatter', () => {
  it('splits a YAML block from the body and reports the body start line', () => {
    const parsed = parseNote('---\ntitle: Argus\ntags: [a, b]\n---\n# Heading\nbody\n')
    expect(parsed.hasFrontmatter).toBe(true)
    expect(parsed.frontmatter.title).toBe('Argus')
    expect(parsed.body).toBe('# Heading\nbody\n')
    expect(parsed.bodyStartLine).toBe(5)
  })

  it('treats an unterminated block as plain body rather than failing the read', () => {
    const parsed = parseNote('---\ntitle: broken\nstill going\n')
    expect(parsed.hasFrontmatter).toBe(false)
    expect(parsed.body).toBe('---\ntitle: broken\nstill going\n')
  })

  it('keeps malformed YAML readable instead of throwing', () => {
    const parsed = parseNote('---\n: : :\n---\nbody\n')
    expect(parsed.frontmatter).toEqual({})
    expect(parsed.body).toBe('body\n')
  })

  it('round-trips set and remove without disturbing the body', () => {
    const withStatus = setFrontmatterProperty('# Note\ntext\n', 'status', 'open')
    expect(withStatus).toContain('status: open')
    expect(withStatus).toContain('# Note')
    const removed = removeFrontmatterProperty(withStatus, 'status')
    expect(removed).toBe('# Note\ntext\n')
  })

  it('refuses to remove a property the note does not have', () => {
    expect(() => removeFrontmatterProperty('body\n', 'status')).toThrowError(/no property/i)
  })

  it('drops the frontmatter fence when the last property goes away', () => {
    expect(serializeNote({}, 'body\n')).toBe('body\n')
  })

  it('infers property types and honours an explicit one', () => {
    expect(coercePropertyValue('12')).toBe(12)
    expect(coercePropertyValue('true')).toBe(true)
    expect(coercePropertyValue('12', 'text')).toBe('12')
    expect(coercePropertyValue('a, b', 'list')).toEqual(['a', 'b'])
  })

  it('reads tags whether they are a list or a string', () => {
    expect(frontmatterTags({ tags: ['#one', 'two'] })).toEqual(['one', 'two'])
    expect(frontmatterTags({ tags: 'one two' })).toEqual(['one', 'two'])
  })
})

describe('note body parsing', () => {
  const body = [
    '# Title',
    'Links to [[Projects/Argus|the project]] and ![[diagram.png]].',
    'A markdown [link](Notes/Other.md#Section) too.',
    'Tagged #work/active and #done.',
    '```',
    'not a #tag and [[not a link]]',
    '```',
    'Inline `#code` stays out.',
    '## Sub'
  ].join('\n')

  it('collects wikilinks, embeds, and markdown links with their line numbers', () => {
    const parsed = parseNoteBody(body)
    expect(parsed.links).toHaveLength(3)
    expect(parsed.links[0]).toMatchObject({
      kind: 'wikilink',
      target: 'Projects/Argus',
      alias: 'the project',
      line: 2
    })
    expect(parsed.links[1]).toMatchObject({ kind: 'embed', target: 'diagram.png' })
    expect(parsed.links[2]).toMatchObject({
      kind: 'markdown',
      target: 'Notes/Other.md',
      heading: 'Section'
    })
  })

  it('ignores tags and links inside fenced or inline code', () => {
    const parsed = parseNoteBody(body)
    expect(parsed.tags.sort()).toEqual(['done', 'work/active'])
    expect(parsed.links.some((link) => link.target === 'not a link')).toBe(false)
  })

  it('reports headings with their level', () => {
    const parsed = parseNoteBody(body)
    expect(parsed.headings).toEqual([
      { text: 'Title', level: 1, line: 1 },
      { text: 'Sub', level: 2, line: 9 }
    ])
  })

  it('offsets line numbers by the frontmatter block', () => {
    const parsed = parseNoteBody('link [[A]]', 5)
    expect(parsed.links[0].line).toBe(5)
  })
})

describe('link resolution', () => {
  const index = buildLinkResolutionIndex([
    'Argus.md',
    'Projects/Argus.md',
    'Archive/Argus.md',
    'Notes/Other.md',
    'assets/diagram.png'
  ])

  it('prefers an exact path over a bare name', () => {
    expect(resolveLinkTarget(index, 'Archive/Argus', 'Notes/Other.md')).toBe('Archive/Argus.md')
  })

  it('resolves a bare name to the note in the same folder first', () => {
    expect(resolveLinkTarget(index, 'Argus', 'Archive/Old.md')).toBe('Archive/Argus.md')
  })

  it('falls back to the shallowest match when no sibling exists', () => {
    expect(resolveLinkTarget(index, 'Argus', 'Notes/Other.md')).toBe('Argus.md')
  })

  it('resolves attachments by their full name', () => {
    expect(resolveLinkTarget(index, 'assets/diagram.png', 'Notes/Other.md')).toBe(
      'assets/diagram.png'
    )
  })

  it('returns null for a link with no target in the vault', () => {
    expect(resolveLinkTarget(index, 'Nowhere', 'Notes/Other.md')).toBeNull()
  })
})

describe('link rewriting', () => {
  const resolve = (target: string): string | null =>
    ['Old', 'Projects/Old', 'Projects/Old.md'].includes(target) ? 'Projects/Old.md' : null

  it('rewrites only links that resolve to the moved note, keeping alias and heading', () => {
    const source = 'See [[Old#Design|the design]] and [[Other]].'
    const result = rewriteLinksInText(
      source,
      'Notes/Ref.md',
      { fromPath: 'Projects/Old.md', toPath: 'Projects/New.md', preferBareName: true },
      resolve
    )
    expect(result.text).toBe('See [[New#Design|the design]] and [[Other]].')
    expect(result.replacements).toBe(1)
  })

  it('writes a full path when the new bare name would be ambiguous', () => {
    const result = rewriteLinksInText(
      'See [[Old]].',
      'Notes/Ref.md',
      { fromPath: 'Projects/Old.md', toPath: 'Archive/New.md', preferBareName: false },
      resolve
    )
    expect(result.text).toBe('See [[Archive/New]].')
  })

  it('counts nothing when a folder move leaves the bare link already correct', () => {
    const result = rewriteLinksInText(
      'See [[Old]].',
      'Notes/Ref.md',
      { fromPath: 'Projects/Old.md', toPath: 'Archive/Old.md', preferBareName: true },
      resolve
    )
    expect(result.replacements).toBe(0)
    expect(result.text).toBe('See [[Old]].')
  })

  it('percent-encodes markdown link targets', () => {
    const result = rewriteLinksInText(
      '[label](Projects/Old.md)',
      'Notes/Ref.md',
      { fromPath: 'Projects/Old.md', toPath: 'Archive/New note.md', preferBareName: true },
      resolve
    )
    expect(result.text).toBe('[label](Archive/New%20note.md)')
  })

  it('leaves external links alone', () => {
    const result = rewriteLinksInText(
      '[docs](https://example.com/Old)',
      'Notes/Ref.md',
      { fromPath: 'Projects/Old.md', toPath: 'Projects/New.md', preferBareName: true },
      resolve
    )
    expect(result.replacements).toBe(0)
  })
})

describe('sections', () => {
  const body = ['# Note', '## Now', '- one', '', '## Later', '- two'].join('\n')

  it('reads a section up to the next heading of the same level', () => {
    expect(readSection(body, '## Now')).toBe('## Now\n- one')
  })

  it('appends after the last non-empty line of the section', () => {
    expect(appendToSection(body, 'Now', '- three')).toBe(
      ['# Note', '## Now', '- one', '- three', '', '## Later', '- two'].join('\n')
    )
  })

  it('replaces only the section content', () => {
    expect(replaceSection(body, '## Now', '- fresh')).toBe(
      ['# Note', '## Now', '- fresh', '## Later', '- two'].join('\n')
    )
  })

  it('reports a missing heading with a recoverable error code', () => {
    expect(() => readSection(body, '## Missing')).toThrowError(
      expect.objectContaining({ code: 'obsidian_heading_not_found' })
    )
  })
})

describe('daily note dates', () => {
  it('formats the Moment tokens Obsidian uses', () => {
    const date = new Date(2026, 8, 2, 14, 5)
    expect(formatDatePattern(date, 'YYYY-MM-DD')).toBe('2026-09-02')
    expect(formatDatePattern(date, 'YYYY/MMMM/DD-dddd')).toBe('2026/September/02-Wednesday')
  })

  it('reads relative and ISO date inputs without timezone drift', () => {
    expect(formatDatePattern(parseDateInput('2026-09-02'), 'YYYY-MM-DD')).toBe('2026-09-02')
    const yesterday = parseDateInput('yesterday')
    expect(Date.now() - yesterday.getTime()).toBeGreaterThan(86_000_000)
  })
})
