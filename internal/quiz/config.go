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
// the config. Ramp ignores them and walks its own curve instead, opening easier
// than anything the bar offers and climbing a step every RampEvery questions
// until it tops out at RampTop. Rush draws from the config's ranges exactly
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
// mid-keystroke. This is the whole of the pause, and it is deliberately
// shorter than the eye needs to read a name, because the verdict line under
// the bar carries into the next slot rather than going with this one.
//
// Must stay positive: it is the floor on how long a slot can last, and the
// fold below is what stops a run being an unbounded number of them.
const RushGapMs = 300

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

// A Level is one step of the ramp: the ranges addition and multiplication draw
// from while the run is on that step. Subtraction and division read them
// backwards exactly as they do in classic, so the answer stays a clean
// positive integer at every difficulty.
type Level struct {
	Add Range
	Mul Range
}

// The ramp climbs in two acts, and every number in it is a level rather than a
// question so that the meter can say where you are.
//
// Through RampWide the ceilings rise and the numbers simply get bigger. From
// there to RampTop the ceilings hold and only the floors are still moving, so
// nothing new gets harder — the easy draws just stop turning up. That second
// act is what keeps the top of the ramp from running away: the last third of
// the climb tightens the band instead of raising it, which is a real increase
// in difficulty that costs nothing in headroom.
//
// The floors matter as much as the ceilings and are the reason for the split.
// A floor pinned at 2 means a level-20 run still deals `4 + 7` out of a 2–300
// range often enough to notice, and that reads as the generator being erratic
// rather than as a curve. Floors therefore climb too — on the longer of the
// two timelines, so the band widens through the first act before the second
// act closes it up again.
const (
	RampEvery = 2  // questions per level
	RampWide  = 20 // the level the ceilings stop rising at
	RampTop   = 30 // the last level there is
)

// A rampBound is one edge of one operand range: where it opens and where it
// stops. Six of them are the whole ramp.
type rampBound struct{ from, to int }

// Addition grows on both terms at once, because 40 + 40 is the same kind of
// problem as 4 + 4 with more carrying in it. Multiplication does not: the
// multiplier is what makes it hard, so that side crawls — 4 up to 15, never
// past the times tables — while the number it multiplies climbs at addition's
// rate. That is what keeps the top of the ramp a times-table being stretched
// rather than long multiplication.
var (
	rampAddLo = rampBound{2, 200} // both addition terms, low
	rampAddHi = rampBound{10, 300}
	rampMulLo = rampBound{2, 6} // the multiplier, and the divisor it becomes
	rampMulHi = rampBound{4, 15}
	rampByLo  = rampBound{2, 30} // what the multiplier multiplies
	rampByHi  = rampBound{10, 150}
)

// RampLevelOf is the level question i falls on — 1 for the first RampEvery
// questions of a run, and never past RampTop.
//
// A pure function of the index alone, because the question stream has to be
// one: the server checks answer i without replaying the questions before it,
// and every client generates the same stream from the seed alone. Nothing here
// may depend on how the run is actually going — or on how long it is. The ramp
// used to scale its steps to the run length so a 15s sprint saw the whole of
// it; it no longer does, so question i sits at the same difficulty under any
// clock and a short run simply sees the bottom of the ramp.
func RampLevelOf(i int) int {
	if i < 1 {
		return 1
	}
	if n := 1 + i/RampEvery; n < RampTop {
		return n
	}
	return RampTop
}

// RampLevel is the ranges at level n.
//
// Each bound walks a straight line from where it opens to where it stops: the
// ceilings over RampWide levels, the floors over the whole RampTop. Integer
// arithmetic on both sides of the wire — see the TypeScript mirror in
// web/src/lib/config.ts — so the division has to be spelled out rather than
// left to a float.
func RampLevel(n int) Level {
	if n < 1 {
		n = 1
	}
	if n > RampTop {
		n = RampTop
	}
	k := n - 1 // steps taken since the opening level
	c := k
	if c > RampWide-1 {
		c = RampWide - 1
	}
	lo, hi := RampTop-1, RampWide-1
	return Level{
		Add: rampRange(rampAddLo, rampAddHi, rampAddLo, rampAddHi, k, c, lo, hi),
		Mul: rampRange(rampMulLo, rampMulHi, rampByLo, rampByHi, k, c, lo, hi),
	}
}

// rampRange is the four bounds of one operation at a given point on the two
// timelines: floors at k of lo steps, ceilings at c of hi steps.
func rampRange(aLo, aHi, bLo, bHi rampBound, k, c, lo, hi int) Range {
	r := Range{
		rampAt(aLo, k, lo), rampAt(aHi, c, hi),
		rampAt(bLo, k, lo), rampAt(bHi, c, hi),
	}
	// Every bound above is set so that this cannot fire. It is here because
	// the six of them are meant to be tuned by hand, and a floor tuned past
	// its own ceiling would otherwise reach the generator as an empty range.
	if r[1] < r[0] {
		r[1] = r[0]
	}
	if r[3] < r[2] {
		r[3] = r[2]
	}
	return r
}

// rampAt is bound b, k steps of span into its climb.
func rampAt(b rampBound, k, span int) int {
	if span < 1 {
		return b.to
	}
	return b.from + ((b.to-b.from)*k)/span
}

// RangeFor is the range operation op draws from for question i — the config's
// own in classic and in rush, the level's in ramp.
func (c Config) RangeFor(op string, i int) Range {
	if c.Mode != ModeRamp {
		return c.Ranges[op]
	}
	l := RampLevel(RampLevelOf(i))
	if op == "add" || op == "sub" {
		return l.Add
	}
	return l.Mul
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
