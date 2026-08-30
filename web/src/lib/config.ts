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
 * config. Ramp ignores them and walks its own curve instead, opening easier than
 * anything the bar offers and climbing until it tops out at RAMP_TOP. Rush draws
 * from the config's ranges exactly as classic does and changes the rules rather
 * than the numbers: one question stands in front of everybody at once for up to
 * RUSH_SEC, and the first correct answer to reach the server takes the only
 * point it is worth — and ends the question there and then, for everybody.
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

export const MAX_TERM = 9999

/** One step of the ramp. Subtraction and division inherit as they always do. */
export interface Level {
  add: Range
  mul: Range
}

/**
 * The ramp climbs in two acts. Mirror of quiz.RampEvery / RampWide / RampTop.
 *
 * Through RAMP_WIDE the ceilings rise and the numbers simply get bigger. From
 * there to RAMP_TOP the ceilings hold and only the floors are still moving, so
 * nothing new gets harder — the easy draws just stop turning up. That second
 * act is what keeps the top of the ramp from running away: it tightens the
 * band instead of raising it, which is a real increase in difficulty that
 * costs nothing in headroom.
 *
 * The floors are the reason for the split. Pinned at 2, a level-20 run still
 * deals `4 + 7` out of a 2–300 range often enough to notice, and that reads as
 * the generator being erratic rather than as a curve. So floors climb too — on
 * the longer of the two timelines, so the band widens through the first act
 * before the second act closes it up.
 */
export const RAMP_EVERY = 2
export const RAMP_WIDE = 20
export const RAMP_TOP = 30

/** One edge of one operand range: where it opens and where it stops. Six of
    them are the whole ramp. Mirror of quiz.rampAddLo and friends.

    Addition grows on both terms at once — 40 + 40 is the same kind of problem
    as 4 + 4 with more carrying in it. Multiplication does not: the multiplier
    is what makes it hard, so that side crawls, never past the times tables,
    while the number it multiplies climbs at addition's rate. */
const RAMP_ADD_LO: Bound = [2, 200]
const RAMP_ADD_HI: Bound = [10, 300]
const RAMP_MUL_LO: Bound = [2, 6]
const RAMP_MUL_HI: Bound = [4, 15]
const RAMP_BY_LO: Bound = [2, 30]
const RAMP_BY_HI: Bound = [10, 150]

type Bound = [from: number, to: number]

/**
 * The level question `i` falls on — 1 for the first RAMP_EVERY questions of a
 * run, and never past RAMP_TOP. Mirror of quiz.RampLevelOf.
 *
 * A pure function of the index alone — not of the clock. The ramp used to
 * scale its steps to the run length so a short sprint still saw the whole of
 * it; it no longer does, so question `i` is the same difficulty under any
 * length and a short run simply sees the bottom of the ramp.
 */
export const rampLevelOf = (i: number) =>
  i < 1 ? 1 : Math.min(RAMP_TOP, 1 + Math.floor(i / RAMP_EVERY))

/**
 * The ranges at level `n`. Mirror of quiz.RampLevel.
 *
 * Each bound walks a straight line from where it opens to where it stops: the
 * ceilings over RAMP_WIDE levels, the floors over the whole RAMP_TOP. Integer
 * arithmetic on both sides of the wire, spelled out rather than left to a
 * float, because the two generators have to agree exactly.
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
    // Unreachable with the bounds above; here because they are meant to be
    // tuned by hand, and a floor tuned past its own ceiling would otherwise
    // reach the generator as an empty range.
    if (r[1] < r[0]) r[1] = r[0]
    if (r[3] < r[2]) r[3] = r[2]
    return r
  }
  return {
    add: range(RAMP_ADD_LO, RAMP_ADD_HI, RAMP_ADD_LO, RAMP_ADD_HI),
    mul: range(RAMP_MUL_LO, RAMP_MUL_HI, RAMP_BY_LO, RAMP_BY_HI),
  }
}

/** The question level `n` opens on — the inverse of rampLevelOf, and what the
    settings panel previews the ramp with. */
export const rampStart = (n: number) => (Math.max(1, Math.trunc(n)) - 1) * RAMP_EVERY

export interface Config {
  mode: Mode
  ops: Op[]
  ranges: Record<Op, Range>
  durSec: number
}

/** The range `op` draws from for question `i` — the config's own in classic and
    in rush, the level's in ramp. Mirror of quiz.Config.RangeFor. */
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
