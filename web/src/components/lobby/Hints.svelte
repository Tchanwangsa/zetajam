<script lang="ts">
  /**
   * The settings bar reads as chrome, so a first-timer never learns mode or
   * length was a choice. Each arrow ends under the control that is *on*,
   * arriving vertically to name a word rather than a neighbourhood. Measured
   * off the real elements; in a fixed layer, so it never moves the settings.
   */

  type Pt = { x: number; y: number }

  type Pin = {
    text: string
    shaft: string
    head: string
    // Where the label sits, and which of its edges the arrow leaves from.
    x: number
    y: number
    side: 'l' | 'r'
  }

  const TARGETS = [
    { sel: '[aria-label="mode"]', text: 'pick a mode', side: 'l' as const },
    { sel: '[aria-label="match length"]', text: 'how long a run lasts', side: 'r' as const },
  ]

  // Below this the bar wraps and the labels have nowhere to sit.
  const MIN_W = 1180

  // How far to the side of the block the writing starts, and how far below it.
  const REACH = 46
  const DROP = 74
  // Just under the pill: touching a button looks like trying to be one, any
  // further reads as a miss.
  const GAP = 7

  let pins = $state<Pin[]>([])
  // An arrow saying "look here" has nothing left to say once you do. Retiring
  // both on any block touch also keeps a curve out from under a new popover.
  let gone = $state(false)

  const cubic = (a: Pt, c1: Pt, c2: Pt, b: Pt, t: number): Pt => {
    const u = 1 - t
    return {
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    }
  }

  /**
   * A cubic nudged off itself by a sine that fades to nothing at both ends —
   * hand-drawn, but still landing exactly where asked. The wobble is measured
   * off the local tangent, so the hook near the tip wanders along the curve.
   */
  function shaft(a: Pt, c1: Pt, c2: Pt, b: Pt, phase: number) {
    const pts: string[] = []
    const n = 34
    let prev = a
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p = cubic(a, c1, c2, b, t)
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      const len = Math.hypot(dx, dy) || 1
      const wob = Math.sin(t * 9 + phase) * 1.7 * Math.sin(Math.PI * t)
      pts.push(`${(p.x - (dy / len) * wob).toFixed(1)} ${(p.y + (dx / len) * wob).toFixed(1)}`)
      prev = p
    }
    return `M${pts.join(' L')}`
  }

  // Two strokes off the tip, angled against the curve's arrival — which, with
  // the second handle parked below the tip, is straight up.
  function head(b: Pt, from: Pt) {
    const a = Math.atan2(b.y - from.y, b.x - from.x)
    const arm = (s: number) =>
      `M${b.x.toFixed(1)} ${b.y.toFixed(1)} L${(b.x - 13 * Math.cos(a + s)).toFixed(1)} ${(
        b.y -
        13 * Math.sin(a + s)
      ).toFixed(1)}`
    return `${arm(0.44)} ${arm(-0.44)}`
  }

  function measure() {
    if (window.innerWidth < MIN_W) {
      pins = []
      return
    }
    const next: Pin[] = []
    for (const t of TARGETS) {
      const block = document.querySelector(t.sel)
      if (!block) continue
      const r = block.getBoundingClientRect()
      // The controls already announce the on setting for a screen reader, so
      // the aim comes off that. Nothing pressed falls back to the block's middle.
      const on = block.querySelector('[aria-pressed="true"]')?.getBoundingClientRect()

      const left = t.side === 'l'
      const b = { x: on ? on.left + on.width / 2 : r.left + r.width / 2, y: r.bottom + GAP }
      const a = { x: left ? r.left - REACH : r.right + REACH, y: r.bottom + DROP }
      // Out of the label almost level, then up and around to arrive from
      // directly below.
      const c1 = { x: a.x + (b.x - a.x) * 0.45, y: a.y + 3 }
      const c2 = { x: b.x, y: b.y + (a.y - b.y) * 0.6 }

      next.push({
        text: t.text,
        shaft: shaft(a, c1, c2, b, left ? 0 : 2.1),
        head: head(b, c2),
        x: a.x + (left ? -10 : 10),
        y: a.y,
        side: t.side,
      })
    }
    pins = next
  }

  // The three pills are the page's only `role="group"`s.
  function touched(e: PointerEvent) {
    if ((e.target as Element | null)?.closest('[role="group"]')) gone = true
  }

  $effect(() => {
    measure()
    // The bar moves: a wider custom-length chip, a note under it, a resize.
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    for (const t of TARGETS) {
      const el = document.querySelector(t.sel)
      if (el) ro.observe(el)
    }
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    document.addEventListener('pointerdown', touched)
    // Caveat lands after first paint and the labels change width when it does.
    document.fonts?.ready.then(measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
      document.removeEventListener('pointerdown', touched)
    }
  })
</script>

{#if pins.length}
  <div class="layer" class:gone aria-hidden="true">
    <svg class="ink" width="100%" height="100%">
      {#each pins as p, i (p.text)}
        <path class="stroke" style="--d: {160 + i * 120}ms" d={p.shaft} pathLength="1" />
        <path class="stroke tip" style="--d: {680 + i * 120}ms" d={p.head} pathLength="1" />
      {/each}
    </svg>
    {#each pins as p, i (p.text)}
      <span class="label" class:right={p.side === 'r'} style="left: {p.x}px; top: {p.y}px; --d: {i * 120}ms">
        {p.text}
      </span>
    {/each}
  </div>
{/if}

<style>
  /* Over the page, under nothing — it never takes a click. */
  .layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 5;
    transition: opacity 240ms ease;
  }
  .layer.gone {
    opacity: 0;
  }

  .ink {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  .stroke {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.75;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 620ms ease-out var(--d) forwards;
  }
  .tip {
    animation-duration: 220ms;
  }

  .label {
    position: absolute;
    transform: translate(-100%, -50%);
    white-space: nowrap;
    font-family: var(--hand);
    font-size: 21px;
    font-weight: 600;
    line-height: 1;
    color: var(--accent);
    opacity: 0;
    /* The difference between handwriting and a handwritten font. */
    rotate: -2deg;
    animation: fade 400ms ease-out var(--d) forwards;
  }
  .label.right {
    transform: translate(0, -50%);
    rotate: 2deg;
  }

  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes fade {
    to {
      opacity: 1;
    }
  }

  /* If motion is unwelcome, they are simply there, already drawn. */
  @media (prefers-reduced-motion: reduce) {
    .stroke {
      stroke-dashoffset: 0;
    }
    .label {
      opacity: 1;
    }
  }
</style>
