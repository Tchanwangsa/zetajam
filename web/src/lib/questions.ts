import { Rng, mix32 } from './rng'
import { defaults, rangeFor, type Config } from './config'

export interface Question {
  text: string
  answer: number
}

/**
 * Question `i` of the stream identified by (`seed`, `cfg`).
 *
 * Mirror of internal/quiz/question.go. Because it is a pure function of its
 * arguments, the server sends a seed and a config once at match start and then
 * never has to send a question — and it can still check any answer it receives.
 *
 * The draw order — operation, then first operand, then second — is fixed, and
 * each operand costs exactly one intn call. That is what keeps the two
 * generators identical under any config rather than only the default one.
 *
 * Subtraction and division are built as the inverse of an addition and a
 * multiplication, so answers are always clean positive integers.
 *
 * Which range the operands come off is the one thing that is not fixed: a ramp
 * run reads the rung `i` falls on rather than the config's own ranges. The draw
 * itself is untouched by that, so both modes cost the same intn calls.
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
