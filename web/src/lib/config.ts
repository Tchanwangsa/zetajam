// Mirror of internal/quiz/config.go.
//
// The server normalizes whatever a client sends and echoes the result back in
// the match frame, and that echoed copy is the one the generator runs on. The
// normalize() here is for the settings UI — so the panel shows you the same
// numbers the server would have picked — not for gameplay.

export type Op = 'add' | 'sub' | 'mul' | 'div'

/** Canonical order. Part of the wire contract — see quiz.Ops. */
export const OPS: readonly Op[] = ['add', 'sub', 'mul', 'div']

export const GLYPH: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' }
export const OP_NAME: Record<Op, string> = {
  add: 'addition',
  sub: 'subtraction',
  mul: 'multiplication',
  div: 'division',
}

/** [lo1, hi1, lo2, hi2] — inclusive bounds for the two operands. */
export type Range = [number, number, number, number]

export interface Config {
  ops: Op[]
  ranges: Record<Op, Range>
  durSec: number
}

export const MAX_TERM = 9999
export const MIN_DUR = 10
export const MAX_DUR = 600
export const TIMES = [30, 60, 120, 300]

export function defaults(): Config {
  return {
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
  for (const op of OPS) {
    const r = c?.ranges?.[op] ?? def.ranges[op]
    let lo1 = clampTerm(r[0])
    let hi1 = clampTerm(r[1])
    const lo2 = clampTerm(r[2])
    let hi2 = clampTerm(r[3])
    if (op === 'div' && lo1 < 1) lo1 = 1 // this operand becomes the divisor
    if (hi1 < lo1) hi1 = lo1
    if (hi2 < lo2) hi2 = lo2
    ranges[op] = [lo1, hi1, lo2, hi2]
  }

  const dur = Math.trunc(c?.durSec ?? def.durSec)
  return {
    ops: ops.length ? ops : def.ops,
    ranges,
    durSec: Math.min(MAX_DUR, Math.max(MIN_DUR, Number.isFinite(dur) ? dur : def.durSec)),
  }
}

export function isDefault(c: Config): boolean {
  return sig(c) === sig(defaults())
}

/** Mirror of quiz.Config.Sig — two players only match on an equal signature. */
export function sig(c: Config): string {
  return [
    String(c.durSec),
    ...c.ops.map((op) => {
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
