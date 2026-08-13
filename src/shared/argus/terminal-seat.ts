/**
 * Terminal seats — which *project agent* occupies a terminal pane.
 *
 * Argus has two unrelated senses of "agent", and this module owns the second one:
 *
 *   - the **Argus agent** is the tool running in the pane (`claude`, `codex`, …). That is
 *     `TuiAgent`, persisted per tab as `launchAgent`, and reported by
 *     `terminal.isRunningAgent` / `terminal.agentStatus`.
 *   - the **project agent** is the named role the project defines in
 *     `<workspace>/.claude/agents/*.md` (`AUDITOR`, `BOSS`, `ENGINEER`, …).
 *
 * A seat binds the second to a pane, so three panes all running `claude` stay
 * distinguishable. The pane is the seat; the project agent occupies it. Seat names are
 * unique per worktree, which is what lets `seat:AUDITOR` resolve to exactly one handle.
 */

/** Uppercase project-agent name, as written in the `.md` frontmatter. */
export type TerminalSeatName = string

export type TerminalSeatAssignment = {
  seat: TerminalSeatName
  leafId: string
}

/** Seat name → leafId of the occupying pane, for one worktree. */
export type TerminalSeatMap = Record<TerminalSeatName, string>

// Why: seat names reach the CLI as flag values and selector suffixes, so they must not
// carry whitespace, `:` (the selector separator), or shell-hostile characters. The
// project .md files use plain uppercase identifiers; this admits exactly those.
const SEAT_NAME_PATTERN = /^[A-Z][A-Z0-9_-]{0,63}$/

export class InvalidSeatNameError extends Error {}

/**
 * Case-folds a caller-supplied seat name to its canonical uppercase form, so
 * `--seat auditor` and `--seat AUDITOR` name the same seat.
 */
export function normalizeSeatName(raw: string): TerminalSeatName {
  const normalized = raw.trim().toUpperCase()
  if (!SEAT_NAME_PATTERN.test(normalized)) {
    throw new InvalidSeatNameError(
      `Invalid seat name: ${JSON.stringify(raw)}. Seat names are project-agent names — letters, digits, "_" and "-", starting with a letter (for example AUDITOR).`
    )
  }
  return normalized
}

export function isSeatNameValid(raw: string): boolean {
  try {
    normalizeSeatName(raw)
    return true
  } catch {
    return false
  }
}

export const SEAT_SELECTOR_PREFIX = 'seat:'

/** Parses `seat:AUDITOR`, returning null for anything that is not a seat selector. */
export function parseSeatSelector(selector: string): TerminalSeatName | null {
  if (!selector.startsWith(SEAT_SELECTOR_PREFIX)) {
    return null
  }
  return normalizeSeatName(selector.slice(SEAT_SELECTOR_PREFIX.length))
}

export function findSeatForLeaf(seats: TerminalSeatMap, leafId: string): TerminalSeatName | null {
  for (const [seat, occupant] of Object.entries(seats)) {
    if (occupant === leafId) {
      return seat
    }
  }
  return null
}

/**
 * Assigns `seat` to `leafId`.
 *
 * Seats are exclusive: assigning an occupied seat is refused unless the caller confirms
 * with `force`, and a pane holds at most one seat, so re-seating a pane vacates the seat
 * it already held. Returns the new map plus what the assignment displaced, so the CLI can
 * report it rather than silently moving a label.
 */
export function assignSeat(
  seats: TerminalSeatMap,
  seat: TerminalSeatName,
  leafId: string,
  options: { force?: boolean } = {}
): {
  seats: TerminalSeatMap
  displacedLeafId: string | null
  vacatedSeat: TerminalSeatName | null
} {
  const occupant = seats[seat]
  if (occupant !== undefined && occupant !== leafId && options.force !== true) {
    throw new SeatOccupiedError(seat, occupant)
  }
  const previousSeat = findSeatForLeaf(seats, leafId)
  const next: TerminalSeatMap = { ...seats }
  if (previousSeat !== null) {
    delete next[previousSeat]
  }
  next[seat] = leafId
  return {
    seats: next,
    displacedLeafId: occupant !== undefined && occupant !== leafId ? occupant : null,
    vacatedSeat: previousSeat !== null && previousSeat !== seat ? previousSeat : null
  }
}

export class SeatOccupiedError extends Error {
  constructor(
    readonly seat: TerminalSeatName,
    readonly occupantLeafId: string
  ) {
    super(`Seat ${seat} is already assigned to another terminal in this worktree`)
  }
}

export function clearSeatForLeaf(
  seats: TerminalSeatMap,
  leafId: string
): { seats: TerminalSeatMap; clearedSeat: TerminalSeatName | null } {
  const seat = findSeatForLeaf(seats, leafId)
  if (seat === null) {
    return { seats, clearedSeat: null }
  }
  const next = { ...seats }
  delete next[seat]
  return { seats: next, clearedSeat: seat }
}

/**
 * Drops seats whose pane no longer exists.
 *
 * Why: a seat outlives the pane that held it (closing a pane does not route through
 * assign), so a stale entry would make `seat:AUDITOR` resolve to a dead leaf. Liveness is
 * decided by the caller, which owns the leaf graph.
 */
export function pruneSeats(
  seats: TerminalSeatMap,
  isLeafLive: (leafId: string) => boolean
): {
  seats: TerminalSeatMap
  pruned: TerminalSeatAssignment[]
} {
  const next: TerminalSeatMap = {}
  const pruned: TerminalSeatAssignment[] = []
  for (const [seat, leafId] of Object.entries(seats)) {
    if (isLeafLive(leafId)) {
      next[seat] = leafId
    } else {
      pruned.push({ seat, leafId })
    }
  }
  return { seats: next, pruned }
}
