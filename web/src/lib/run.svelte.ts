import { defaults, rampLevelOf, rushNext, type Config } from './config'
import { question, type Question } from './questions'
import type { Claim, PlayerInfo } from './net'
import type { Sample } from './series'
import type { Step } from './steps'

/** Everything a run needs to be armed. */
export interface RunParams {
  seed: number
  cfg: Config
  durMs: number
  startsInMs: number
  /** Everyone in the run, in the order the graph indexes them. */
  players: PlayerInfo[]
  spectating: boolean
}

/**
 * What Client owns and the engine only reads. Thunks rather than values: the
 * rush schedule is a fold over the claims *so far*, and the hub mints a fresh
 * id on every reconnect — a copy taken at construction would go stale.
 */
export interface RunFeed {
  claims: () => Record<number, Claim>
  scores: () => Record<string, number>
  /** Your own answers so far, whoever recorded them. See lib/steps.ts. */
  steps: () => Step[]
  selfId: () => string
}

/** What one tick decided, for the caller to write to the DOM. Null means
    "leave it alone". */
export interface FrameResult {
  q: string | null
  /** The clock, every tick. The caller compares it against what it last wrote,
      so a tick that could not write one is not mistaken for one that did. */
  timer: string
  /** How much of the rush slot is left, 0..1. */
  bar: number | null
  /** The box should be emptied — rush turned the question over. */
  clear: boolean
  focus: boolean
  /** True on the single tick the clock ran out. */
  expired: boolean
}

/** What one keystroke decided. */
export interface SubmitResult {
  q: string | null
  bar: number | null
  focus: boolean
  /** Leave the box alone, replace it with `value`, or empty it. */
  input: 'keep' | 'set' | 'clear'
  value: string
  /** The answer to send on, when this keystroke was the right one. */
  answer: { i: number; v: number; ms: number } | null
  /** The answer to append to the log, or null. Always null in rush: there the
      point is the server's to give, and Client records it off the claim. */
  step: Step | null
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * A run in progress: the cursor through the question stream, the clock, and
 * what a tick or a keystroke means. Nothing here touches the DOM — it decides,
 * and the screen writes. Out of the component so it can be run without one.
 */
export class Run {
  score = $state(0)
  phase = $state<'count' | 'live' | 'done'>('count')

  /** The question index, for the ramp meter — how far into a level you are is
      half of what it shows. Its own state rather than making `#idx` reactive:
      `#idx` is read every frame, this is written once per answer. */
  rampAt = $state(0)

  /** The slot on screen. Driven from the schedule in the frame loop. */
  slot = $state(0)
  /** Whether you have already buzzed on this slot. One buzz each, win or lose. */
  buzzed = $state(false)
  /**
   * The slot the verdict line speaks for: the live one once settled, or the one
   * just gone, for a beat. -1 for neither — it outlives its slot because a taken
   * question turns over in RUSH_GAP_MS, too fast to read a name in.
   */
  said = $state(-1)

  samples = $state<Sample[]>([])

  // Set once by start(). Reactive because `live` below reads them, and the
  // first read happens on the render before start() is reached.
  #rush = $state(false)
  #spectating = $state(false)

  #seed = 0
  #cfg: Config = defaults()
  #durMs = 0
  #players: PlayerInfo[] = []

  // The hot path: read every frame, written on a keystroke, never reactive.
  #idx = 0
  #cur: Question = { text: '', answer: 0 }
  #t0 = 0 // the clock reading at which questions go live
  #slotOpen = 0 // rush: ms into the run at which the slot on screen opened
  #nextSampleAt = 0

  /** Assigned in the constructor, but declared without one: `live` below reads
      it, and a field initializer runs before the constructor body does. */
  readonly #feed!: RunFeed

  constructor(feed: RunFeed) {
    this.#feed = feed
  }

