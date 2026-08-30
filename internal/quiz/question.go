package quiz

import "fmt"

type Question struct {
	Text   string
	Answer int
}

// At returns question i of the stream identified by (seed, cfg).
//
// It is a pure function of its arguments rather than a running generator,
// which buys two things: clients never have to be sent a question, and the
// server can check question i at the end of a match without replaying the ones
// before it.
//
// The draw order — operation, then first operand, then second — is fixed, and
// every operand comes off exactly one call to intn. That is what lets the
// TypeScript mirror in web/src/lib/questions.ts stay bit-for-bit identical
// under any config, not just the default one.
//
// Subtraction and division are generated as the inverse of an addition and a
// multiplication, so the answer is always a clean positive integer.
//
// Which range the operands come off is the one thing that is not fixed: in a
// ramp run it is the level index i falls on rather than the config's own. The
// draw itself is untouched by that, so a ramp stream and a classic stream from
// the same seed take the same number of intn calls per question.
func At(seed uint32, i int, c Config) Question {
	if len(c.Ops) == 0 || c.Ranges == nil {
		c = Default()
	}
	r := New(mix32(seed ^ mix32(uint32(i)+1)))

	op := c.Ops[r.intn(uint32(len(c.Ops)))]
	rg := c.RangeFor(op, i)
	a := rg[0] + r.intn(uint32(rg[1]-rg[0]+1))
	b := rg[2] + r.intn(uint32(rg[3]-rg[2]+1))

	switch op {
	case "add":
		return Question{fmt.Sprintf("%d + %d", a, b), a + b}
	case "sub":
		return Question{fmt.Sprintf("%d − %d", a+b, a), b}
	case "mul":
		return Question{fmt.Sprintf("%d × %d", a, b), a * b}
	default:
		return Question{fmt.Sprintf("%d ÷ %d", a*b, a), b}
	}
}
