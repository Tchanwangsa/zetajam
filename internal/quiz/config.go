package quiz

import (
	"fmt"
	"strconv"
	"strings"
)

// Ops is the canonical order the generator picks an operation from. The order
// is part of the wire contract: both sides of a match walk this list with the
// same random draw, so reordering it would change every question stream.
var Ops = [4]string{"add", "sub", "mul", "div"}

// A Range is [lo1, hi1, lo2, hi2] — inclusive bounds for the two operands the
// generator draws for one operation.
type Range [4]int

// Config is the whole of what a player can configure: which operations appear,
// how big their terms get, and how long the run lasts.
//
// It travels with a join, is normalized once by the server, and is then sent
// back down in the match frame. Clients use the copy the server sent rather
// than their own, so both sides of a match are provably generating the same
// questions from the same seed.
type Config struct {
	Ops    []string         `json:"ops"`
	Ranges map[string]Range `json:"ranges"`
	DurSec int              `json:"durSec"`
}

const (
	maxTerm   = 9999
	minDurSec = 10
	maxDurSec = 600
)

// Default is the classic setup: all four operations, two-digit terms, a small
// multiplier, two minutes.
func Default() Config {
	return Config{
		Ops: []string{"add", "sub", "mul", "div"},
		Ranges: map[string]Range{
			"add": {2, 100, 2, 100},
			"sub": {2, 100, 2, 100},
			"mul": {2, 12, 2, 100},
			"div": {2, 12, 2, 100},
		},
		DurSec: 120,
	}
}

// Normalize clamps a client-supplied config into something the generator can
// safely run: canonical operation order, non-empty, non-inverted ranges, and
// no zero divisor. Every config reaches At through here.
func (c Config) Normalize() Config {
	def := Default()
	out := Config{Ranges: map[string]Range{}, DurSec: c.DurSec}

	on := map[string]bool{}
	for _, op := range c.Ops {
		on[op] = true
	}
	for _, op := range Ops {
		if on[op] {
			out.Ops = append(out.Ops, op)
		}
	}
	if len(out.Ops) == 0 {
		out.Ops = def.Ops
	}

	for _, op := range Ops {
		r, ok := c.Ranges[op]
		if !ok {
			r = def.Ranges[op]
		}
		lo1, hi1 := clampTerm(r[0]), clampTerm(r[1])
		lo2, hi2 := clampTerm(r[2]), clampTerm(r[3])
		if op == "div" && lo1 < 1 {
			lo1 = 1 // this operand becomes the divisor
		}
		if hi1 < lo1 {
			hi1 = lo1
		}
		if hi2 < lo2 {
			hi2 = lo2
		}
		out.Ranges[op] = Range{lo1, hi1, lo2, hi2}
	}

	if out.DurSec < minDurSec {
		out.DurSec = minDurSec
	}
	if out.DurSec > maxDurSec {
		out.DurSec = maxDurSec
	}
	return out
}

func clampTerm(v int) int {
	if v < 0 {
		return 0
	}
	if v > maxTerm {
		return maxTerm
	}
	return v
}

// Sig identifies a config for matchmaking. Two players only get paired when
// their signatures match, so nobody is dropped into a run with operations or a
// clock they did not ask for. Disabled operations are left out, so their
// ranges cannot keep two otherwise-identical setups apart.
func (c Config) Sig() string {
	var b strings.Builder
	b.WriteString(strconv.Itoa(c.DurSec))
	for _, op := range c.Ops {
		r := c.Ranges[op]
		fmt.Fprintf(&b, "|%s:%d-%d,%d-%d", op, r[0], r[1], r[2], r[3])
	}
	return b.String()
}