  /**
   * Your own score comes from your keyboard, not a round trip; the others come
   * in as `score` frames. A spectator has no keyboard, and in rush nobody's
   * keyboard is the authority — the point goes to whoever's frame landed first.
   */
  readonly live = $derived(
    this.#spectating || this.#rush
      ? this.#feed.scores()
      : { ...this.#feed.scores(), [this.#feed.selfId()]: this.score },
  )

  /** Arm a fresh run. `now` is the clock reading it is timed from. */
  start(p: RunParams, now: number) {
    this.#seed = p.seed
    this.#cfg = p.cfg
    this.#durMs = p.durMs
    this.#players = p.players
    this.#rush = p.cfg.mode === 'rush'
    this.#spectating = p.spectating

    this.#idx = 0
    this.#cur = question(p.seed, 0, p.cfg)
    this.#t0 = now + p.startsInMs
    this.#nextSampleAt = 1000
    this.#slotOpen = 0

    // `steps` is not cleared here: Client owns it and empties it on the `match`
    // frame, which in rush has already recorded claims by the time this runs.
    this.samples = [{ t: 0, s: p.players.map(() => 0) }]
    this.score = 0
    this.phase = 'count'
    this.rampAt = 0
    this.slot = 0
    this.buzzed = false
    this.said = -1
  }

  /** One tick of the run loop, at clock reading `now`. */
  frame(now: number): FrameResult {
    const ms = now - this.#t0
    const out: FrameResult = {
      q: null,
      timer: fmt(Math.min(this.#durMs, Math.max(0, this.#durMs - ms))),
      bar: null,
      clear: false,
      focus: false,
      expired: false,
    }

    if (ms < 0) {
      const n = Math.ceil(-ms / 1000)
      out.q = n > 0 ? String(n) : 'go'
    } else {
      if (this.phase === 'count') {
        this.phase = 'live'
        out.q = this.#cur.text
        if (!this.#spectating) out.focus = true
      }
      if (ms >= this.#durMs) {
        if (this.phase !== 'done') {
          this.phase = 'done'
          out.expired = true
        }
      } else {
        if (this.#rush) {
          const r = this.#rushFrame(ms)
          out.bar = r.bar
          if (r.turned) {
            out.q = this.#cur.text
            out.clear = true
            if (!this.#spectating) out.focus = true
          }
        }
        // One sample per second on a fixed clock, never on a network event.
        // Keeps the graph from dancing to somebody else's typing.
        while (this.#nextSampleAt <= ms) {
          const live = this.live
          this.samples = [
            ...this.samples,
            { t: this.#nextSampleAt / 1000, s: this.#players.map((p) => live[p.id] ?? 0) },
          ]
          this.#nextSampleAt += 1000
        }
      }
    }

    return out
  }

  /**
   * A keystroke in the answer box, `v` being its raw value. Nothing is scored
   * that the caller does not then apply: the returned answer is what to send.
   */
  submit(v: string, now: number): SubmitResult {
    const out: SubmitResult = {
      q: null,
      bar: null,
      focus: false,
      input: 'keep',
      value: v,
      answer: null,
      step: null,
    }
    if (this.phase !== 'live' || this.#spectating) return out
    if (!/^\d*$/.test(v)) {
      out.input = 'set'
      out.value = v.replace(/\D/g, '')
      return out
    }
    const at = Math.round(now - this.#t0)

    if (this.#rush) {
      // Walked again rather than trusted from the last frame: rAF stops in a
      // hidden tab and the match clock does not, so a backgrounded browser can
      // be showing a slot the server closed long ago. Catch up, and let the
      // next keystroke count.
      const r = this.#rushFrame(at)
      out.bar = r.bar
      if (r.turned) {
        out.q = this.#cur.text
        out.input = 'clear'
        out.focus = true
        return out
      }
      // A settled slot swallows what you type. The box is left enabled and
      // focused rather than disabled — it comes back in a second, and clicking
      // into it every question would be most of the mode.
      if (this.buzzed || this.#feed.claims()[this.#idx]) {
        out.input = 'clear'
        return out
      }
      if (v === '' || Number(v) !== this.#cur.answer) return out
      // No score added here: the point is the server's to give. The step is
      // recorded in client.svelte.ts when the claim comes back saying you won.
      this.buzzed = true
      out.answer = { i: this.#idx, v: this.#cur.answer, ms: at }
      out.input = 'clear'
      return out
    }

    if (v === '' || Number(v) !== this.#cur.answer) return out

    out.answer = { i: this.#idx, v: this.#cur.answer, ms: at }
    // Handed back rather than appended: the log is Client's, so that rush —
    // where the step is recorded off the claim — has one owner and not two.
    const log = this.#feed.steps()
    const prev = log.length ? Math.round(log[log.length - 1].t * 1000) : 0
    out.step = {
      i: this.#idx,
      t: at / 1000,
      ms: at - prev,
      text: this.#cur.text,
      answer: this.#cur.answer,
      level: this.#cfg.mode === 'ramp' ? rampLevelOf(this.#idx) : -1,
    }
    this.score++
    this.#idx++
    this.#cur = question(this.#seed, this.#idx, this.#cfg)
    out.q = this.#cur.text
    out.input = 'clear'
    if (this.#cfg.mode === 'ramp') this.rampAt = this.#idx
    return out
  }

  /**
   * One frame of a rush run: turn the question over when the slot ends, drain the
   * bar. Walked forward from the slot on screen — one step or none normally,
   * several in a backgrounded tab, where rAF stops and the match clock does not.
   */
  #rushFrame(ms: number): { turned: boolean; bar: number } {
    const claims = this.#feed.claims()
    let s = this.#idx
    let open = this.#slotOpen
    let end = rushNext(open, claims[s]?.ms ?? 0, !!claims[s])
    while (ms >= end) {
      s++
      open = end
      end = rushNext(open, claims[s]?.ms ?? 0, !!claims[s])
    }
    const turned = s !== this.#idx
    if (turned) {
      this.#idx = s
      this.#slotOpen = open
      this.#cur = question(this.#seed, s, this.#cfg)
      this.slot = s
      this.buzzed = false
    }
    const into = ms - open
    // A settled slot speaks for itself; an unsettled one hands the line to the
    // slot just gone. "Nobody got it" is held back 350ms — a buzz at 4.99s is
    // still in flight when the slot runs out on the clock.
    const v = claims[s] ? s : s > 0 && into < 1800 && (claims[s - 1] || into >= 350) ? s - 1 : -1
    if (v !== this.said) this.said = v
    // Against the end this slot actually has, so a claim snaps the bar down
    // rather than draining on past the turnover.
    return { turned, bar: Math.max(0, 1 - into / (end - open)) }
  }
}
