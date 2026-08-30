<script lang="ts">
  import { question, type Question } from '../lib/questions'
  import { rushNext, tierOf, type Config } from '../lib/config'
  import type { Sample } from '../lib/series'
  import type { Step } from '../lib/steps'
  import type { Claim, PlayerInfo } from '../lib/net'
  import { seats as buildSeats } from '../lib/players'
  import Graph from './Graph.svelte'
  import Scoreboard from './Scoreboard.svelte'
  import TierMeter from './TierMeter.svelte'

  let {
    seed,
    cfg,
    durMs,
    startsInMs,
    players = [],
    selfId,
    scores = {},
    spectating = false,
    claims = {},
    samples = $bindable([] as Sample[]),
    steps = $bindable([] as Step[]),
    onAnswer,
    onExpire,
  }: {
    seed: number
    cfg: Config
    durMs: number
    startsInMs: number
    /** Everyone in the run, in the order the graph indexes them. */
    players?: PlayerInfo[]
    selfId: string
    /** Scores as the server last reported them, by player id. */
    scores?: Record<string, number>
    spectating?: boolean
    /** Rush only: who took each slot, as the server settled it. */
    claims?: Record<number, Claim>
    samples?: Sample[]
    /** Your own answers, in order. Empty while spectating — see lib/steps.ts. */
    steps?: Step[]
    onAnswer: (i: number, v: number, ms: number) => void
    onExpire: () => void
  } = $props()

  let qEl = $state<HTMLDivElement>()
  let inputEl = $state<HTMLInputElement>()
  let timerEl = $state<HTMLSpanElement>()

  let score = $state(0)
  let phase = $state<'count' | 'live' | 'done'>('count')

  // The rung the next question comes off. Plain state rather than one of the
  // hand-written nodes below, because it changes twice in a whole run — the
  // hot path is for things that move on a keystroke.
  let tier = $state(0)
  const ramp = $derived(cfg.mode === 'ramp' && !spectating)

  // --- rush ----------------------------------------------------------------
  //
  // Everything below moves once a question at most, so unlike the equation and
  // the input it is allowed to be ordinary reactive state.
  const rush = $derived(cfg.mode === 'rush')
  /** The slot on screen. Driven from the schedule in the frame loop below. */
  let slot = $state(0)
  /** Whether you have already buzzed on this slot. One buzz each, win or lose. */
  let buzzed = $state(false)
  /**
   * The slot the line under the bar is speaking for: the live one once it is
   * settled, or the one just gone for a beat after it ends. -1 for neither.
   *
   * It outlives its slot on purpose. A taken question now turns over in
   * RUSH_GAP_MS, which is not long enough to read a name in, so the verdict
   * carries into the top of the next one rather than going with it.
   */
  let said = $state(-1)
  let barEl = $state<HTMLElement>()

  const claim = $derived(rush ? claims[slot] : undefined)
  const saidBy = $derived(rush && said >= 0 ? claims[said] : undefined)
  const saidMine = $derived(!!saidBy && saidBy.id === selfId)
  const saidName = $derived(players.find((p) => p.id === saidBy?.id)?.name ?? 'somebody')
  // Once the slot is settled — or you have spent your buzz on it — there is
  // nothing left to type until the next one comes round.
  const locked = $derived(rush && (buzzed || !!claim))

  // Your own score comes from your own keyboard, not from a round trip. The
  // others come in as `score` frames. A spectator has no keyboard in this run,
  // so every number is somebody else's — and in rush nobody's own keyboard is
  // the authority, because the point goes to whoever's frame landed first.
  const live = $derived(spectating || rush ? scores : { ...scores, [selfId]: score })
  const seatList = $derived(buildSeats(players, live, spectating ? '' : selfId))

  // The hot path deliberately writes to these nodes by hand. Everything that
  // changes on a keystroke — the equation and the input — is one textContent
  // or .value assignment, with no reactive graph in between.
  let idx = 0
  let cur: Question
  let t0 = 0 // performance.now() at which questions go live
  let slotOpen = 0 // rush: ms into the run at which the slot on screen opened
  let nextSampleAt = 0
  let lastTimerText = ''
  let lastAt = 0 // ms into the run at which the previous answer landed

  function fmt(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  $effect(() => {
    idx = 0
    cur = question(seed, 0, cfg)
    t0 = performance.now() + startsInMs
    nextSampleAt = 1000
    lastAt = 0
    samples = [{ t: 0, s: players.map(() => 0) }]
    steps = []
    tier = 0
    slot = 0
    slotOpen = 0
    buzzed = false
    said = -1

    let raf = requestAnimationFrame(function frame(now) {
      const ms = now - t0

      if (ms < 0) {
        const n = Math.ceil(-ms / 1000)
        setQ(n > 0 ? String(n) : 'go')
      } else {
        if (phase === 'count') {
          phase = 'live'
          setQ(cur.text)
          if (!spectating) inputEl?.focus()
        }
        if (ms >= durMs) {
          if (phase !== 'done') {
            phase = 'done'
            onExpire()
          }
        } else {
          if (cfg.mode === 'rush') rushFrame(ms)
          // One sample per second on a fixed clock — never on a network
          // event. This is what keeps the graph from dancing to somebody
          // else's typing.
          while (nextSampleAt <= ms) {
            samples = [...samples, { t: nextSampleAt / 1000, s: players.map((p) => live[p.id] ?? 0) }]
            nextSampleAt += 1000
          }
        }
      }

      const text = fmt(Math.min(durMs, Math.max(0, durMs - ms)))
      if (text !== lastTimerText && timerEl) {
        timerEl.textContent = text
        lastTimerText = text
      }
      raf = requestAnimationFrame(frame)
    })
    return () => cancelAnimationFrame(raf)
  })

  // A click anywhere on the board puts the caret back in the answer box —
  // except on a control, so the settings bar can be used mid-run without the
  // field yanking focus back on every click.
  function refocus(e: MouseEvent) {
    if (phase !== 'live' || spectating) return
    const t = e.target as HTMLElement | null
    if (t?.closest('input, button, [role="dialog"]')) return
    inputEl?.focus()
  }

  function setQ(text: string) {
    if (qEl && qEl.textContent !== text) qEl.textContent = text
  }

  /**
   * One frame of a rush run: turn the question over when the slot on screen
   * ends, and drain the bar in between.
   *
   * A slot ends five seconds in, or half a second after somebody takes it,
   * whichever comes first — so the schedule is a fold over the claims so far
   * rather than a division of the clock, and it is walked here from the slot
   * on screen forward. Normally that is one step or none. A tab that was in
   * the background is several: requestAnimationFrame stops there and the match
   * clock does not, so this is also the catching-up path.
   *
   * Nothing is waited for. The claim frame that settles a slot has already
   * been to the server and back by the time it lands in `claims`, and it
   * carries the timestamp the whole room folds in — so every screen turns over
   * on the same millisecond of the match clock without a further word being
   * said, and `idx` stays what it always was, the index into the same pure
   * question stream the server is checking against.
   */
  function rushFrame(ms: number) {
    let s = idx
    let open = slotOpen
    let end = rushNext(open, claims[s]?.ms ?? 0, !!claims[s])
    while (ms >= end) {
      s++
      open = end
      end = rushNext(open, claims[s]?.ms ?? 0, !!claims[s])
    }
    if (s !== idx) {
      idx = s
      slotOpen = open
      cur = question(seed, idx, cfg)
      setQ(cur.text)
      if (inputEl) inputEl.value = ''
      slot = s
      buzzed = false
      if (!spectating) inputEl?.focus()
    }
    const into = ms - open
    // A settled slot speaks for itself. An unsettled one hands the line to the
    // slot that just ended, for long enough to read — and "nobody got it" is
    // held back 350ms, because a buzz landed at 4.99s is still on its way back
    // here when a slot runs out on the clock.
    const v = claims[s] ? s : s > 0 && into < 1800 && (claims[s - 1] || into >= 350) ? s - 1 : -1
    if (v !== said) said = v
    // Against the end this slot actually has, so a claim snaps the bar down to
    // the half-second it has left rather than draining on past the turnover.
    if (barEl) barEl.style.transform = `scaleX(${Math.max(0, 1 - into / (end - open))})`
  }

  function onInput() {
    if (phase !== 'live' || spectating) return
    if (!inputEl || !qEl) return
    const v = inputEl.value
    if (!/^\d*$/.test(v)) {
      inputEl.value = v.replace(/\D/g, '')
      return
    }
    const at = Math.round(performance.now() - t0)

    if (cfg.mode === 'rush') {
      // The schedule is walked again here rather than trusted from the last
      // frame. requestAnimationFrame stops in a hidden tab and the match clock
      // does not, so a browser that has been in the background can be showing
      // a question that expired while it was away — and a buzz for it would be
      // a buzz for a slot the server has long since closed. Catch up and let
      // the next keystroke count.
      const was = idx
      rushFrame(at)
      if (idx !== was) return
      // A settled slot swallows whatever you type at it. The box is left
      // enabled and focused rather than disabled, because it comes back in a
      // second or two and having to click into it again every question would
      // be most of the mode.
      if (buzzed || claims[idx]) {
        inputEl.value = ''
        return
      }
      if (v === '' || Number(v) !== cur.answer) return
      // One buzz per slot, and no score to add here: the point is the server's
      // to give, because somebody else's frame may already be ahead of yours.
      // The step is recorded in App.svelte when the claim comes back saying you
      // won it — see the `claim` case there.
      buzzed = true
      onAnswer(idx, cur.answer, at)
      inputEl.value = ''
      return
    }

    if (v === '' || Number(v) !== cur.answer) return

    onAnswer(idx, cur.answer, at)
    // One array write per answer, alongside the one `score++` already costs —
    // same order of magnitude as the 1Hz sampling, not a new one. What it buys
    // is a graph that knows which question each of its steps was.
    steps = [
      ...steps,
      {
        i: idx,
        t: at / 1000,
        ms: at - lastAt,
        text: cur.text,
        answer: cur.answer,
        tier: cfg.mode === 'ramp' ? tierOf(idx, cfg.durSec) : -1,
      },
    ]
    lastAt = at
    score++
    idx++
    cur = question(seed, idx, cfg)
    qEl.textContent = cur.text
    inputEl.value = ''
    if (cfg.mode === 'ramp') {
      const t = tierOf(idx, cfg.durSec)
      if (t !== tier) tier = t
    }
  }
</script>

<svelte:window onclick={refocus} />

<section class="game">
  <Scoreboard seats={seatList} bind:clock={timerEl} solo={players.length === 1} />

  {#if ramp}
    <TierMeter {tier} />
  {/if}

  {#if spectating}
    <div class="spectate-note">
      spectating — scores and pace only, not their screen
    </div>
  {:else}
    <div class="eq num" class:counting={phase === 'count'} class:taken={!!claim} bind:this={qEl}>…</div>

    <!-- The whole of rush, said in one strip: how long this question has left,
         and who ended up with it. It sits between the equation and the box
         because that is where you are already looking. -->
    {#if rush}
      <div class="rush" aria-live="polite">
        <div class="track" aria-hidden="true"><i bind:this={barEl}></i></div>
        <div class="verdict">
          {#if saidBy}
            <span class="took" class:mine={saidMine}>
              {saidMine ? 'you got it' : `${saidName} got it`}
            </span>
          {:else if said >= 0}
            <span class="none">nobody got it</span>
          {:else if buzzed}
            <span class="pending">…</span>
          {/if}
        </div>
      </div>
    {/if}

    <input
      class="answer num"
      bind:this={inputEl}
      oninput={onInput}
      inputmode="numeric"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      aria-label="your answer"
      class:locked
      disabled={phase !== 'live'}
    />
  {/if}

  <div class="graph">
    <Graph {samples} {steps} durSec={durMs / 1000} seats={seatList} dim={phase === 'live'} />
  </div>
</section>

<style>
  .game {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 8px;
  }

  .eq {
    font-size: clamp(2.6rem, 8vw, 4.4rem);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.1;
    margin: 6vh 0 4vh;
    text-align: center;
    min-height: 1.1em;
  }
  .counting {
    color: var(--muted);
    font-weight: 400;
  }
  /* A settled question is still on screen — it has seconds left to run — but
     it is nobody's to answer any more, so it stops looking like a prompt. */
  .eq.taken {
    color: var(--faint);
  }

  /* --- rush --- */

  .rush {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 220px;
    margin: -2vh 0 3vh;
  }
  /* The five seconds, drawn as the one thing a clock is good for here: how
     much of it is left. Driven by transform in the frame loop, so it costs a
     compositor property and nothing else. */
  .track {
    width: 100%;
    height: 3px;
    border-radius: 999px;
    background: var(--grid);
    overflow: hidden;
  }
  .track i {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    transform-origin: left center;
    transform: scaleX(1);
  }
  /* Fixed height: the line appears and goes on every question, and the board
     must not move under the answer box when it does. */
  .verdict {
    height: 16px;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }
  .took.mine {
    color: var(--accent);
  }
  .none,
  .pending {
    color: var(--faint);
  }

  /* Fixed width and height. The old version had the box inside a flex row with
     `flex-grow w-16`, so it shrank to fit whatever was beside it — that is the
     collapse. Nothing here is allowed to size itself off its siblings. */
  .answer {
    width: 220px;
    height: 64px;
    flex: none;
    text-align: center;
    font-size: 30px;
    font-weight: 500;
    background: var(--panel);
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    outline: none;
    transition: border-color 140ms ease;
  }
  .answer:focus {
    border-color: var(--accent);
  }
  .answer:disabled {
    opacity: 0.4;
  }
  /* Still focused, still yours — just nothing left to win on this one. */
  .answer.locked {
    opacity: 0.4;
    border-color: var(--line);
  }

  .spectate-note {
    color: var(--muted);
    font-size: 13px;
    margin: 8vh 0 6vh;
  }

  .graph {
    width: 100%;
    margin-top: auto;
    padding-top: 6vh;
  }

  @media (max-width: 520px) {
    .answer {
      width: 170px;
      height: 56px;
      font-size: 26px;
    }
    .rush {
      width: 170px;
    }
  }
</style>
