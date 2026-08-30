/**
 * Graph maths. The y axis is cumulative answers — the number on the scoreboard,
 * plotted — so the line is the score, not a derivative of it.
 *
 * That choice does most of the anti-jitter work on its own: a running total is
 * monotonic, so the peak only ever grows, so the axis only ever grows, so it
 * can never snap back. What is left is two rules:
 *
 *  1. Sample on a fixed 1Hz clock, never on a network event. The old version
 *     redrew on every opponent keystroke, so the line danced to their typing.
 *  2. Fixed x domain (0..duration). It cannot rescale because it never grows.
 *
 * The curve is drawn as stairs, never point to point. A rate needed smoothing
 * to read as a trend; a step count does not — the steps are the information,
 * and a diagonal between two readings would draw answers arriving in fractions.
 */

export interface Sample {
  /** Seconds since the match went live. */
  t: number
  /** Cumulative score per player, indexed the same way the roster is. */
  s: number[]
}

/** Round pixel values so the SVG path stays short and diff-friendly. */
const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * A round axis step for a maximum: 1, 2, 2.5, 5 or 10 times a power of ten.
 * Keeps a 12-answer warm-up and a 300-answer marathon equally readable.
 *
 * The 2.5 rung is dropped below a magnitude of ten, because the axis counts
 * answers and nobody has given two and a half of one.
 */
export function niceStep(max: number, count = 4): number {
  const raw = Math.max(1, max / count)
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const m of mag >= 10 ? [1, 2, 2.5, 5] : [1, 2, 5]) {
    if (raw <= m * mag) return m * mag
  }
  return 10 * mag
}

/**
 * The y ceiling: the running peak rounded up to a whole number of axis steps,
 * never below `floor`. Because the peak of a cumulative series can only grow,
 * so can this — which is the whole trick to an axis that does not twitch.
 */
export function ceilMax(peak: number, floor = 10): number {
  const target = Math.max(floor, peak)
  return Math.ceil(target / niceStep(target)) * niceStep(target)
}

/** Round tick values covering [0, max] without crowding the axis. */
export function ticks(max: number): number[] {
  const step = niceStep(max)
  const out: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v)
  return out
}

/**
 * Hold each reading until the next one, then jump: the stair shape a
 * cumulative count actually has. A sampled series only knows what the score
 * was at each reading, so the value in between is the earlier one — sloping
 * across the gap invents a climb that never happened.
 */
export function stepPoints(pts: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const [px, py] of pts) {
    const prev = out[out.length - 1]
    if (prev && prev[1] !== py) out.push([px, prev[1]])
    out.push([px, py])
  }
  return out
}

/** Straight segments, point to point. */
export function linePath(pts: Array<[number, number]>): string {
  if (!pts.length) return ''
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`
  for (let i = 1; i < pts.length; i++) d += `L${r1(pts[i][0])},${r1(pts[i][1])}`
  return d
}

/** The highest cumulative score reached by anybody, across every sample. */
export function peakOf(samples: Sample[]): number {
  const last = samples[samples.length - 1]
  return last ? Math.max(0, ...last.s) : 0
}
