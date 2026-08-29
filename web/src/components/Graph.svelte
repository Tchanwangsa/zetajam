<script lang="ts">
  import { series, ratchet, smoothPath, ticks, type Sample } from '../lib/series'

  let {
    samples = [],
    durSec = 120,
    hasOpp = false,
    youName = 'you',
    oppName = 'them',
    dim = false,
  }: {
    samples?: Sample[]
    durSec?: number
    hasOpp?: boolean
    youName?: string
    oppName?: string
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

  const you = $derived(series(samples, (s) => s.a))
  const them = $derived(series(samples, (s) => s.b))

  // The y ceiling is derived from the running peak, and because `samples` only
  // ever grows, that peak — and therefore the axis — can only ever grow too.
  // No shrink means no snap-back. The first two samples are skipped because a
  // single answer in the opening second reads as an absurd per-minute rate.
  const peak = $derived.by(() => {
    let p = 0
    const pools = hasOpp
      ? [you.inst, you.avg, them.inst, them.avg]
      : [you.inst, you.avg]
    for (const pool of pools) {
      for (let i = 2; i < pool.length; i++) p = Math.max(p, pool[i])
    }
    return p
  })
  const yMax = $derived(ratchet(40, peak))

  const x = $derived((t: number) => PAD.l + (t / durSec) * (w - PAD.l - PAD.r))
  const y = $derived(
    (v: number) => H - PAD.b - (Math.min(v, yMax) / yMax) * (H - PAD.t - PAD.b),
  )

  function path(values: number[]): string {
    // Drop the warm-up samples so the curve starts where the rate is real.
    const pts: Array<[number, number]> = []
    for (let i = 1; i < values.length; i++) pts.push([x(samples[i].t), y(values[i])])
    return smoothPath(pts)
  }

  const yTicks = $derived(ticks(yMax))
  const xTicks = $derived.by(() => {
    const step = durSec / 4
    return [0, 1, 2, 3, 4].map((i) => Math.round(i * step))
  })
</script>

<div class="wrap" class:dim bind:this={el}>
  <svg width={w} height={H} viewBox="0 0 {w} {H}" role="img"
       aria-label="answers per minute over the course of the match">
    <!-- grid -->
    {#each yTicks as t}
      <line class="grid" x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} />
      <text class="tick" x={PAD.l - 8} y={y(t) + 3.5} text-anchor="end">{t}</text>
    {/each}
    {#each xTicks as t}
      <line class="grid vert" x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} />
      <text class="tick" x={x(t)} y={H - PAD.b + 15} text-anchor="middle">{t}s</text>
    {/each}

    {#if samples.length > 2}
      <!-- cumulative average: the calm line that converges -->
      <path class="avg you" d={path(you.avg)} />
      {#if hasOpp}
        <path class="inst them" d={path(them.inst)} />
      {/if}
      <!-- trailing-window rate: the lively line -->
      <path class="inst you" d={path(you.inst)} />
    {/if}
  </svg>

  <div class="legend num">
    <span class="key you">{youName}</span>
    {#if hasOpp}<span class="key them">{oppName}</span>{/if}
    <span class="unit">answers / min</span>
  </div>
</div>

<style>
  .wrap {
    width: 100%;
    position: relative;
    transition: opacity 300ms ease;
  }
  /* While a match is live the graph is context, not the thing you look at. */
  .dim {
    opacity: 0.45;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--grid);
    stroke-width: 1;
  }
  .vert {
    stroke-dasharray: 2 4;
  }
  .tick {
    fill: var(--faint);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .inst.you {
    stroke: var(--accent);
    stroke-width: 2.25;
  }
  .avg.you {
    stroke: var(--accent-soft);
    stroke-width: 1.25;
    stroke-dasharray: 4 4;
    opacity: 0.75;
  }
  .inst.them {
    stroke: var(--opp);
    stroke-width: 1.75;
    opacity: 0.85;
  }
  .legend {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    gap: 14px;
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
  }
  .key.you::before {
    background: var(--accent);
  }
  .key.them::before {
    background: var(--opp);
  }
  .unit {
    color: var(--faint);
  }
</style>
