<script lang="ts">
  import { ceilMax, linePath, peakOf, stepPoints, ticks, type Sample } from '../lib/series'
  import { fmtAt, fmtTook, type Step } from '../lib/steps'
  import type { Slot } from '../lib/rush'
  import type { Seat } from '../lib/players'

  /**
   * Cumulative answers over the run, one line per player.
   *
   * It plots the number on the scoreboard rather than a rate derived from it:
   * a running total is monotonic, so there is no wobble to smooth away and
   * every riser in the line is a real thing that happened. Hand-rolled SVG —
   * for a couple of hundred points a charting library is 60KB you do not need.
   *
   * Every line is stairs, because every line counts whole answers. What
   * differs is where the risers can land. Yours comes from the answer log, so
   * a riser sits at the instant that answer landed; everybody else's can only
   * come from the 1Hz samples, because their answers reach this browser as a
   * score and nothing more, so their risers land on the second we read the
   * score on. Coarser, but honest — sloping between two readings would draw
   * them answering in fractions.
   *
   * That precision is also what makes your line real enough to hang a tooltip
   * off: every step in it is one question, and the tooltip says which one it
   * was and how long it took.
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
   * Rush is hovered by slot instead, because in rush your own answers are a
   * poor description of the run: most of its questions went to somebody else
   * or to nobody, and hovering the log of your wins would skip straight over
   * them. So when `slots` is supplied the cursor walks *those* — every
   * question the run held, in the window it actually stood in — and what
   * lights up is that window, plus whatever your own line did across it. The
   * treads stop being the unit of hovering because in rush they are not one
   * question each.
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
     * Rush only: every question of the run, whoever took it. Non-empty is what
     * puts this graph in rush mode. Withheld to the live slot during a run,
     * for the same reason `pending` is: it is the one on your screen.
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

  const rush = $derived(slots.length > 0)

  // A pin is an index into a list that a live run keeps appending to. It cannot
  // point past the end, but a new run replaces the list wholesale, so drop it
  // whenever the run behind it changes.
  $effect(() => {
    void durSec
    void steps.length
    const n = rush ? slots.length : steps.length + (pending ? 1 : 0)
    if (pin && pin.k >= n) pin = null
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

  /**
   * Rush: what your score was as each slot opened, so a highlight drawn across
   * a slot rides your own line rather than floating over it. Counted from the
   * slots themselves rather than from `steps`, so it holds up while spectating
   * — where there is no line of yours and every level is zero.
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
  const seatOf = $derived((id: string | null) => (id ? seats.find((s) => s.id === id) : undefined))

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
    if (rush) {
      // The slots tile the run end to end, so every point on the axis is one
      // of them: the last one that had opened by `t`.
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
   * One question as a single shape: the tread it was thought about on, and the
   * riser that answering it went up. The question the clock ran out on has no
   * riser, so it is tread alone.
   */
  const seg = $derived.by(() => {
    if (!active) return null
    const k = active.k
    if (rush) {
      // A rush slot is a window of the clock, not a tread: it is the same
      // width whoever took it. What your line did across it is the flat run at
      // the score you were on — with the riser in the middle of it if the one
      // who took it was you.
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
   * Rush only: the slot's window, drawn the full height of the plot.
   *
   * A tread carries its own meaning in every other mode — its width is the
   * time that answer took — so lighting up the line is enough. A rush slot's
   * meaning is the window itself, five seconds of it or the fraction somebody
   * left of it, and that is a shape the line cannot show: the line is flat
   * across most of them. It is tinted by whoever took it, so scrubbing the run
   * reads as a run of colours rather than a list of times.
   */
  const band = $derived.by(() => {
    if (!rush || !active) return null
    const s = slots[active.k]
    if (!s) return null
    const seat = seatOf(s.by)
    return { x: x(s.from), w: Math.max(1, x(s.to) - x(s.from)), fill: seat?.color ?? 'var(--muted)' }
  })

  // The dot rides the tread under the cursor rather than sitting on the riser,
  // so it reads as "here is where you are pointing" and not as a fixed marker.
  const dot = $derived(
    seg && active ? { cx: Math.min(Math.max(active.px, seg.x0), seg.x1), cy: seg.lvl } : null,
  )

  const tip = $derived.by(() => {
    if (!active || !seg) return null
    // Follows the cursor along the step, clamped so a tooltip near either end
    // of the run does not hang off the edge of a full-width graph.
    const px = Math.min(Math.max(dot?.cx ?? seg.x0, 92), w - 92)
    if (rush) {
      const s = slots[active.k]
      if (!s) return null
      const seat = seatOf(s.by)
      return {
        px,
        py: seg.lvl,
        n: s.i + 1,
        text: s.text,
        answer: s.answer,
        // Null for a slot nobody took: it stood the full five seconds by
        // definition, so the number would say nothing the word does not.
        ms: s.took === null ? null : s.took * 1000,
        at: s.from,
        who: seat ? (seat.you ? 'you' : seat.name) : null,
        color: seat?.color ?? null,
      }
    }
    const s = steps[active.k]
    if (!s && !pending) return null
    const base = { px, py: seg.lvl, n: active.k + 1, who: null, color: null }
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

  {#if tip}
    <div class="tip surface num" style:left="{tip.px}px" style:top="{tip.py}px">
      <div class="q">{tip.text}<span class="eq">= {tip.answer}</span></div>
      <div class="row">
        {#if tip.ms !== null}<span class="took">{fmtTook(tip.ms)}</span>{/if}
        {#if tip.who}
          <span class="by" style:color={tip.color}>{tip.who}</span>
        {:else if rush}
          <span class="none">nobody</span>
        {/if}
        <span class="meta">#{tip.n}{tip.at === null ? '' : ` · at ${fmtAt(tip.at)}`}</span>
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

  /* The slot under the cursor, drawn as the window of clock it actually was.
     Low enough to sit under the lines rather than over them — it is the
     backdrop the run happened against, not a mark on it. */
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
  /* Whoever took the question, in the colour their line is drawn in. */
  .by {
    font-weight: 500;
  }
  .none {
    color: var(--faint);
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
