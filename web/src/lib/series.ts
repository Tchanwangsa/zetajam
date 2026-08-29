/**
 * Turning a score counter into a graph that does not twitch.
 *
 * Four rules, and each one kills a different source of jitter:
 *
 *  1. Sample on a fixed 1Hz clock, never on a network event. The old version
 *     redrew on every opponent keystroke, so the line danced to their typing.
 *  2. Fixed x domain (0..duration). It cannot rescale because it never grows.
 *  3. Ratcheted y domain — steps of 20, monotonically non-decreasing for the
 *     life of a run. An axis that never shrinks never snaps back.
 *  4. Monotone-cubic interpolation plus an EMA on the instantaneous rate, so
 *     the curve reads as a trend instead of a staircase.
 */

export interface Sample {
  t: number // seconds since the match went live
  a: number // your cumulative score
  b: number // opponent's cumulative score
}

export interface Series {
  /** Trailing-window rate in answers/min, EMA-smoothed. The lively line. */
  inst: number[]
  /** Cumulative average rate in answers/min. The calm, converging line. */
  avg: number[]
}

const WINDOW = 6 // seconds of trailing history for the instantaneous rate
const ALPHA = 0.35 // EMA weight on each new reading

export function series(samples: Sample[], pick: (s: Sample) => number): Series {
  const inst: number[] = []
  const avg: number[] = []
  let ema = NaN

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const j = Math.max(0, i - WINDOW)
    const dt = s.t - samples[j].t
    const raw = dt > 0 ? ((pick(s) - pick(samples[j])) * 60) / dt : 0

    ema = Number.isNaN(ema) ? raw : ema + ALPHA * (raw - ema)
    inst.push(ema)
    avg.push(s.t > 0 ? (pick(s) * 60) / s.t : 0)
  }
  return { inst, avg }
}

/**
 * The y ceiling for a run. Only ever called with the running peak, and only
 * ever allowed to grow — that is the whole trick to a stable axis.
 */
export function ratchet(current: number, peak: number, step = 20): number {
  return Math.max(current, Math.ceil((peak * 1.1) / step) * step, step)
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson). Unlike a plain Catmull-Rom
 * spline this cannot overshoot between points, so a flat stretch stays flat
 * instead of bulging — which matters a lot when the data is a rate that
 * physically cannot go negative.
 */
export function smoothPath(pts: Array<[number, number]>): string {
  const n = pts.length
  if (n === 0) return ''
  const r = (v: number) => Math.round(v * 10) / 10
  if (n === 1) return `M${r(pts[0][0])},${r(pts[0][1])}`
  if (n === 2) {
    return `M${r(pts[0][0])},${r(pts[0][1])}L${r(pts[1][0])},${r(pts[1][1])}`
  }

  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    slope.push(dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0)
  }

  const m: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m.push(0) // a local extremum: flatten it rather than overshoot
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]))
    }
  }
  m.push(slope[n - 2])

  let d = `M${r(pts[0][0])},${r(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i][0] + dx[i] / 3
    const c1y = pts[i][1] + (m[i] * dx[i]) / 3
    const c2x = pts[i + 1][0] - dx[i] / 3
    const c2y = pts[i + 1][1] - (m[i + 1] * dx[i]) / 3
    d += `C${r(c1x)},${r(c1y)} ${r(c2x)},${r(c2y)} ${r(pts[i + 1][0])},${r(pts[i + 1][1])}`
  }
  return d
}

/** Nice round tick values covering [0, max] without crowding the axis. */
export function ticks(max: number, count = 4): number[] {
  const step = Math.max(1, Math.ceil(max / count / 10) * 10)
  const out: number[] = []
  for (let v = 0; v <= max + 0.001; v += step) out.push(v)
  return out
}
