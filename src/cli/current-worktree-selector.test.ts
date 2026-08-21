import { describe, expect, it, vi } from 'vitest'
import type { RuntimeClient } from './runtime-client'
import { resolveCurrentWorktreeSelector } from './selectors'

const FOLDER_WORKSPACE = { id: 'folder:fw-1', path: '/repos/group' }
const SUB_REPO = { id: 'repo-1::/repos/group/backend', path: '/repos/group/backend' }

function makeClient(worktrees: { id: string; path: string }[]): {
  client: RuntimeClient
  call: ReturnType<typeof vi.fn>
} {
  const call = vi.fn(async () => ({ result: { worktrees } }))
  return { client: { isRemote: false, call } as unknown as RuntimeClient, call }
}

describe('resolveCurrentWorktreeSelector', () => {
  it('asks the host to include folder workspaces', async () => {
    const { client, call } = makeClient([FOLDER_WORKSPACE])

    await resolveCurrentWorktreeSelector('/repos/group', client)

    expect(call).toHaveBeenCalledWith('worktree.list', {
      limit: 10_000,
      includeFolderWorkspaces: true
    })
  })

  it('resolves a folder workspace that no git worktree covers', async () => {
    const { client } = makeClient([SUB_REPO, FOLDER_WORKSPACE])

    await expect(resolveCurrentWorktreeSelector('/repos/group', client)).resolves.toBe(
      'id:folder:fw-1'
    )
  })

  it('still prefers the nested git worktree over the folder workspace enclosing it', async () => {
    const { client } = makeClient([FOLDER_WORKSPACE, SUB_REPO])

    await expect(resolveCurrentWorktreeSelector('/repos/group/backend/src', client)).resolves.toBe(
      'id:repo-1::/repos/group/backend'
    )
  })

  it('reports the directory when nothing managed encloses it', async () => {
    const { client } = makeClient([FOLDER_WORKSPACE])

    await expect(resolveCurrentWorktreeSelector('/elsewhere', client)).rejects.toThrow(
      /No Orca-managed worktree contains the current directory: \/elsewhere/
    )
  })
})
