import { describe, expect, it } from 'vitest'
import {
  noteHrefTarget,
  parseWikilink,
  remarkObsidianWikilinks,
  type MarkdownNode
} from './obsidian-wikilinks'

function textTree(value: string): MarkdownNode {
  return { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] }
}

function transform(value: string): MarkdownNode[] {
  const tree = textTree(value)
  remarkObsidianWikilinks()(tree)
  return tree.children?.[0]?.children ?? []
}

describe('parseWikilink', () => {
  it('keeps the alias as the label and strips heading and block anchors', () => {
    expect(parseWikilink('Projects/Argus|the project')).toEqual({
      target: 'Projects/Argus',
      label: 'the project'
    })
    expect(parseWikilink('Argus#Decisions')).toEqual({ target: 'Argus', label: 'Argus#Decisions' })
    expect(parseWikilink('Argus^block-id')).toEqual({ target: 'Argus', label: 'Argus^block-id' })
  })

  it('rejects a link with no target', () => {
    expect(parseWikilink('|alias')).toBeNull()
  })
})

describe('remarkObsidianWikilinks', () => {
  it('turns a wikilink into a note link and keeps the surrounding text', () => {
    const nodes = transform('See [[Projects/Argus|the project]] today.')
    expect(nodes).toHaveLength(3)
    expect(nodes[0]).toEqual({ type: 'text', value: 'See ' })
    expect(nodes[1]).toMatchObject({
      type: 'link',
      url: 'obsidian-note:Projects%2FArgus',
      children: [{ type: 'text', value: 'the project' }]
    })
    expect(nodes[2]).toEqual({ type: 'text', value: ' today.' })
  })

  it('handles several links in one line', () => {
    expect(transform('[[A]] and [[B]]').filter((node) => node.type === 'link')).toHaveLength(2)
  })

  it('leaves text without wikilinks untouched', () => {
    expect(transform('plain text')).toEqual([{ type: 'text', value: 'plain text' }])
  })

  // Why: the transform walks parsed nodes, so anything markdown already treats
  // as code or a link never reaches it.
  it('never rewrites inside code or existing links', () => {
    const tree: MarkdownNode = {
      type: 'root',
      children: [
        { type: 'code', value: '[[NotALink]]' },
        { type: 'link', url: 'https://example.com', children: [{ type: 'text', value: '[[X]]' }] }
      ]
    }
    remarkObsidianWikilinks()(tree)
    expect(tree.children?.[0]).toEqual({ type: 'code', value: '[[NotALink]]' })
    expect(tree.children?.[1]).toMatchObject({
      children: [{ type: 'text', value: '[[X]]' }]
    })
  })
})

describe('noteHrefTarget', () => {
  it('decodes a note href and ignores anything else', () => {
    expect(noteHrefTarget('obsidian-note:Projects%2FArgus')).toBe('Projects/Argus')
    expect(noteHrefTarget('https://example.com')).toBeNull()
  })
})
