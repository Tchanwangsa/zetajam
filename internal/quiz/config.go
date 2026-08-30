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

// Forward are the only two operations that carry ranges of their own.
// Subtraction is an addition read backwards and division a multiplication read
// backwards, so they inherit — see Normalize.
var Forward = [2]string{"add", "mul"}

// A Range is [lo1, hi1, lo2, hi2] — inclusive bounds for the two operands the
// generator draws for one operation.
type Range [4]int

// The three shapes a run can take.
//
// Classic draws every question from one fixed pair of ranges — the ranges in
// the config. Ramp ignores them and walks Tiers instead, so the run opens easy
// and ends on the classic defaults. Rush draws from the config's ranges exactly
// as classic does and changes the *rules* rather than the numbers: one question
// stands in front of everybody at once, for up to RushSec, and the first
// correct answer to reach the server takes the only point it is worth — and
// ends the question there and then, for everybody.
const (
	ModeClassic = "classic"
	ModeRamp    = "ramp"
	ModeRush    = "rush"
)

// RushSec is how long one question stands in a rush run when nobody gets it.
// Everything about the mode falls out of it: a slot is a question, its index in
// the stream is the slot number, and an untouched run is DurSec/RushSec of them.
const RushSec = 5

// RushMs is RushSec on the match clock, which is where every comparison here
// actually happens.
const RushMs = RushSec * 1000

// RushGapMs is the beat between a slot being taken and the next one opening.
// A slot no longer runs its five seconds out once somebody has it — the point
// is gone, so the wait is dead time — but the turnover is not instant either:
// the winner's own screen would swap the equation out from under their fingers
// mid-keystroke, and nobody would ever see who took it. This is the whole of
// the pause. Shorten it to zero if you want the question to change on the
// claim itself; the verdict line under the bar survives into the next slot
// either way.
const RushGapMs = 500

// RushNext is the millisecond at which the slot after the one that opened at
// `open` begins.
//
// A rush schedule is no longer a pure function of the clock — it is this fold
// over the run so far: slot 0 opens at 0, and each slot after it opens either
// RushGapMs after the claim that settled its predecessor or RushMs after that
// predecessor opened, whichever comes first. `claimed` is false for a slot
// nobody took, and then only the second term applies.
//
// Every screen in the room can run the same fold, because a claim frame
// carries both the slot and the millisecond it landed on. The server runs it
// too — see Match.rushOpen — so a buzz is judged against the same window the
// player was looking at.
//
// `ms` is the claiming client's own timestamp and so is clamped into the slot
// it settles: the wire tolerates a little clock skew either side of a
// boundary, but the schedule everyone else inherits must not.
//
// Mirrored in web/src/lib/config.ts.
func RushNext(open, ms int64, claimed bool) int64 {
	end := open + RushMs
	if !claimed {
		return end
	}
	if ms < open {
		ms = open
	}
	if n := ms + RushGapMs; n < end {
		return n
	}
	return end
}

// RushSlots is the fewest questions a rush run of this length gets through —
// what it holds if every one of them runs its full RushSec out. Any slot
// somebody takes early buys the run another one, so this is a floor and not a
// count. The last one is short when RushSec does not divide the run; the clock
// ends it early rather than the schedule stretching to fit.
func RushSlots(durSec int) int {
	n := (durSec*1000 + RushMs - 1) / RushMs
	if n < 1 {
		n = 1
	}
	return n
}

// A Tier is one rung of the ramp: the ranges addition and multiplication draw
// from while the run is on that rung. Subtraction and division read them
// backwards exactly as they do in classic, so the answer stays a clean
// positive integer at every difficulty.
type Tier struct {
	Add Range
	Mul Range
}

// Tiers is the ramp, easiest first. The last rung is deliberately the classic
// default: ramp is a way into the standard run, not past it.
var Tiers = [...]Tier{
	{Add: Range{2, 20, 2, 20}, Mul: Range{2, 5, 2, 20}},
	{Add: Range{2, 80, 2, 80}, Mul: Range{2, 8, 2, 75}},
	{Add: Range{2, 100, 2, 100}, Mul: Range{2, 12, 2, 100}},
}

// TierAt are the question counts at which the ramp steps up, expressed per
// minute of the run so a 15s sprint ramps in the same shape as a 5-minute
// grind rather than sitting on rung one the whole way.
//
// One entry per step offered. There are three here and three rungs, so the
// last one only starts doing anything if a fourth rung is ever added.
var TierAt = [...]int{2, 6, 12}

