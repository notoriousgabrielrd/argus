import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { cn } from '@/lib/utils'
import {
  noteHrefTarget,
  remarkObsidianWikilinks,
  OBSIDIAN_NOTE_HREF_PREFIX
} from './obsidian-wikilinks'

const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'obsidian-note']
  }
}

type ObsidianNoteMarkdownProps = {
  content: string
  onOpenNote: (target: string) => void
  className?: string
}

/**
 * Reader view for a vault note. Wikilinks resolve to other notes in the same
 * vault; everything else follows the app's normal external-link handling.
 */
export function ObsidianNoteMarkdown({
  content,
  onOpenNote,
  className
}: ObsidianNoteMarkdownProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'max-w-3xl text-[13px] leading-relaxed text-foreground [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-4 [&_hr]:border-border [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-accent [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        className
      )}
    >
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkObsidianWikilinks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        urlTransform={(value, key, node) =>
          key === 'href' && node?.tagName === 'a' && value.startsWith(OBSIDIAN_NOTE_HREF_PREFIX)
            ? value
            : defaultUrlTransform(value)
        }
        components={{
          a: ({ href, children }) => {
            const target = href ? noteHrefTarget(href) : null
            if (target) {
              return (
                <button
                  type="button"
                  onClick={() => onOpenNote(target)}
                  className="text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {children}
                </button>
              )
            }
            return (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault()
                  if (href) {
                    void window.api.shell.openUrl(href)
                  }
                }}
                className="text-primary underline underline-offset-2"
              >
                {children}
              </a>
            )
          },
          // Why: a note can embed an image by absolute path; the renderer has no
          // file access, so show the alt text instead of a broken image frame.
          img: ({ alt, src }) =>
            typeof src === 'string' && /^https?:/i.test(src) ? (
              <img src={src} alt={alt ?? ''} className="my-2 max-w-full rounded" />
            ) : (
              <span className="text-xs text-muted-foreground">{alt || src}</span>
            )
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
