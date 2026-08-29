<script lang="ts">
  import { Timer } from '@lucide/svelte';
  import type { Seat } from '../lib/players'

  /**
   * The live scores. Two players get the duel layout they had — one big number
   * each side of the clock — and three or more get a wrapping row, because
   * eight names in a two-column grid is not a scoreboard.
   */
  let {
    seats = [],
    clock = $bindable<HTMLSpanElement | undefined>(),
    solo = false,
  }: {
    seats?: Seat[]
    clock?: HTMLSpanElement
    solo?: boolean
  } = $props()

  const duel = $derived(seats.length <= 2)
  const mine = $derived(seats.find((s) => s.you) ?? seats[0])
  const others = $derived(seats.filter((s) => s !== mine))
</script>

{#if duel}
  <div class="hud num">
    <div class="side">
      <span class="val" style:color={mine?.color}>{mine?.score ?? 0}</span>
      <span class="lbl">{mine?.you ? 'you' : (mine?.name ?? '—')}</span>
    </div>
    <span class="clock"><Timer size={14} /><span bind:this={clock}>–:––</span></span>
    <div class="side right">
      {#if others[0]}
        <span class="val" style:color={others[0].color}>{others[0].score}</span>
        <span class="lbl">{others[0].name}</span>
      {:else}
        <span class="lbl">{solo ? 'solo' : 'waiting'}</span>
      {/if}
    </div>
  </div>
{:else}
  <div class="hud stack num">
    <span class="clock"><Timer size={14} /><span bind:this={clock}>–:––</span></span>
    <div class="row">
      {#each seats as s (s.id)}
        <div class="chip" class:mine={s.you} style:--dot={s.color}>
          <span class="val sm" style:color={s.color}>{s.score}</span>
          <span class="lbl">{s.you ? 'you' : s.name}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .hud {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: baseline;
    width: 100%;
    gap: 16px;
  }
  .hud.stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
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
  }
  .val.sm {
    font-size: 20px;
  }
  .lbl {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 12ch;
  }
  /* The inner span is written to by hand from Game's rAF loop, so the icon has
     to live beside it rather than inside it — a textContent assignment would
     delete the svg on the first frame. */
  .clock {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 15px;
    color: var(--muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px 8px;
  }
  .chip {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1.5px solid transparent;
    background: var(--grid);
  }
  .chip.mine {
    border-color: color-mix(in srgb, var(--dot) 45%, transparent);
  }
</style>
