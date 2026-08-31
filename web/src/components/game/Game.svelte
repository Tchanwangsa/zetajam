<script lang="ts">
  import { tick, untrack } from 'svelte'
  import type { Sample } from '../../lib/series'
  import type { Step } from '../../lib/steps'
  import { Run, type FrameResult, type SubmitResult } from '../../lib/run.svelte'
  import { getRunContext } from '../../lib/run-context.svelte'
  import { seats as buildSeats } from '../../lib/players'
  import Graph from '../graph/Graph.svelte'
  import Scoreboard from './Scoreboard.svelte'
  import RampMeter from './RampMeter.svelte'
  import RushStrip from './RushStrip.svelte'

  /**
   * The match comes from context (lib/run-context.svelte.ts) — a dozen fields
   * of one thing. What this screen is asked to *do* stays a prop, so it still
   * names its contract and still runs against anything.
   */
  let {
    samples = $bindable([] as Sample[]),
    steps = $bindable([] as Step[]),
    onAnswer,
    onExpire,
  }: {
    samples?: Sample[]
    /** Your own answers, in order. Empty while spectating — see lib/steps.ts. */
    steps?: Step[]
    onAnswer: (i: number, v: number, ms: number) => void
    onExpire: () => void
  } = $props()

  const ctx = getRunContext()

  // The run itself lives in lib/run.svelte.ts; what is left here is the screen.
  // Everything that changes on a keystroke is one textContent or .value
  // assignment, no reactive graph.
  let qEl = $state<HTMLDivElement>()
  let inputEl = $state<HTMLInputElement>()
  let timerEl = $state<HTMLSpanElement>()
  /** The bar in the strip below, bound back out so the frame loop can drain it. */
  let barEl = $state<HTMLElement>()
  /** The clock as last written. Compared here rather than in Run, so a tick
      that could not write one is not recorded as one that did. */
  let lastTimerText = ''

  // Read through thunks, not copied: the engine wants every one of them live.
  const run = new Run({
    claims: () => ctx.claims,
    scores: () => ctx.scores,
    steps: () => steps,
    selfId: () => ctx.selfId,
  })

  const rush = $derived(ctx.cfg.mode === 'rush')
  const ramp = $derived(ctx.cfg.mode === 'ramp' && !ctx.spectating)
  const claim = $derived(rush ? ctx.claims[run.slot] : undefined)
  // Settled, or your buzz spent: nothing left to type until the next one.
  const locked = $derived(rush && (run.buzzed || !!claim))
  const seatList = $derived(buildSeats(ctx.players, run.live, ctx.spectating ? '' : ctx.selfId))

  // Run samples; the prop hands them back out to Client, which keeps them after
  // Game is torn down. `steps` goes the other way — Client owns the log, in
  // rush because the claim frame is where you find out you won, and this screen
  // only appends what a keystroke earned.
  $effect(() => {
    samples = run.samples
  })

  $effect(() => {
    // Armed once, on mount: App keys Game on runKey, so every match is a fresh
    // component. Untracked because a getter read in start() would otherwise
    // re-arm a live run — `selfId` is rewritten on every socket reconnect.
    untrack(() => run.start(ctx, performance.now()))
    let raf = requestAnimationFrame(function loop(now) {
      const r = run.frame(now)
      if (r.clear && inputEl) inputEl.value = ''
      write(r)
      if (r.timer !== lastTimerText && timerEl) {
        timerEl.textContent = r.timer
        lastTimerText = r.timer
      }
      if (r.expired) onExpire()
      raf = requestAnimationFrame(loop)
    })
    return () => cancelAnimationFrame(raf)
  })

  /** The writes a tick and a keystroke have in common. */
  function write(r: FrameResult | SubmitResult) {
    if (r.q !== null) setQ(r.q)
    if (r.bar !== null && barEl) barEl.style.transform = `scaleX(${r.bar})`
    // The last frame of the countdown turns the run live and asks for the
    // caret in the same breath — but the box is still `disabled` until Svelte
    // has flushed that phase change, and focusing a disabled input does
    // nothing. So the focus waits for the flush, rather than for a click.
    if (r.focus) tick().then(() => inputEl?.focus())
  }

  function setQ(text: string) {
    if (qEl && qEl.textContent !== text) qEl.textContent = text
  }

  // A click on the board puts the caret back in the answer box — except on a
  // control, so the settings bar is usable mid-run.
  function refocus(e: MouseEvent) {
    if (run.phase !== 'live' || ctx.spectating) return
    const t = e.target as HTMLElement | null
    if (t?.closest('input, button, [role="dialog"]')) return
    inputEl?.focus()
  }

  function onInput() {
    if (!inputEl || !qEl) return
    const r = run.submit(inputEl.value, performance.now())
    if (r.input !== 'keep') inputEl.value = r.input === 'set' ? r.value : ''
    write(r)
    if (r.step) steps = [...steps, r.step]
    if (r.answer) onAnswer(r.answer.i, r.answer.v, r.answer.ms)
  }
</script>

<svelte:window onclick={refocus} />

<section class="game">
  <Scoreboard seats={seatList} bind:clock={timerEl} solo={ctx.players.length === 1} />

  {#if ramp}
    <RampMeter i={run.rampAt} />
  {/if}

  {#if ctx.spectating}
    <div class="spectate-note">
      spectating — scores and pace only, not their screen
    </div>
  {:else}
    <div
      class="eq num"
      class:counting={run.phase === 'count'}
      class:taken={!!claim}
      bind:this={qEl}
    >…</div>

    {#if rush}
      <RushStrip
        claims={ctx.claims}
        players={ctx.players}
        selfId={ctx.selfId}
        said={run.said}
        buzzed={run.buzzed}
        bind:bar={barEl}
      />
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
      disabled={run.phase !== 'live'}
    />
  {/if}

  <div class="graph">
    <!-- Only the slots that have closed — the live one is the question on
         screen above, and the graph does not hand out that answer. -->
    <Graph
      samples={run.samples}
      {steps}
      slots={rush ? ctx.slots.slice(0, run.slot) : []}
      durSec={ctx.durMs / 1000}
      seats={seatList}
      dim={run.phase === 'live'}
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

  .eq {
    /* Sized off whichever axis is scarcer: on a phone held sideways 8vw is
       65px of equation, and it pushes the answer box below the fold. */
    font-size: clamp(2.6rem, min(8vw, 13vh), 4.4rem);
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
  /* Still on screen, still running, but nobody's to answer now. */
  .eq.taken {
    color: var(--faint);
  }

  /* Fixed width and height. Inside a flex row with `flex-grow` it sized itself
     off its siblings and collapsed. Nothing here is allowed to do that. */
  .answer {
    width: 220px;
    height: 64px;
    flex: none;
    /* Centred on its own terms, not on the column's. `align-self` for the
       flex case, auto margins for the one where something — a browser
       extension wrapping the field, most often — has put a block box in
       between: either way it sits under the question rather than off to the
       left of it. */
    align-self: center;
    margin-inline: auto;
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
  }

  /* Landscape. The air around the question is measured in vh already, but at
     375px of it there is none to spare — the box you type in has to be on
     screen without scrolling for the run to be playable at all. */
  @media (max-height: 520px) {
    .eq {
      margin: 3vh 0 2vh;
    }
    .graph {
      padding-top: 3vh;
    }
  }
</style>
