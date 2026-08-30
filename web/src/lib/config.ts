// Mirror of internal/quiz/config.go.
//
// The server normalizes whatever a client sends and echoes the result back in
// the match frame, and that echoed copy is the one the generator runs on. The
// normalize() here is for the settings UI — so the bar shows you the same
// numbers the server would have picked — not for gameplay.

export type Op = 'add' | 'sub' | 'mul' | 'div'

/** Canonical order. Part of the wire contract — see quiz.Ops. */
export const OPS: readonly Op[] = ['add', 'sub', 'mul', 'div']

/**
 * The two operations that own a range. The other two are these read backwards
 * — `a + b` shown as `(a+b) − a`, `a × b` shown as `(a×b) ÷ a` — which is what
 * keeps every answer a clean positive integer, and why the settings panel
 * offers two ranges rather than four. Mirror of quiz.Forward.
 */
export const FORWARD: readonly Op[] = ['add', 'mul']

/** Which forward operation each inverse is derived from. */
export const INVERSE_OF: Partial<Record<Op, Op>> = { sub: 'add', div: 'mul' }

export const GLYPH: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' }
export const OP_NAME: Record<Op, string> = {
  add: 'addition',
  sub: 'subtraction',
  mul: 'multiplication',
  div: 'division',
}

/** [lo1, hi1, lo2, hi2] — inclusive bounds for the two operands. */
export type Range = [number, number, number, number]

/**
 * The three shapes a run can take. Mirror of quiz.ModeClassic / ModeRamp /
 * ModeRush.
 *
 * Classic draws every question from one fixed pair of ranges — the ones in the
 * config. Ramp ignores them and walks TIERS instead, so the run opens easy and
 * ends on the classic defaults. Rush draws from the config's ranges exactly as
 * classic does and changes the rules rather than the numbers: one question
 * stands in front of everybody at once for up to RUSH_SEC, and the first
 * correct answer to reach the server takes the only point it is worth — and
 * ends the question there and then, for everybody.
 */
export type Mode = 'classic' | 'ramp' | 'rush'

export const MODES: readonly Mode[] = ['classic', 'ramp', 'rush']

export const MODE_NAME: Record<Mode, string> = {
  classic: 'classic',
  ramp: 'ramp',
  rush: 'rush',
}

/** Mirror of quiz.RushSec. One slot, one question, one point — and RUSH_SEC is
    how long it stands only if nobody takes it. */
export const RUSH_SEC = 5
export const RUSH_MS = RUSH_SEC * 1000

/** Mirror of quiz.RushGapMs. The beat between a slot being taken and the next
    one opening — long enough that the winner's own screen does not swap the
    equation out mid-keystroke, and shorter than the eye needs to read a name,
    because the verdict line carries into the next slot rather than going with
    this one. Must stay positive: it is the floor on how long a slot lasts, and
    what makes the fold below terminate. */
export const RUSH_GAP_MS = 300

/**
 * The millisecond at which the slot after the one that opened at `open`
 * begins. Mirror of quiz.RushNext.
 *
 * A rush schedule is not a function of the clock; it is this fold over the run
 * so far. Slot 0 opens at 0, and each slot after it opens either RUSH_GAP_MS
 * after the claim that settled its predecessor or RUSH_MS after that
 * predecessor opened, whichever comes first — `claimed` is false for a slot
 * nobody took, and then only the second term applies.
 *
 * Nothing is sent to drive the turnover. A claim frame already carries the
 * slot and the millisecond it landed on, so every screen in the room folds the
 * same history into the same boundaries, and the question stream stays what it
 * has always been: a pure function of (seed, index, cfg).
 */
export function rushNext(open: number, ms: number, claimed: boolean): number {
  const end = open + RUSH_MS
  if (!claimed) return end
  return Math.min(end, Math.max(open, ms) + RUSH_GAP_MS)
}

/**
 * The fewest questions a rush run of this length gets through — what it holds
 * if every slot runs its full RUSH_SEC out. Every slot somebody takes early
 * buys the run another one, so this is a floor, not a count. Mirror of
 * quiz.RushSlots.
 */
export const rushSlots = (durSec: number) => Math.max(1, Math.ceil((durSec * 1000) / RUSH_MS))

/** One rung of the ramp. Subtraction and division inherit as they always do. */
export interface Tier {
  add: Range
  mul: Range
}

/** Mirror of quiz.Tiers. Easiest first; the last rung is the classic default. */
export const TIERS: readonly Tier[] = [
  { add: [2, 20, 2, 20], mul: [2, 5, 2, 20] },
  { add: [2, 80, 2, 80], mul: [2, 8, 2, 75] },
  { add: [2, 100, 2, 100], mul: [2, 12, 2, 100] },
]

/** Mirror of quiz.TierAt — question counts per minute of the run. */
export const TIER_AT: readonly number[] = [2, 6, 12]

/**
 * The rung question `i` falls on. Mirror of quiz.TierOf.
 *
 * Integer arithmetic on both sides of the wire, spelled out rather than left
 * to a float, because the two generators have to agree exactly.
 */
