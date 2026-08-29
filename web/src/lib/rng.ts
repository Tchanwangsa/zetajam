// xorshift32 + the murmur3 finalizer.
//
// This file is a bit-for-bit mirror of server/rng.go. `npm run parity` checks
// that claim; if you change one file, change the other.

export function mix32(h: number): number {
  h = (h ^ (h >>> 16)) >>> 0
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h
}

export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0 || 1 // a zero state is absorbing
  }

  next(): number {
    let x = this.s
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    this.s = x
    return x
  }

  /** Returns a value in [0, n). */
  intn(n: number): number {
    return this.next() % n
  }
}
