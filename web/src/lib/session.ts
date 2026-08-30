import type { Config } from './config'
import type { RoomGame } from './net'
import { SEATS } from './players'

/**
 * What the room's log means, read from one seat in it.
 *
 * Two questions, one pass over the same rows. "How am I doing against her" is
 * the one people actually ask out loud, and it is not answered by a pile of
 * final scores: a run you both played in is a head-to-head result, a run one
 * of you sat out is not, and a room where five people have drifted in and out
 * all evening has a different set of shared runs for every pair in it.
 *
 * Ids are per-connection, so a player who reloads comes back as a stranger
 * with the same name. That is the honest reading of "this session" — the
 * record belongs to the room, and the room's memory ends when it empties.
 */

/** Your record against one other player, over the runs you both played. */
export interface Head {
  id: string
  name: string
  color: string
  won: number
  drew: number
  lost: number
  /** Runs the two of you were both in. Always won + drew + lost. */
  played: number
}

export interface RunSeat {
  id: string
  name: string
  score: number
  color: string
  you: boolean
  /** Shared the top score. Plural, because a tie has two of them. */
  top: boolean
}

export interface Run {
  id: string
  /** 1 for the first run of the evening, counting up. */
  n: number
  seats: RunSeat[]
  /** What it was played on, if the server said. */
  cfg?: Config
  /** How it went for you, or null for a run you were not in. */
  outcome: 'won' | 'drew' | 'lost' | 'solo' | null
}

export interface Session {
  heads: Head[]
  /** Newest first — a log is read from the top. */
  runs: Run[]
}

/**
 * A colour per person, held for the whole session.
 *
 * Not the same thing as the seat colours a single run is drawn in: those are
 * keyed to roster position, so the same person is a different colour in a run
 * they joined late. Here a colour has to mean one person across every row on
 * the screen, so it is handed out by first appearance in the log and kept.
 */
function palette(log: RoomGame[], selfId: string): (id: string) => string {
  const order: string[] = []
  for (const g of log) {
    for (const r of g.results) {
      if (r.id !== selfId && !order.includes(r.id)) order.push(r.id)
    }
  }
  return (id) => {
    if (id === selfId) return 'var(--accent)'
    const i = order.indexOf(id)
    return i < 0 ? 'var(--muted)' : `var(--p${(i % SEATS) + 1})`
  }
}

export function digest(log: RoomGame[], selfId: string): Session {
  const color = palette(log, selfId)
  const heads = new Map<string, Head>()
  const runs: Run[] = []

  log.forEach((g, i) => {
    const top = Math.max(...g.results.map((r) => r.score), 0)
    const seats = [...g.results]
      .sort((a, b) => b.score - a.score)
      .map((r) => ({
        id: r.id,
        name: r.name,
        score: r.score,
        color: color(r.id),
        you: r.id === selfId,
        top: r.score === top,
      }))

    const me = g.results.find((r) => r.id === selfId)
    let outcome: Run['outcome'] = null
    if (me) {
      if (g.results.length < 2) outcome = 'solo'
      else {
        // Against the room, not against the winner: in a run of five, second
        // place lost. The head-to-head tallies below read it pair by pair
        // instead, which is why the two can disagree — you can lose a run and
        // still have beaten the one person you were watching.
        const best = Math.max(...g.results.filter((r) => r.id !== selfId).map((r) => r.score))
        outcome = me.score > best ? 'won' : me.score < best ? 'lost' : 'drew'
      }

      for (const r of g.results) {
        if (r.id === selfId) continue
        const h = heads.get(r.id) ?? {
          id: r.id,
          name: r.name,
          color: color(r.id),
          won: 0,
          drew: 0,
          lost: 0,
          played: 0,
        }
        // The latest name they went by. Renaming mid-session is one line in
        // the room roster, and a record filed under the name they have since
        // dropped reads as somebody else entirely.
        h.name = r.name
        h.played++
        if (me.score > r.score) h.won++
        else if (me.score < r.score) h.lost++
        else h.drew++
        heads.set(r.id, h)
      }
    }

    runs.push({ id: g.id, n: i + 1, seats, cfg: g.cfg, outcome })
  })

  return {
    // Most-played first, then by how it is going — the person you have played
    // all evening belongs at the top, not whoever happened to join last.
    heads: [...heads.values()].sort((a, b) => b.played - a.played || b.won - a.won),
    runs: runs.reverse(),
  }
}
