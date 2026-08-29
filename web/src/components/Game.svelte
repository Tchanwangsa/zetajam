<script lang="ts">
  import { question, type Question } from '../lib/questions'
  import type { Config } from '../lib/config'
  import type { Sample } from '../lib/series'
  import type { PlayerInfo } from '../lib/net'
  import Graph from './Graph.svelte'

  let {
    seed,
    cfg,
    durMs,
    startsInMs,
    you,
    opp,
    spectating = false,
    oppScore = 0,
    specA = 0,
    specB = 0,
    samples = $bindable([] as Sample[]),
    onAnswer,
    onExpire,
  }: {
    seed: number
    cfg: Config
    durMs: number
    startsInMs: number
    you: PlayerInfo
    opp?: PlayerInfo
    spectating?: boolean
    oppScore?: number
    specA?: number
    specB?: number
    samples?: Sample[]
    onAnswer: (i: number, v: number, ms: number) => void
    onExpire: () => void
  } = $props()

  let qEl = $state<HTMLDivElement>()
  let inputEl = $state<HTMLInputElement>()
  let timerEl = $state<HTMLSpanElement>()

  let score = $state(0)
  let phase = $state<'count' | 'live' | 'done'>('count')

  // Spectators have no question stream of their own — the server only relays
  // scores — so their two numbers come in as props instead.
  const left = $derived(spectating ? specA : score)
  const right = $derived(spectating ? specB : oppScore)

  // The hot path deliberately writes to these nodes by hand. Everything that
  // changes on a keystroke — the equation and the input — is one textContent
  // or .value assignment, with no reactive graph in between.
  let idx = 0
  let cur: Question
  let t0 = 0 // performance.now() at which questions go live
  let nextSampleAt = 0
  let lastTimerText = ''

  function fmt(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  $effect(() => {
    idx = 0
    cur = question(seed, 0, cfg)
    t0 = performance.now() + startsInMs
    nextSampleAt = 1000
    samples = [{ t: 0, a: 0, b: 0 }]

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
          // event. This is rule one of the graph not twitching.
          while (nextSampleAt <= ms) {
            samples = [
              ...samples,
              { t: nextSampleAt / 1000, a: left, b: right },
            ]
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
  // except on a control, so the settings panel can be used mid-run without
  // the field yanking focus back on every click.
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

    onAnswer(idx, cur.answer, Math.round(performance.now() - t0))
    score++
    idx++
    cur = question(seed, idx, cfg)
    qEl.textContent = cur.text
    inputEl.value = ''
  }
</script>

<svelte:window onclick={refocus} />

<section class="game">
  <div class="hud num">
    <div class="side">
      <span class="val">{left}</span>
      <span class="lbl">{spectating ? you.name : 'you'}</span>
    </div>
    <span class="clock" bind:this={timerEl}>–:––</span>
    <div class="side right">
      <span class="val opp">{right}</span>
      <span class="lbl">{opp ? opp.name : spectating ? '—' : 'solo'}</span>
    </div>
  </div>

  {#if spectating}
    <div class="spectate-note">
      spectating — scores and pace only, not their screen
    </div>
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
    <Graph
      {samples}
      durSec={durMs / 1000}
      hasOpp={!!opp || spectating}
      youName={spectating ? you.name : 'you'}
      oppName={opp?.name ?? '—'}
      dim={phase === 'live'}
    />
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

  .hud {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: baseline;
    width: 100%;
    gap: 16px;
  }
  .side {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .side.right {
    justify-content: flex-end;
  }
  .val {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--accent);
  }
  .val.opp {
    color: var(--opp);
  }
  .lbl {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .clock {
    font-size: 15px;
    color: var(--muted);
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
