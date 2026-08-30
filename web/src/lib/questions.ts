import { Rng, mix32 } from './rng'
import { defaults, rangeFor, type Config } from './config'

export interface Question {
  text: string
  answer: number
}

/**
 * Question `i` of the stream (`seed`, `cfg`). Mirror of quiz/question.go: pure
 * in its arguments, so the server sends a seed once, never a question, and can
 * still check any answer. One intn call per operand, or the generators diverge.
 */
export function question(seed: number, i: number, cfg: Config = defaults()): Question {
  const r = new Rng(mix32((seed ^ mix32((i + 1) >>> 0)) >>> 0))

  const op = cfg.ops[r.intn(cfg.ops.length)]
  const [lo1, hi1, lo2, hi2] = rangeFor(cfg, op, i)
  const a = lo1 + r.intn(hi1 - lo1 + 1)
  const b = lo2 + r.intn(hi2 - lo2 + 1)

  switch (op) {
    case 'add':
      return { text: `${a} + ${b}`, answer: a + b }
    case 'sub':
      return { text: `${a + b} − ${a}`, answer: b }
    case 'mul':
      return { text: `${a} × ${b}`, answer: a * b }
    default:
      return { text: `${a * b} ÷ ${a}`, answer: b }
  }
}
