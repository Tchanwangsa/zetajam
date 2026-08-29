<script lang="ts">
  import { ceilMax, linePath, peakOf, ticks, type Sample } from '../lib/series'
  import type { Seat } from '../lib/players'

  /**
   * Cumulative answers over the run, one straight line per player.
   *
   * It plots the number on the scoreboard rather than a rate derived from it,
   * which is what lets the lines be drawn straight: a running total is
   * monotonic, so there is no wobble to smooth away and every kink in the line
   * is a real thing that happened. Hand-rolled SVG — for a couple of hundred
   * points a charting library is 60KB you do not need.
   */
  let {
    samples = [],
    durSec = 120,
    seats = [],
    dim = false,
  }: {
    samples?: Sample[]
    durSec?: number
    /** In roster order. Index i here is index i in every sample's `s`. */
    seats?: Seat[]
    dim?: boolean
  } = $props()

  const H = 190
  const PAD = { t: 16, r: 14, b: 24, l: 40 }

  let el = $state<HTMLDivElement>()
  let w = $state(760)

  $effect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      w = Math.max(260, e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  })

  const yMax = $derived(ceilMax(peakOf(samples)))
  const x = $derived((t: number) => PAD.l + (t / durSec) * (w - PAD.l - PAD.r))
  const y = $derived(
    (v: number) => H - PAD.b - (Math.min(v, yMax) / yMax) * (H - PAD.t - PAD.b),
  )

  const paths = $derived(
    seats.map((seat, i) => ({
      seat,
      d: linePath(samples.map((s) => [x(s.t), y(s.s[i] ?? 0)])),
    })),
  )
  // Your line goes on last so it is never buried under somebody else's.
  const ordered = $derived([...paths].sort((a, b) => Number(a.seat.you) - Number(b.seat.you)))

  const yTicks = $derived(ticks(yMax))
  const xTicks = $derived([0, 1, 2, 3, 4].map((i) => Math.round((i * durSec) / 4)))
</script>

<div class="wrap" class:dim bind:this={el}>
  <svg
    width={w}
    height={H}
    viewBox="0 0 {w} {H}"
    role="img"
    aria-label="answers over the course of the match"
  >
    {#each yTicks as t (t)}
      <line class="grid" x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} />
      <text class="tick" x={PAD.l - 8} y={y(t) + 3.5} text-anchor="end">{t}</text>
    {/each}
    {#each xTicks as t, i (i)}
      <line class="grid vert" x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} />
      <text class="tick" x={x(t)} y={H - PAD.b + 15} text-anchor="middle">{t}s</text>
    {/each}

    {#if samples.length > 1}
      {#each ordered as p (p.seat.id)}
        <path d={p.d} style:stroke={p.seat.color} class:mine={p.seat.you} />
      {/each}
    {/if}
  </svg>

  <div class="legend num">
    {#if seats.length > 1}
      {#each seats as s (s.id)}
        <span class="key" style:--dot={s.color}>{s.you ? 'you' : s.name}</span>
      {/each}
    {/if}
    <span class="unit">answers</span>
  </div>
</div>

<style>
  .wrap {
    width: 100%;
    position: relative;
    transition: opacity 300ms ease;

    /* The chrome tokens are tuned for text and borders sitting on a solid
       background. A 1px gridline and a 10px tick label on near-white are a
       harder job, and dimming the whole graph during a live match takes
       another 30% off, so the graph carries its own darker greys. */
    --g-grid: #dcdce4;
    --g-tick: #83848e;
  }
  /* Dark mode already has the contrast — hand the tokens back. */
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .wrap {
      --g-grid: var(--grid);
      --g-tick: var(--faint);
    }
  }
  :global(:root[data-theme='dark']) .wrap {
    --g-grid: var(--grid);
    --g-tick: var(--faint);
  }
  /* While a match is live the graph is context, not the thing you look at. */
  .dim {
    opacity: 0.7;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--g-grid);
    stroke-width: 1;
  }
  .vert {
    stroke-dasharray: 2 4;
  }
  .tick {
    fill: var(--g-tick);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  path {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.95;
  }
  path.mine {
    stroke-width: 2.25;
    opacity: 1;
  }
  .legend {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px 14px;
    max-width: 70%;
    font-size: 11px;
    color: var(--muted);
  }
  .key::before {
    content: '';
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: middle;
    background: var(--dot);
  }
  .unit {
    color: var(--g-tick);
  }
</style>
