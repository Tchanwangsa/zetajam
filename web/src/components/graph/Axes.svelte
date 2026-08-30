<script lang="ts">
  import { ticks } from '../../lib/series'

  /**
   * The frame a run is read against: a rule per answer count, a dashed
   * vertical every quarter of the clock. It works out its own marks — where
   * they go is a property of the axis, not of the lines over it.
   */
  let {
    x,
    y,
    w,
    h,
    pad,
    yMax,
    durSec,
  }: {
    /** Seconds into the run to an x in viewBox coordinates. A closure rather
        than a rebuild here, so every line is drawn in the same space. */
    x: (t: number) => number
    /** An answer count to a y in viewBox coordinates. */
    y: (v: number) => number
    w: number
    h: number
    pad: { t: number; r: number; b: number; l: number }
    yMax: number
    durSec: number
  } = $props()

  const yTicks = $derived(ticks(yMax))
  const xTicks = $derived([0, 1, 2, 3, 4].map((i) => Math.round((i * durSec) / 4)))
</script>

{#each yTicks as t (t)}
  <line class="grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
  <text class="tick" x={pad.l - 8} y={y(t) + 3.5} text-anchor="end">{t}</text>
{/each}
{#each xTicks as t, i (i)}
  <line class="grid vert" x1={x(t)} x2={x(t)} y1={pad.t} y2={h - pad.b} />
  <text class="tick" x={x(t)} y={h - pad.b + 15} text-anchor="middle">{t}s</text>
{/each}

<style>
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
</style>
