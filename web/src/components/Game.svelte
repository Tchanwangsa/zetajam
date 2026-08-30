<script lang="ts">
  import { question, type Question } from '../lib/questions'
  import { tierOf, type Config } from '../lib/config'
  import type { Sample } from '../lib/series'
  import type { Step } from '../lib/steps'
  import type { PlayerInfo } from '../lib/net'
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

  // Your own score comes from your own keyboard, not from a round trip. The
  // others come in as `score` frames. A spectator has no keyboard in this run,
  // so every number is somebody else's.
  const live = $derived(spectating ? scores : { ...scores, [selfId]: score })
  const seatList = $derived(buildSeats(players, live, spectating ? '' : selfId))

  // The hot path deliberately writes to these nodes by hand. Everything that
  // changes on a keystroke — the equation and the input — is one textContent
  // or .value assignment, with no reactive graph in between.
  let idx = 0
  let cur: Question
  let t0 = 0 // performance.now() at which questions go live
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

  function onInput() {
    if (phase !== 'live' || spectating) return
    if (!inputEl || !qEl) return
    const v = inputEl.value
    if (!/^\d*$/.test(v)) {
      inputEl.value = v.replace(/\D/g, '')
      return
    }
    if (v === '' || Number(v) !== cur.answer) return

    const at = Math.round(performance.now() - t0)
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
    <div class="spectate-note">spectating — scores and pace only, not their screen</div>
  {:else}
    <div class="eq num" class:counting={phase === 'count'} bind:this={qEl}>…</div>
    <input
      class="answer num"
      bind:this={inputEl}
      oninput={onInput}
      inputmode="numeric"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      aria-label="your answer"
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
  }
</style>
