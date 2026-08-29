// Prints the first N questions of a seed under a config so it can be diffed
// against the Go side. `make parity` runs both and fails the build if they
// disagree, under the default config and a custom one.
//
//   node parity.mjs <seed> <n> '{"ops":["mul"],"durSec":60}'
import { question } from '../src/lib/questions'
import { defaults, normalize, type Config } from '../src/lib/config'

const seed = Number(process.argv[2] ?? 123456789) >>> 0
const n = Number(process.argv[3] ?? 200)

// Merged the way Go's json.Unmarshal merges into a populated Config: a given
// key replaces its default, anything absent keeps it.
const patch = process.argv[4] ? JSON.parse(process.argv[4]) : {}
const base = defaults()
const cfg: Config = normalize({
  ...base,
  ...patch,
  ranges: { ...base.ranges, ...(patch.ranges ?? {}) },
})

for (let i = 0; i < n; i++) {
  const q = question(seed, i, cfg)
  console.log(`${i}\t${q.text}\t${q.answer}`)
}
