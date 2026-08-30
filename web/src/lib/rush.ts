/**
 * A rush run laid out as the questions it contained. `steps` holds only the
 * questions you won, so rush gets its own timeline — and nothing extra travels:
 * questions are pure in the seed, boundaries a `rushNext` fold over the claims.
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
   * How long it stood before the buzz that took it — not the gap since your
   * own previous answer, which is what a Step carries and means nothing here.
   * Null for a slot nobody took: it stood the full RUSH_SEC by definition.
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
 * Every slot of a run of `durMs`, tiling it end to end. The fold is `rushNext`,
 * terminating because RUSH_GAP_MS is positive. A claim carries the winner's own
 * clock, so it is clamped into its slot — skew would read as "-0.12s".
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
