/**
 * A rush run laid out as the questions it actually contained.
 *
 * The graph hangs its tooltip off `steps` in every other mode, and `steps` is
 * the log of *your own answers* — which in rush is a log of the questions you
 * won and nothing else. That is a poor description of a rush run: most of what
 * happened in one happened to somebody else, or to nobody, and a run where you
 * took four of thirty questions would be a graph you could ask four questions
 * of.
 *
 * So rush gets its own timeline. Every slot the run held is in it, whoever
 * ended up with it, because every slot is knowable here: the questions are a
 * pure function of the seed, the boundaries are the fold in `rushNext` over
 * the claims, and the claims are exactly what the server has been sending all
 * along. Nothing extra travels for this.
 */
import { RUSH_MS, rushNext, type Config } from './config'
import { question } from './questions'
import type { Claim } from './net'

/** One question of a rush run: when it stood, what it was, and who took it. */
export interface Slot {
  /** Slot number, which is also its index in the question stream. */
  i: number
  /** Seconds into the run at which it went up. */
  from: number
  /** Seconds into the run at which it came down, or the run ended. */
  to: number
  /**
   * How long it stood before the buzz that took it — the answer to "how fast
   * was that", which is the question a rush run actually asks. Not the gap
   * since your own previous answer, which is what a Step carries and which
   * means nothing here: the questions in between were not yours to answer.
   *
   * Null for a slot nobody took. It stood the full five seconds by definition,
   * so the number would carry no information.
   */
  took: number | null
  /** Seconds at which the buzz landed. Null if nobody buzzed. */
  at: number | null
  text: string
  answer: number
  /** The player who took it, or null if nobody did. */
  by: string | null
}

/**
 * Every slot of a run of `durMs`, in order, tiling it end to end.
 *
 * The fold is `rushNext` — the same one the frame loop walks and the server
 * pins — so the boundaries here are the boundaries everybody played on. It
 * terminates because RUSH_GAP_MS is positive, which puts a floor on the length
 * of a slot.
 *
 * A claim's timestamp is the winner's own clock, so it is clamped into the
 * slot it settles before being read as a duration: the wire tolerates a little
 * skew either side of a boundary, and a tooltip reading "-0.12s" would not.
 */
export function timeline(
  seed: number,
  cfg: Config,
  claims: Record<number, Claim>,
  durMs: number,
): Slot[] {
  const out: Slot[] = []
  for (let i = 0, open = 0; open < durMs; i++) {
    const c = claims[i]
    const end = rushNext(open, c?.ms ?? 0, !!c)
    const at = c ? Math.min(Math.max(c.ms, open), open + RUSH_MS) : null
    const q = question(seed, i, cfg)
    out.push({
      i,
      from: open / 1000,
      to: Math.min(end, durMs) / 1000,
      took: at === null ? null : (at - open) / 1000,
      at: at === null ? null : at / 1000,
      text: q.text,
      answer: q.answer,
      by: c?.id ?? null,
    })
    open = end
  }
  return out
}
