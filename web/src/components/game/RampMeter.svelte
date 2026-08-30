<script lang="ts">
  import { RAMP_EVERY, RAMP_TOP, rampLevel, rampLevelOf } from '../../lib/config'

  /**
   * How far up the ramp you are — without it a ramp run reads as an erratic
   * generator, not a curve. Thirty levels is too many to draw, so the number
   * carries it; pips give way to `top` at RAMP_TOP, where they'd never fill.
   */
  let { i = 0 }: { i?: number } = $props()

  const level = $derived(rampLevelOf(i))
  const top = $derived(level >= RAMP_TOP)
  const into = $derived(top ? 0 : i - (level - 1) * RAMP_EVERY)
  const rg = $derived(rampLevel(level))
</script>

<div
  class="meter num"
  aria-label="ramp level {level} of {RAMP_TOP}, terms {rg.add[0]} to {rg.add[1]}, multiplier {rg
    .mul[0]} to {rg.mul[1]}"
>
  <span class="mark" aria-hidden="true">
    <i></i><i></i><i></i>
  </span>
  <span class="lbl">lvl {level}</span>
  {#if top}
    <span class="top" aria-hidden="true">top</span>
  {:else}
    <span class="pips" aria-hidden="true">
      {#each { length: RAMP_EVERY } as _, k (k)}
        <i class:on={k < into}></i>
      {/each}
    </span>
  {/if}
</div>

<style>
  .meter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--muted);
  }

  /* Three ascending bars, lit rather than filling — the number beside them does
     the counting. The settings bar draws this mode with a lucide arrow, so the
     shape lives only here. */
  .mark {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }
  .mark i {
    display: block;
    width: 4px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .mark i:nth-child(1) {
    height: 6px;
  }
  .mark i:nth-child(2) {
    height: 9px;
  }
  .mark i:nth-child(3) {
    height: 12px;
    background: var(--accent);
  }

  .lbl {
    color: var(--accent);
    /* The number widens as it climbs; tabular digits keep the pips beside it
       from stepping sideways when it does. */
    font-variant-numeric: tabular-nums;
  }

  /* One pip per question, cleared at each step up. Deliberately not a countdown
     to a time: the run already has one clock in it. */
  .pips {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .pips i {
    display: block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--line);
    transition: background 200ms ease;
  }
  .pips i.on {
    background: var(--accent);
  }

  /* Where the pips were, so the line does not shift when the ramp runs out. */
  .top {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
  }

  @media (max-width: 520px) {
    .meter {
      font-size: 11px;
    }
  }
</style>
