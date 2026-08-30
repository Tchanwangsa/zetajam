/**
 * Your own answers, one entry per question you got right. Not a Sample: those
 * are a 1Hz snapshot of everybody's score, all that is available for somebody
 * else's line. Yours happen here, so the graph can hang a tooltip off them.
 */
export interface Step {
  /** Index in the question stream. */
  i: number
  /** Seconds since the run went live, at the moment it was answered. */
  t: number
  /** How long this one question took — the gap since the previous answer. */
  ms: number
  text: string
  answer: number
  /** The ramp level it was drawn from, or -1 outside a ramp run. */
  level: number
}

/** A per-question duration, at the precision that reads as a time rather than a measurement. */
export function fmtTook(ms: number): string {
  return ms < 10000 ? `${(ms / 1000).toFixed(2)}s` : `${(ms / 1000).toFixed(1)}s`
}

/** The clock reading a step landed on. */
export function fmtAt(t: number): string {
  const s = Math.floor(t)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
