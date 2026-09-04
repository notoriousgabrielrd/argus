import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ObsidianSearchHit,
  ObsidianTagCount,
  ObsidianTreeEntry,
  ObsidianVault,
  ObsidianVaultStats
} from '../../../../shared/obsidian-types'

const SEARCH_DEBOUNCE_MS = 250
const SEARCH_LIMIT = 60
const TAG_LIMIT = 12
/** The schema caps depth at 10; vault folders never nest that far in practice. */
const TREE_DEPTH = 10

export type ObsidianSearchRow = {
  path: string
  title: string
  detail: string
}

export type ObsidianVaultBrowser = {
  vaults: readonly ObsidianVault[]
  activeVault: ObsidianVault | null
  stats: ObsidianVaultStats | null
  tags: readonly ObsidianTagCount[]
  tree: ObsidianTreeEntry | null
  searchRows: readonly ObsidianSearchRow[] | null
  expandedFolders: ReadonlySet<string>
  query: string
  activeTag: string | null
  loading: boolean
  error: string | null
  setQuery: (query: string) => void
  selectVault: (vaultId: string) => void
  toggleTag: (tag: string) => void
  toggleFolder: (path: string) => void
  refresh: () => void
  addVault: () => void
  reportError: (message: string) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function rowsFromHits(hits: readonly ObsidianSearchHit[]): ObsidianSearchRow[] {
  return hits.map((hit) => ({
    path: hit.path,
    title: hit.title,
    detail: hit.matches[0]?.text ?? hit.path
  }))
}

/** Folders holding notes start open so the vault reads like Obsidian's file tree. */
function initiallyExpanded(entry: ObsidianTreeEntry | null): Set<string> {
  const expanded = new Set<string>()
  if (!entry) {
    return expanded
  }
  expanded.add(entry.path)
  for (const child of entry.children ?? []) {
    if (child.type === 'folder' && (child.noteCount ?? 0) > 0) {
      expanded.add(child.path)
    }
  }
  return expanded
}

export function useObsidianVaultBrowser(isVisible: boolean): ObsidianVaultBrowser {
  const [vaults, setVaults] = useState<readonly ObsidianVault[]>([])
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null)
  const [stats, setStats] = useState<ObsidianVaultStats | null>(null)
  const [tags, setTags] = useState<readonly ObsidianTagCount[]>([])
  const [tree, setTree] = useState<ObsidianTreeEntry | null>(null)
  const [searchRows, setSearchRows] = useState<readonly ObsidianSearchRow[] | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(() => new Set())
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  // Why: a slow vault scan must never overwrite a newer request's result.
  const requestSeqRef = useRef(0)

  const activeVault = useMemo(
    () => vaults.find((vault) => vault.id === activeVaultId) ?? null,
    [vaults, activeVaultId]
  )

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await window.api.obsidian.listVaults()
        if (cancelled) {
          return
        }
        setVaults(result.vaults)
        setActiveVaultId((current) =>
          current && result.vaults.some((vault) => vault.id === current)
            ? current
            : ((result.vaults.find((vault) => vault.isDefault) ?? result.vaults[0])?.id ?? null)
        )
        setError(null)
      } catch (cause) {
        if (!cancelled) {
          setError(errorMessage(cause))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isVisible, generation])

  useEffect(() => {
    if (!isVisible || !activeVault) {
      return
    }
    const vault = activeVault.id
    let cancelled = false
    void (async () => {
      try {
        const [info, tagResult] = await Promise.all([
          window.api.obsidian.vaultInfo({ vault }),
          window.api.obsidian.tags({ vault, limit: TAG_LIMIT })
        ])
        if (!cancelled) {
          setStats(info)
          setTags(tagResult.tags)
        }
      } catch (cause) {
        if (!cancelled) {
          setError(errorMessage(cause))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isVisible, activeVault, generation])

  useEffect(() => {
    if (!isVisible || !activeVault) {
      setTree(null)
      setSearchRows(null)
      // Why: losing the vault mid-scan otherwise leaves the refresh spinner turning
      // forever, and lets the abandoned scan write its tree back over the cleared one.
      requestSeqRef.current += 1
      setLoading(false)
      return
    }
    const vault = activeVault.id
    const seq = requestSeqRef.current + 1
    requestSeqRef.current = seq
    setLoading(true)
    void (async () => {
      try {
        if (debouncedQuery) {
          const result = await window.api.obsidian.search({
            vault,
            query: debouncedQuery,
            limit: SEARCH_LIMIT,
            ...(activeTag ? { tag: [activeTag] } : {})
          })
          if (requestSeqRef.current === seq) {
            setSearchRows(rowsFromHits(result.hits))
            setError(null)
          }
          return
        }
        const result = await window.api.obsidian.tree({
          vault,
          depth: TREE_DEPTH,
          includeNotes: true
        })
        if (requestSeqRef.current === seq) {
          setTree(result)
          setSearchRows(null)
          setExpandedFolders((current) => (current.size > 0 ? current : initiallyExpanded(result)))
          setError(null)
        }
      } catch (cause) {
        if (requestSeqRef.current === seq) {
          setError(errorMessage(cause))
          setSearchRows(null)
        }
      } finally {
        if (requestSeqRef.current === seq) {
          setLoading(false)
        }
      }
    })()
  }, [isVisible, activeVault, debouncedQuery, activeTag, generation])

  const addVault = useCallback(() => {
    void (async () => {
      try {
        const result = await window.api.obsidian.pickVault()
        if (result.vault) {
          setActiveVaultId(result.vault.id)
          setGeneration((value) => value + 1)
        }
      } catch (cause) {
        setError(errorMessage(cause))
      }
    })()
  }, [])

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  return {
    vaults,
    activeVault,
    stats,
    tags,
    tree,
    searchRows,
    expandedFolders,
    query,
    activeTag,
    loading,
    error,
    setQuery,
    selectVault: (vaultId: string) => setActiveVaultId(vaultId),
    toggleTag: (tag: string) => setActiveTag((current) => (current === tag ? null : tag)),
    toggleFolder,
    refresh: () => setGeneration((value) => value + 1),
    addVault,
    reportError: setError
  }
}
