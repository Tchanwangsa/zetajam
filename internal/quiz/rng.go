package quiz

// xorshift32. Mirrored bit-for-bit in web/src/lib/rng.ts — if you touch one,
// touch the other, or clients and server will disagree about what the
// questions were.
type Rng struct{ s uint32 }

func New(seed uint32) *Rng {
	if seed == 0 {
		seed = 1 // a zero state is absorbing
	}
	return &Rng{s: seed}
}

func (r *Rng) next() uint32 {
	x := r.s
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	r.s = x
	return x
}

// intn returns a value in [0, n).
func (r *Rng) intn(n uint32) int { return int(r.next() % n) }

// mix32 is the murmur3 finalizer. It turns a counter into something that looks
// random, which is what lets us seed a fresh generator per question.
func mix32(h uint32) uint32 {
	h ^= h >> 16
	h *= 0x85ebca6b
	h ^= h >> 13
	h *= 0xc2b2ae35
	h ^= h >> 16
	return h
}
