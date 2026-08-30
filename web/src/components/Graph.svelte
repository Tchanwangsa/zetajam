<script lang="ts">
  import { ceilMax, linePath, peakOf, ticks, type Sample } from '../lib/series'
  import { fmtAt, fmtTook, type Step } from '../lib/steps'
  import type { Seat } from '../lib/players'

  /**
   * Cumulative answers over the run, one line per player.
   *
   * It plots the number on the scoreboard rather than a rate derived from it,
   * which is what lets the lines be drawn straight: a running total is
   * monotonic, so there is no wobble to smooth away and every kink in the line
   * is a real thing that happened. Hand-rolled SVG — for a couple of hundred
   * points a charting library is 60KB you do not need.
   *
   * Your line and everybody else's are built from different data, on purpose.
   * Theirs can only come from the 1Hz samples, because their answers reach this
   * browser as a score and nothing more; yours is drawn from the answer log, at
   * the exact instant each answer landed. That is what makes your line real
   * enough to hang a tooltip off: every step in it is one question, and the
   * tooltip says which one it was and how long it took.
   *
   * Hovering works off the whole line rather than off the risers, because a
   * riser can be two pixels wide. What the cursor picks is a question, and a
   * question on this graph is a flat run of line followed by the riser that
   * ends it: the tread is the time you spent on it and the riser is you
   * getting it. So the tread reads left of its riser, not right of it — its
   * width is exactly the duration the tooltip prints. The whole shape lights
   * up and the dot rides the line under the cursor.
   *
   * That leaves one tread with no riser: the stretch after your last answer,
   * which is the question you were still on when the clock ran out. It reads
   * as a question like any other, but only once the run is over — hovering it
   * mid-run would hand you the answer to the one on your screen.
   *
   * The rungs are deliberately not drawn as bands or gridlines across the plot.
   * A rung is a property of the question index, so where it lands on a time
   * axis is a different place for every player in the run; one set of marks
   * would be a lie about everybody but the person they were drawn for.
   */
  let {
    samples = [],
    durSec = 120,
    seats = [],
    dim = false,
    steps = [],
    pending = null,
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

  // A hover is transient and a pin is not: pinning is there so a tooltip you
  // are reading survives the mouse leaving to point at it. The pin keeps the
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

  // A pin is an index into a list that a live run keeps appending to. It cannot
  // point past the end, but a new run replaces the list wholesale, so drop it
  // whenever the run behind it changes.
  $effect(() => {
    void durSec
    void steps.length
    if (pin && pin.k >= steps.length + (pending ? 1 : 0)) pin = null
  })

  // The peak has to consider your answers as well as the samples. Your line is
  // drawn from the answer log, which runs ahead of a 1Hz snapshot by up to a
  // second — take the axis off the samples alone and the last answers of a run
  // are drawn clipped to the ceiling.
  const yMax = $derived(ceilMax(Math.max(peakOf(samples), steps.length)))
  const x = $derived((t: number) => PAD.l + (t / durSec) * (w - PAD.l - PAD.r))
  const y = $derived(
    (v: number) => H - PAD.b - (Math.min(v, yMax) / yMax) * (H - PAD.t - PAD.b),
  )

  // Where the line is allowed to run out to: the last thing that happened,
  // which during a live run is the most recent sample rather than your last
  // answer — otherwise your line stops dead the moment you stop typing.
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

  const paths = $derived(
    seats.map((seat, i) => ({
      seat,
      d:
        mine && i === you
          ? linePath(stairs)
          : linePath(samples.map((s) => [x(s.t), y(s.s[i] ?? 0)])),
    })),
  )
  // Your line goes on last so it is never buried under somebody else's.
  const ordered = $derived([...paths].sort((a, b) => Number(a.seat.you) - Number(b.seat.you)))

  const yTicks = $derived(ticks(yMax))
  const xTicks = $derived([0, 1, 2, 3, 4].map((i) => Math.round((i * durSec) / 4)))

  /**
   * The question the cursor is standing on: the first answer that had *not*
   * landed yet at the time under the pointer, because the line before an
   * answer is the time that answer took. Past the last riser that is the
   * question the run ended on, which only exists once `pending` is supplied.
   */
  function spotAt(px: number): Spot | null {
    const t = ((px - PAD.l) / (w - PAD.l - PAD.r)) * durSec
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
   * One question as a single shape: the tread it was thought about on, and the
   * riser that answering it went up. The question the clock ran out on has no
   * riser, so it is tread alone.
   */
  const seg = $derived.by(() => {
    if (!active) return null
    const k = active.k
    const s = steps[k]
    if (!s && !pending) return null
    const x0 = x(k > 0 ? steps[k - 1].t : 0)
    const x1 = Math.max(x0, s ? x(s.t) : x(endT))
    const lvl = y(k)
    return { d: s ? `M${x0},${lvl}H${x1}V${y(k + 1)}` : `M${x0},${lvl}H${x1}`, x0, x1, lvl }
  })

  // The dot rides the tread under the cursor rather than sitting on the riser,
  // so it reads as "here is where you are pointing" and not as a fixed marker.
  const dot = $derived(
    seg && active ? { cx: Math.min(Math.max(active.px, seg.x0), seg.x1), cy: seg.lvl } : null,
  )

  const tip = $derived.by(() => {
    if (!active || !seg) return null
    const s = steps[active.k]
    if (!s && !pending) return null
    // Follows the cursor along the step, clamped so a tooltip near either end
    // of the run does not hang off the edge of a full-width graph.
    const px = Math.min(Math.max(dot?.cx ?? seg.x0, 92), w - 92)
    const base = { px, py: seg.lvl, n: active.k + 1 }
    return s
      ? { ...base, text: s.text, answer: s.answer, ms: s.ms, at: s.t }
      : {
          ...base,
          text: pending!.text,
          answer: pending!.answer,
          // How long it had been going when the clock stopped it.
          ms: Math.max(0, (endT - (steps[active.k - 1]?.t ?? 0)) * 1000),
          at: null,
        }
  })

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
    {#each yTicks as t (t)}
      <line class="grid" x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} />
      <text class="tick" x={PAD.l - 8} y={y(t) + 3.5} text-anchor="end">{t}</text>
    {/each}
    {#each xTicks as t, i (i)}
      <line class="grid vert" x1={x(t)} x2={x(t)} y1={PAD.t} y2={H - PAD.b} />
      <text class="tick" x={x(t)} y={H - PAD.b + 15} text-anchor="middle">{t}s</text>
    {/each}

    {#if samples.length > 1 || mine}
      {#each ordered as p (p.seat.id)}
        <path d={p.d} style:stroke={p.seat.color} class:mine={p.seat.you} />
      {/each}
    {/if}

    {#if seg}
      <path class="seg glow" d={seg.d} style:stroke={myColor} />
      <path class="seg" d={seg.d} style:stroke={myColor} />
    {/if}

    {#if dot}
      <circle class="dot" cx={dot.cx} cy={dot.cy} r={pin ? 4.5 : 3.5} />
    {/if}

    {#if mine}
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

  {#if tip}
    <div class="tip surface num" style:left="{tip.px}px" style:top="{tip.py}px">
      <div class="q">{tip.text}<span class="eq">= {tip.answer}</span></div>
      <div class="row">
        <span class="took">{fmtTook(tip.ms)}</span>
        <span class="meta">#{tip.n} · {tip.at === null ? 'unanswered' : `at ${fmtAt(tip.at)}`}</span>
      </div>
    </div>
  {/if}

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

  /* The hovered answer, redrawn on top of its own line: the riser it went up
     and the tread it held until the next one. The wide pass underneath is a
     halo rather than a stroke — it reads at a glance without moving the line. */
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

  .tip {
    position: absolute;
    z-index: 5;
    transform: translate(-50%, calc(-100% - 12px));
    padding: 8px 10px;
    min-width: 152px;
    text-align: center;
    pointer-events: none;
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.34);
  }
  .q {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
  }
  .q .eq {
    color: var(--muted);
    font-weight: 400;
    padding-left: 7px;
  }
  .tip .row {
    display: flex;
    align-items: baseline;
    justify-content: center;
    flex-wrap: wrap;
    gap: 3px 8px;
    margin-top: 4px;
    font-size: 11px;
  }
  .took {
    color: var(--accent);
  }
  .meta {
    color: var(--muted);
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
    /* It floats over the plot; without this it would eat the hover in the
       top-right corner of the graph. */
    pointer-events: none;
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
