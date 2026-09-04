const WIKILINK = /(!?)\[\[([^\]\n]+)\]\]/g
const MARKDOWN_LINK = /(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g

export type LinkRewrite = {
  /** Vault-relative path the link currently resolves to. */
  fromPath: string
  toPath: string
  /** Write bare names instead of full paths when the new basename stays unique. */
  preferBareName: boolean
}

function stripExtension(value: string): string {
  return value.replace(/\.(?:md|markdown)$/i, '')
}

function baseName(notePath: string): string {
  return stripExtension(notePath.split('/').pop() ?? notePath)
}

function wikilinkTarget(rewrite: LinkRewrite, original: string): string {
  const usedPath = original.includes('/')
  return usedPath || !rewrite.preferBareName
    ? stripExtension(rewrite.toPath)
    : baseName(rewrite.toPath)
}

function markdownTarget(rewrite: LinkRewrite): string {
  return rewrite.toPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

type ResolveTarget = (target: string, fromPath: string) => string | null

/**
 * Rewrites only the links that actually resolve to the moved note, so a note
 * named `Index` does not drag every other `Index` reference along with it.
 */
export function rewriteLinksInText(
  text: string,
  sourcePath: string,
  rewrite: LinkRewrite,
  resolve: ResolveTarget
): { text: string; replacements: number } {
  let replacements = 0
  const withWikilinks = text.replace(WIKILINK, (match, bang: string, inner: string) => {
    const [linkPart, ...aliasParts] = inner.split('|')
    const blockSplit = linkPart.split('^')
    const headingSplit = blockSplit[0].split('#')
    const target = headingSplit[0].trim()
    if (!target || resolve(target, sourcePath) !== rewrite.fromPath) {
      return match
    }
    const suffix = [
      headingSplit.length > 1 ? `#${headingSplit.slice(1).join('#')}` : '',
      blockSplit.length > 1 ? `^${blockSplit.slice(1).join('^')}` : ''
    ].join('')
    const alias = aliasParts.length > 0 ? `|${aliasParts.join('|')}` : ''
    const next = `${bang}[[${wikilinkTarget(rewrite, target)}${suffix}${alias}]]`
    // A pure folder move leaves bare-name links already correct; rewriting them
    // would churn every backlink for no change.
    if (next === match) {
      return match
    }
    replacements += 1
    return next
  })
  const withMarkdown = withWikilinks.replace(
    MARKDOWN_LINK,
    (match, bang: string, label: string, target: string) => {
      const cleaned = target.split(/\s+/)[0].replace(/^<|>$/g, '')
      if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned) || cleaned.startsWith('#')) {
        return match
      }
      const [pathPart, ...headingParts] = safeDecode(cleaned).split('#')
      if (!pathPart || resolve(pathPart.trim(), sourcePath) !== rewrite.fromPath) {
        return match
      }
      const heading = headingParts.length > 0 ? `#${headingParts.join('#')}` : ''
      const next = `${bang}[${label}](${markdownTarget(rewrite)}${heading})`
      if (next === match) {
        return match
      }
      replacements += 1
      return next
    }
  )
  return { text: withMarkdown, replacements }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
