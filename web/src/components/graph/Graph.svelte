<script lang="ts">
  import { ceilMax, linePath, peakOf, stepPoints, type Sample } from '../../lib/series'
  import type { Step } from '../../lib/steps'
  import type { Slot } from '../../lib/rush'
  import type { Seat } from '../../lib/players'
  import Axes from './Axes.svelte'
  import Legend from './Legend.svelte'
  import Tip from './Tip.svelte'

  /**
   * Cumulative answers, one line per player; hand-rolled SVG because a chart
   * library is 60KB you do not need. Your line comes from the answer log and
   * everyone else's from 1Hz samples, so only your risers sit on the instant.
   */
  let {
    samples = [],
    durSec = 120,
    seats = [],
    dim = false,
    steps = [],
    pending = null,
    slots = [],
  }: {
    samples?: Sample[]
    durSec?: number
    /** In roster order. Index i here is index i in every sample's `s`. */
    seats?: Seat[]
    dim?: boolean
    /** Your own answers, in order. Empty when spectating. */
    steps?: Step[]
    /**
     * The question you never got to answer, once the run is over. Withheld
     * during a live run: it is the one still on your screen.
     */
    pending?: { text: string; answer: number } | null
    /**
     * Rush only: every question of the run. Non-empty is what puts this graph
     * in rush mode. Cut to the live slot during a run, like `pending`.
     */
    slots?: Slot[]
  } = $props()

  const H = 190
  const PAD = { t: 16, r: 14, b: 24, l: 40 }

  let el = $state<HTMLDivElement>()
  let w = $state(760)

  /** A step under the cursor: which answer, and where along it the mouse is. */
  interface Spot {
    k: number
    px: number
  }

  // A pin survives the mouse leaving to point at the tooltip. It keeps the
  // cursor position it was made at, so the dot freezes where you clicked.
  let hover = $state<Spot | null>(null)
  let pin = $state<Spot | null>(null)
  const active = $derived(pin ?? hover)

  $effect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      w = Math.max(260, e.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  })

  const rush = $derived(slots.length > 0)

  // A pin indexes a list a live run appends to. A new run replaces the list
  // wholesale, so drop it whenever the run behind it changes.
  $effect(() => {
    void durSec
    void steps.length
    const n = rush ? slots.length : steps.length + (pending ? 1 : 0)
    if (pin && pin.k >= n) pin = null
  })

  // Your line runs ahead of a 1Hz snapshot by up to a second, so the peak has
  // to consider it too — off the samples alone the last answers draw clipped.
  const yMax = $derived(ceilMax(Math.max(peakOf(samples), steps.length)))
  const x = $derived((t: number) => PAD.l + (t / durSec) * (w - PAD.l - PAD.r))
  const y = $derived(
    (v: number) => H - PAD.b - (Math.min(v, yMax) / yMax) * (H - PAD.t - PAD.b),
  )

  // Where the line runs out to. During a live run that is the latest sample,
  // not your last answer, or the line stops dead the moment you stop typing.
  const endT = $derived(
    Math.min(durSec, Math.max(samples[samples.length - 1]?.t ?? 0, steps[steps.length - 1]?.t ?? 0)),
  )

  /** Your line: flat until an answer lands, then straight up by one. */
  const stairs = $derived.by(() => {
    const pts: Array<[number, number]> = [[x(0), y(0)]]
    steps.forEach((s, k) => {
      pts.push([x(s.t), y(k)], [x(s.t), y(k + 1)])
    })
    pts.push([x(endT), y(steps.length)])
    return pts
  })

  const you = $derived(seats.findIndex((s) => s.you))
  const mine = $derived(you >= 0 && steps.length > 0)
  const myColor = $derived(seats[you]?.color ?? 'var(--accent)')

  /**
   * Rush: your score as each slot opened, so a highlight rides your own line.
   * Counted off the slots, not `steps`, so it holds up while spectating.
   */
  const levels = $derived.by(() => {
    const id = seats[you]?.id
    const out: number[] = []
    let n = 0
    for (const s of slots) {
      out.push(n)
      if (id && s.by === id) n++
    }
    return out
  })

  const paths = $derived(
    seats.map((seat, i) => ({
      seat,
      d:
        mine && i === you
          ? linePath(stairs)
          : linePath(stepPoints(samples.map((s) => [x(s.t), y(s.s[i] ?? 0)]))),
    })),
  )
  // Your line goes on last so it is never buried under somebody else's.
  const ordered = $derived([...paths].sort((a, b) => Number(a.seat.you) - Number(b.seat.you)))

  /**
   * The question the cursor stands on: the first answer that had *not* landed
   * yet, since the line before an answer is the time that answer took. Past
   * the last riser it is the question the run ended on — needs `pending`.
   */
  function spotAt(px: number): Spot | null {
    const t = ((px - PAD.l) / (w - PAD.l - PAD.r)) * durSec
    if (rush) {
      // Rush hovers whole slots: most questions went to somebody else. They
      // tile the run end to end, so every point on the axis is one of them —
      // the last that had opened by `t`.
      let lo = 0
      let hi = slots.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (slots[mid].from <= t) lo = mid
        else hi = mid - 1
      }
      return { k: lo, px }
    }
    let lo = 0
    let hi = steps.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (steps[mid].t < t) lo = mid + 1
      else hi = mid
    }
    return lo === steps.length && !pending ? null : { k: lo, px }
  }

  /**
   * One question as a single shape: the tread it was thought about on plus the
   * riser that ends it — a riser alone can be two pixels wide. The question the
   * clock ran out on has no riser, so it is tread alone.
   */
  const seg = $derived.by(() => {
    if (!active) return null
    const k = active.k
    if (rush) {
      // A rush slot is a window of the clock, the same width whoever took it.
      // Your line across it is flat at the score you were on, with the riser
      // in the middle of it if you took it.
      const s = slots[k]
      if (!s) return null
      const x0 = x(s.from)
      const x1 = Math.max(x0, x(s.to))
      const lvl = y(levels[k])
      const won = s.at !== null && !!seats[you] && s.by === seats[you].id
      return {
        d: won
          ? `M${x0},${lvl}H${x(s.at!)}V${y(levels[k] + 1)}H${x1}`
          : `M${x0},${lvl}H${x1}`,
        x0,
        x1,
        lvl,
      }
    }
    const s = steps[k]
    if (!s && !pending) return null
    const x0 = x(k > 0 ? steps[k - 1].t : 0)
    const x1 = Math.max(x0, s ? x(s.t) : x(endT))
    const lvl = y(k)
    return { d: s ? `M${x0},${lvl}H${x1}V${y(k + 1)}` : `M${x0},${lvl}H${x1}`, x0, x1, lvl }
  })

  /**
   * Rush only: the slot's window, full height of the plot. Elsewhere the
   * tread's width *is* the meaning, but a rush slot's meaning is the window
   * and the line is flat across most of them. Tinted by whoever took it.
   */
  const band = $derived.by(() => {
    if (!rush || !active) return null
    const s = slots[active.k]
    if (!s) return null
    const seat = s.by ? seats.find((q) => q.id === s.by) : undefined
    return { x: x(s.from), w: Math.max(1, x(s.to) - x(s.from)), fill: seat?.color ?? 'var(--muted)' }
  })

  // The dot rides the tread under the cursor rather than sitting on the riser,
  // so it reads as "you are pointing here" and not as a fixed marker.
  const dot = $derived(
    seg && active ? { cx: Math.min(Math.max(active.px, seg.x0), seg.x1), cy: seg.lvl } : null,
  )

  function move(ev: MouseEvent) {
    if (!el) return
    hover = spotAt(ev.clientX - el.getBoundingClientRect().left)
  }
  function click(ev: MouseEvent) {
    move(ev)
    pin = pin && hover && pin.k === hover.k ? null : hover && { ...hover }
  }
