/** What a pane-close request resolves to, given the manager's live pane list. */
export type PaneCloseDecision = "close-pane" | "close-tab" | "ignore";

/**
 * Resolves a pane-close request against the panes the manager actually holds.
 *
 * Why the membership check: the close button renders off React's `paneCount`
 * state while the click reads the live pane list, so the two can diverge. A
 * request for a pane that is no longer live must be dropped — without this it
 * fell into the `length <= 1` branch and escalated into closing the whole tab,
 * killing every sibling split instead of the one that was clicked.
 */
export function decidePaneClose(
  livePaneIds: readonly number[],
  paneId: number,
): PaneCloseDecision {
  if (!livePaneIds.includes(paneId)) {
    return "ignore";
  }
  return livePaneIds.length <= 1 ? "close-tab" : "close-pane";
}
