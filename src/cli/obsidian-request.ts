import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { OBSIDIAN_MAX_WRITE_BYTES } from '../shared/obsidian-types'
import type { HandlerContext } from './dispatch'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRepeatedStringFlag,
  getRequiredStringFlag,
  getRequiredStringFlagAllowingEmpty
} from './flags'
import { RuntimeClientError } from './runtime/types'

export type VaultScopedParams = { vault?: string }

export function vaultScope(ctx: HandlerContext): VaultScopedParams {
  const vault = getOptionalStringFlag(ctx.flags, 'vault')
  return vault ? { vault } : {}
}

export function booleanFlag(ctx: HandlerContext, name: string): boolean {
  return ctx.flags.get(name) === true
}

export function requireNote(ctx: HandlerContext): string {
  return getRequiredStringFlag(ctx.flags, 'note')
}

export function optionalLimit(ctx: HandlerContext): { limit?: number } {
  const limit = getOptionalPositiveIntegerFlag(ctx.flags, 'limit')
  return limit === undefined ? {} : { limit }
}

export function optionalString(ctx: HandlerContext, name: string): Record<string, string> {
  const value = getOptionalStringFlag(ctx.flags, name)
  return value === undefined ? {} : { [name]: value }
}

export function repeated(ctx: HandlerContext, name: string): string[] {
  return getRepeatedStringFlag(ctx.flags, name)
}

/**
 * `--content` for one-liners, `--content-file` for real prose, `-` for stdin —
 * the same shape the Linear body flags use, so agents do not learn a new one.
 */
export async function readContent(
  ctx: HandlerContext,
  options: { required: boolean }
): Promise<string | undefined> {
  const hasInline = ctx.flags.has('content')
  const hasFile = ctx.flags.has('content-file')
  if (hasInline && hasFile) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --content or --content-file, not both'
    )
  }
  if (!hasInline && !hasFile) {
    if (options.required) {
      throw new RuntimeClientError('invalid_argument', 'Missing --content or --content-file')
    }
    return undefined
  }
  const content = hasInline
    ? getRequiredStringFlagAllowingEmpty(ctx.flags, 'content')
    : await readContentFile(getRequiredStringFlag(ctx.flags, 'content-file'), ctx.cwd)
  if (Buffer.byteLength(content, 'utf-8') > OBSIDIAN_MAX_WRITE_BYTES) {
    throw new RuntimeClientError(
      'obsidian_write_too_large',
      `Note content must be at most ${OBSIDIAN_MAX_WRITE_BYTES} bytes`
    )
  }
  return content
}

async function readContentFile(path: string, cwd: string): Promise<string> {
  if (path !== '-') {
    return await readFile(isAbsolute(path) ? path : join(cwd, path), 'utf8')
  }
  if (process.stdin.isTTY) {
    throw new RuntimeClientError('invalid_argument', 'stdin content requested but stdin is a TTY')
  }
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf8')
}