export function tierOf(i: number, durSec: number): number {
  let n = 0
  for (const at of TIER_AT) {
    const s = Math.max(1, Math.floor((at * durSec + 30) / 60))
    if (i >= s) n++
  }
  return Math.min(n, TIERS.length - 1)
}

/**
 * The last question index the schedule can still move on. Everything past it
 * is on the top rung, so it is where the scan below stops.
 *
 * That scan inverts tierOf by walking it rather than by solving it. That is
 * deliberate: at a short duration two thresholds can round to the same
 * question and a rung is skipped outright — at the 10s minimum the run goes
 * from rung one to rung three on question one — and an inverted formula would
 * confidently report a rung that never appears.
 */
const lastStep = (durSec: number) =>
  Math.max(1, Math.floor((TIER_AT[TIER_AT.length - 1] * durSec + 30) / 60)) + 1

/** The question rung `k` starts at, or null if this run never lands on it. */
export function tierStart(k: number, durSec: number): number | null {
  if (k <= 0) return 0
  const end = lastStep(durSec)
  for (let i = 1; i <= end; i++) if (tierOf(i, durSec) === k) return i
  return null
}

export interface Config {
  mode: Mode
  ops: Op[]
  ranges: Record<Op, Range>
  durSec: number
}

/** The range `op` draws from for question `i` — the config's own in classic and
    in rush, the rung's in ramp. Mirror of quiz.Config.RangeFor. */
export function rangeFor(c: Config, op: Op, i: number): Range {
  if (c.mode !== 'ramp') return c.ranges[op]
  const t = TIERS[tierOf(i, c.durSec)]
  return op === 'add' || op === 'sub' ? t.add : t.mul
}

export const MAX_TERM = 9999
export const MIN_DUR = 10
export const MAX_DUR = 600
export const TIMES = [15, 30, 60, 120]

export function defaults(): Config {
  return {
    mode: 'classic',
    ops: ['add', 'sub', 'mul', 'div'],
    ranges: {
      add: [2, 100, 2, 100],
      sub: [2, 100, 2, 100],
      mul: [2, 12, 2, 100],
      div: [2, 12, 2, 100],
    },
    durSec: 120,
  }
}

const clampTerm = (v: number) =>
  !Number.isFinite(v) ? 0 : Math.min(MAX_TERM, Math.max(0, Math.trunc(v)))

export function normalize(c: Partial<Config> | null | undefined): Config {
  const def = defaults()
  const want = new Set(c?.ops ?? def.ops)
  const ops = OPS.filter((op) => want.has(op))

  const ranges = {} as Record<Op, Range>
  for (const op of FORWARD) {
    const r = c?.ranges?.[op] ?? def.ranges[op]
    const lo1 = clampTerm(r[0])
    let hi1 = clampTerm(r[1])
    const lo2 = clampTerm(r[2])
    let hi2 = clampTerm(r[3])
    if (hi1 < lo1) hi1 = lo1
    if (hi2 < lo2) hi2 = lo2
    ranges[op] = [lo1, hi1, lo2, hi2]
  }

  ranges.sub = [...ranges.add] as Range

  // The first multiplication operand becomes the divisor, and the one value it
  // cannot take is zero.
  const div = [...ranges.mul] as Range
  if (div[0] < 1) {
    div[0] = 1
    if (div[1] < div[0]) div[1] = div[0]
  }
  ranges.div = div

  const dur = Math.trunc(c?.durSec ?? def.durSec)
  const mode: Mode = c?.mode === 'ramp' || c?.mode === 'rush' ? c.mode : 'classic'
  return {
    mode,
    ops: ops.length ? ops : def.ops,
    ranges,
    durSec: Math.min(MAX_DUR, Math.max(MIN_DUR, Number.isFinite(dur) ? dur : def.durSec)),
  }
}

export function isDefault(c: Config): boolean {
  return sig(c) === sig(defaults())
}

/**
 * Mirror of quiz.Config.Sig — two configs that would produce the same run have
 * the same signature. Used here to tell a real settings change from a no-op.
 *
 * A ramp run leaves the ranges out because it never reads them: two ramp runs
 * would otherwise differ over numbers neither one would have used.
 */
export function sig(c: Config): string {
  return [
    `${c.mode}:${c.durSec}`,
    ...c.ops.map((op) => {
      if (c.mode === 'ramp') return op
      const r = c.ranges[op]
      return `${op}:${r[0]}-${r[1]},${r[2]}-${r[3]}`
    }),
  ].join('|')
}

export function fmtDur(sec: number): string {
  return sec % 60 === 0 && sec >= 60
    ? `${sec / 60}:00`
    : sec < 60
      ? `${sec}s`
      : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/** The one-line summary the bar and the lobby both show. */
export function summary(c: Config): string {
  const ops = OPS.filter((o) => c.ops.includes(o)).map((o) => GLYPH[o]).join(' ')
  return `${ops} · ${fmtDur(c.durSec)}${c.mode === 'classic' ? '' : ` · ${MODE_NAME[c.mode]}`}`
}

const KEY = 'zetajam.cfg'

export function load(): Config {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalize(JSON.parse(raw)) : defaults()
  } catch {
    return defaults()
  }
}

export function save(c: Config) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* private mode, quota — the settings just do not persist */
  }
}