</script>

<div
  class="wrap"
  class:dim
  bind:this={el}
  role="presentation"
  onmouseleave={() => (hover = null)}
>
  <svg
    width={w}
    height={H}
    viewBox="0 0 {w} {H}"
    role="img"
    aria-label="answers over the course of the match"
  >
    <!-- No ramp rungs: a rung is a property of the question index, so it lands
         somewhere different for every player. -->
    <Axes {x} {y} {w} h={H} pad={PAD} {yMax} {durSec} />

    {#if samples.length > 1 || mine}
      {#each ordered as p (p.seat.id)}
        <path d={p.d} style:stroke={p.seat.color} class:mine={p.seat.you} />
      {/each}
    {/if}

    {#if band}
      <rect
        class="band"
        x={band.x}
        y={PAD.t}
        width={band.w}
        height={Math.max(0, H - PAD.b - PAD.t)}
        style:fill={band.fill}
      />
    {/if}

    {#if seg}
      <path class="seg glow" d={seg.d} style:stroke={myColor} />
      <path class="seg" d={seg.d} style:stroke={myColor} />
    {/if}

    {#if dot}
      <circle class="dot" cx={dot.cx} cy={dot.cy} r={pin ? 4.5 : 3.5} />
    {/if}

    {#if mine || rush}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <rect
        class="hit"
        x={PAD.l}
        y="0"
        width={Math.max(0, w - PAD.l - PAD.r)}
        height={H - PAD.b}
        onmousemove={move}
        onclick={click}
      />
    {/if}
  </svg>

  {#if seg && dot && active}
    <Tip x={dot.cx} y={seg.lvl} {w} k={active.k} {steps} {slots} {pending} {seats} {endT} />
  {/if}

  <Legend {seats} />
</div>

<style>
  .wrap {
    width: 100%;
    position: relative;
    transition: opacity 300ms ease;

    /* The chrome tokens are tuned for text; a 1px gridline on near-white is a
       harder job, and dimming a live match takes another 30% off. One decision
       about the whole plot, so it is declared here, not in the children. */
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

  /* The hovered answer redrawn over its own line. The wide pass underneath is
     a halo rather than a stroke — it reads without moving the line. */
  .seg {
    stroke-width: 3.5;
    opacity: 1;
    pointer-events: none;
  }
  .seg.glow {
    stroke-width: 11;
    opacity: 0.16;
    stroke-linecap: butt;
  }

  /* The slot under the cursor, as the window of clock it was. Under the lines
     rather than over them: it is the backdrop, not a mark. */
  .band {
    opacity: 0.13;
    pointer-events: none;
  }

  .hit {
    fill: transparent;
    cursor: crosshair;
  }
  .dot {
    fill: var(--accent);
    stroke: var(--bg);
    stroke-width: 1.5;
    pointer-events: none;
  }
</style>
