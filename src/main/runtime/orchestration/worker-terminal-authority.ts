import type { OrcaRuntimeService } from '../orca-runtime'

/**
 * The pane identity a Dispatch is pinned to, refusing anything Argus cannot pin.
 *
 * A worker's lifecycle authority is the pane plus the exact process running in it, so a
 * terminal Argus cannot identify that precisely must not receive a Dispatch at all: its
 * later `worker_done` could not be told apart from a different process reusing the pane.
 */
export function requireWorkerAuthority(runtime: OrcaRuntimeService, terminalHandle: string) {
  const authority = runtime.getOrchestrationDispatchAuthority(terminalHandle)
  const paneKey = authority?.paneKey ?? runtime.getTerminalPaneKey(terminalHandle)
  const processIncarnation =
    authority?.processIncarnation ?? runtime.getTerminalProcessIncarnation(terminalHandle)
  if (!paneKey || !processIncarnation) {
    throw new Error('stable_pane_required')
  }
  return {
    paneKey,
    processIncarnation,
    ...(authority?.launchTokenHash ? { launchTokenHash: authority.launchTokenHash } : {}),
    ...(authority?.hostScope ? { hostScope: JSON.stringify(authority.hostScope) } : {})
  }
}
