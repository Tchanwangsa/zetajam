import type { Config } from './config'
import type { RoomGame } from './net'
import { SEATS } from './players'

/**
 * What the room's log means, read from one seat in it. Only a run you both
 * played in is a head-to-head result, so every pair in the room has a different
 * set of shared runs. Ids are per-connection: a reload comes back as a stranger.
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
 * A colour per person, held for the whole session. Not the seat colours a run
 * is drawn in — those are keyed to roster position, so the same person changes
 * colour in a run they joined late. Here it is handed out by first appearance.
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
        // Against the room, not the winner: in a run of five, second place
        // lost. The tallies below read it pair by pair instead, so the two can
        // disagree — you can lose a run and still beat the one person you
        // were watching.
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
        // The latest name they went by — a record filed under a name they
        // have since dropped reads as somebody else.
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
    // Most-played first: the person you have played all evening belongs at
    // the top, not whoever joined last.
    heads: [...heads.values()].sort((a, b) => b.played - a.played || b.won - a.won),
    runs: runs.reverse(),
  }
}