// TierOf is the rung question i falls on.
//
// A pure function of the index and the clock, because the question stream has
// to be one: the server checks answer i without replaying the questions before
// it, and every client generates the same stream from the seed alone. Nothing
// here may depend on how the run is actually going.
//
// The arithmetic is integer on both sides of the wire — see the TypeScript
// mirror in web/src/lib/config.ts — so the rounding has to be spelled out
// rather than left to a float.
func TierOf(i, durSec int) int {
	n := 0
	for _, at := range TierAt {
		s := (at*durSec + 30) / 60 // per-minute count, scaled to the run, rounded
		if s < 1 {
			s = 1
		}
		if i >= s {
			n++
		}
	}
	if n > len(Tiers)-1 {
		n = len(Tiers) - 1
	}
	return n
}

// RangeFor is the range operation op draws from for question i — the config's
// own in classic and in rush, the rung's in ramp.
func (c Config) RangeFor(op string, i int) Range {
	if c.Mode != ModeRamp {
		return c.Ranges[op]
	}
	t := Tiers[TierOf(i, c.DurSec)]
	if op == "add" || op == "sub" {
		return t.Add
	}
	return t.Mul
}

// Config is the whole of what a player can configure: which operations appear,
// how big their terms get, and how long the run lasts.
//
// It travels with a join, is normalized once by the server, and is then sent
// back down in the match frame. Clients use the copy the server sent rather
// than their own, so both sides of a match are provably generating the same
// questions from the same seed.
type Config struct {
	// Classic, ramp or rush. Empty means classic — an older client that has
	// never heard of the field still gets the run it expects.
	Mode   string           `json:"mode,omitempty"`
	Ops    []string         `json:"ops"`
	Ranges map[string]Range `json:"ranges"`
	DurSec int              `json:"durSec"`
}

const (
	maxTerm   = 9999
	MinDurSec = 10
	MaxDurSec = 600
)

// Default is the classic setup: all four operations, two-digit terms, a small
// multiplier, two minutes.
func Default() Config {
	return Config{
		Mode: ModeClassic,
		Ops:  []string{"add", "sub", "mul", "div"},
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
//
// It also makes the inverse pairs literally inverse. The settings panel offers
// two ranges, not four — "subtraction: addition problems in reverse" — and a
// client is not the right place to enforce that, because a hand-rolled one
// could send four independent ranges and end up generating a stream nobody
// agreed to. So sub takes add's range and div takes mul's, here, once.
func (c Config) Normalize() Config {
	def := Default()
	out := Config{Mode: ModeClassic, Ranges: map[string]Range{}, DurSec: c.DurSec}
	switch c.Mode {
	case ModeRamp, ModeRush:
		out.Mode = c.Mode
	}

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

	for _, op := range Forward {
		r, ok := c.Ranges[op]
		if !ok {
			r = def.Ranges[op]
		}
		lo1, hi1 := clampTerm(r[0]), clampTerm(r[1])
		lo2, hi2 := clampTerm(r[2]), clampTerm(r[3])
		if hi1 < lo1 {
			hi1 = lo1
		}
		if hi2 < lo2 {
			hi2 = lo2
		}
		out.Ranges[op] = Range{lo1, hi1, lo2, hi2}
	}

	out.Ranges["sub"] = out.Ranges["add"]

	// The first multiplication operand becomes the divisor, and the one value
	// it cannot take is zero.
	div := out.Ranges["mul"]
	if div[0] < 1 {
		div[0] = 1
		if div[1] < div[0] {
			div[1] = div[0]
		}
	}
	out.Ranges["div"] = div

	if out.DurSec < MinDurSec {
		out.DurSec = MinDurSec
	}
	if out.DurSec > MaxDurSec {
		out.DurSec = MaxDurSec
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

// Sig identifies a config by what a run under it would actually be. It decides
// whether a score counts toward the day's best, and on the client whether a
// settings change is worth restarting a run for.
//
// Disabled operations are left out, so their ranges cannot keep two
// otherwise-identical setups apart. A ramp run leaves the ranges out for the
// same reason: it never reads them, so two ramp runs would otherwise differ
// over numbers neither one would have used.
func (c Config) Sig() string {
	var b strings.Builder
	b.WriteString(c.Mode)
	b.WriteByte(':')
	b.WriteString(strconv.Itoa(c.DurSec))
	for _, op := range c.Ops {
		if c.Mode == ModeRamp {
			fmt.Fprintf(&b, "|%s", op)
			continue
		}
		r := c.Ranges[op]
		fmt.Fprintf(&b, "|%s:%d-%d,%d-%d", op, r[0], r[1], r[2], r[3])
	}
	return b.String()
}
