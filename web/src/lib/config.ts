// Mirror of internal/quiz/config.go. The server normalizes what a client sends
// and echoes it back in the match frame; that copy is what the generator runs
// on. normalize() here is for the settings UI — so the bar shows the numbers
// the server would pick — not for gameplay.

export type Op = 'add' | 'sub' | 'mul' | 'div'

/** Canonical order. Part of the wire contract — see quiz.Ops. */
export const OPS: readonly Op[] = ['add', 'sub', 'mul', 'div']

/**
 * The two operations that own a range. Mirror of quiz.Forward. The other two
 * are these read backwards — `a + b` as `(a+b) − a` — which keeps every answer
 * a clean positive integer, and is why the panel offers two ranges not four.
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
 * Mirror of quiz.ModeClassic / ModeRamp / ModeRush. Classic draws from the
 * config's ranges; ramp ignores them for its own curve to RAMP_TOP; rush
 * stands one question in front of everybody, and the first correct answer wins.
 */
export type Mode = 'classic' | 'ramp' | 'rush'

export const MODES: readonly Mode[] = ['classic', 'ramp', 'rush']

export const MODE_NAME: Record<Mode, string> = {
  classic: 'classic',
  ramp: 'ramp',
  rush: 'rush',
}

/** Mirror of quiz.RushSec. One slot, one question, one point. RUSH_SEC is how
    long it stands only if nobody takes it. */
export const RUSH_SEC = 5
export const RUSH_MS = RUSH_SEC * 1000

/** Mirror of quiz.RushGapMs. The beat between a slot being taken and the next
    opening: long enough not to swap the equation out mid-keystroke, shorter
    than reading a name takes (the verdict line carries into the next slot).
    Must stay positive — it is the floor on a slot's length, and what makes the
    fold below terminate. */
export const RUSH_GAP_MS = 300

/**
 * The millisecond the slot after `open` begins. Mirror of quiz.RushNext. The
 * schedule is a fold over the run so far, not the clock: nothing drives the
 * turnover on the wire; every screen folds the same claims the same way.
 */
export function rushNext(open: number, ms: number, claimed: boolean): number {
  const end = open + RUSH_MS
  if (!claimed) return end
  return Math.min(end, Math.max(open, ms) + RUSH_GAP_MS)
}

/**
 * The fewest questions a rush run of this length gets through: what it holds
 * if every slot runs its full RUSH_SEC. A floor, not a count — every slot
 * taken early buys another. Mirror of quiz.RushSlots.
 */
export const rushSlots = (durSec: number) => Math.max(1, Math.ceil((durSec * 1000) / RUSH_MS))

export const MAX_TERM = 9999

/** One step of the ramp. Subtraction and division inherit as they always do. */
export interface Level {
  add: Range
  mul: Range
}

/**
 * Mirror of quiz.RampEvery / RampWide / RampTop. Through RAMP_WIDE the
 * ceilings rise; after it only the floors move, so the easy draws stop turning
 * up — a level-20 run dealing `4 + 7` out of 2–300 reads as an erratic curve.
 */
export const RAMP_EVERY = 2
export const RAMP_WIDE = 20
export const RAMP_TOP = 30

/** One edge of one operand range. Six of them are the whole ramp. Mirror of
    quiz.rampAddLo and friends. Addition grows on both terms at once — 40 + 40
    is 4 + 4 with carrying — but multiplication does not: the multiplier is what
    makes it hard, so that side crawls and never leaves the times tables. */
const RAMP_ADD_LO: Bound = [2, 200]
const RAMP_ADD_HI: Bound = [10, 300]
const RAMP_MUL_LO: Bound = [2, 6]
const RAMP_MUL_HI: Bound = [4, 15]
const RAMP_BY_LO: Bound = [2, 30]
const RAMP_BY_HI: Bound = [10, 150]

type Bound = [from: number, to: number]

/**
 * The level question `i` falls on — 1 for the first RAMP_EVERY questions, never
 * past RAMP_TOP. Mirror of quiz.RampLevelOf. A pure function of the index, not
 * the clock: question `i` is the same difficulty under any run length.
 */
export const rampLevelOf = (i: number) =>
  i < 1 ? 1 : Math.min(RAMP_TOP, 1 + Math.floor(i / RAMP_EVERY))

/**
 * The ranges at level `n`. Mirror of quiz.RampLevel. Each bound walks a straight
 * line from open to stop: ceilings over RAMP_WIDE levels, floors over the whole
 * RAMP_TOP. Integer arithmetic spelled out, since the generators must agree.
 */
export function rampLevel(n: number): Level {
  const lv = Math.min(RAMP_TOP, Math.max(1, Math.trunc(n)))
  const k = lv - 1 // steps taken since the opening level
  const c = Math.min(k, RAMP_WIDE - 1) // ceilings stop moving here
  const at = (b: Bound, step: number, span: number) =>
    span < 1 ? b[1] : b[0] + Math.floor(((b[1] - b[0]) * step) / span)
  const range = (aLo: Bound, aHi: Bound, bLo: Bound, bHi: Bound): Range => {
    const r: Range = [
      at(aLo, k, RAMP_TOP - 1),
      at(aHi, c, RAMP_WIDE - 1),
      at(bLo, k, RAMP_TOP - 1),
      at(bHi, c, RAMP_WIDE - 1),
    ]
    // Unreachable with the bounds above, but they are tuned by hand and a
    // floor past its own ceiling would reach the generator as an empty range.
    if (r[1] < r[0]) r[1] = r[0]
    if (r[3] < r[2]) r[3] = r[2]
    return r
  }
  return {
    add: range(RAMP_ADD_LO, RAMP_ADD_HI, RAMP_ADD_LO, RAMP_ADD_HI),
    mul: range(RAMP_MUL_LO, RAMP_MUL_HI, RAMP_BY_LO, RAMP_BY_HI),
  }
}

/** The question level `n` opens on. Inverse of rampLevelOf; the settings panel
    previews the ramp with it. */
export const rampStart = (n: number) => (Math.max(1, Math.trunc(n)) - 1) * RAMP_EVERY

export interface Config {
  mode: Mode
  ops: Op[]
  ranges: Record<Op, Range>
  durSec: number
}

/** The range `op` draws from for question `i`: the config's own in classic and
    rush, the level's in ramp. Mirror of quiz.Config.RangeFor. */
export function rangeFor(c: Config, op: Op, i: number): Range {
  if (c.mode !== 'ramp') return c.ranges[op]
  const l = rampLevel(rampLevelOf(i))
  return op === 'add' || op === 'sub' ? l.add : l.mul
}

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

  // The first multiplication operand becomes the divisor, which cannot be 0.
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
 * the same signature. Tells a real settings change from a no-op. Ramp leaves
 * the ranges out because it never reads them.
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
