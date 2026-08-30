<script lang="ts">
  /**
   * The two hand-drawn pointers on the lobby: one at the mode block, one at the
   * match length. They exist because the settings bar is the one part of the
   * app nobody thinks to look at — it reads as chrome, and a first-time player
   * starts a two-minute run of classic addition without ever learning that
   * either of those words was a choice.
   *
   * The arrows are measured off the real elements rather than positioned by
   * hand, so they keep pointing at the right pill when the bar reflows, when
   * the custom-length chip widens from an icon to `95s`, or when the window
   * changes size. That is also why they are drawn in a fixed layer over the
   * page instead of inside the bar: nothing here is allowed to push the
   * settings around.
   */

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

  // Below this the bar starts wrapping and the labels have nowhere to sit
  // without landing on top of it, so there is nothing to draw.
  const MIN_W = 1180

  let pins = $state<Pin[]>([])
  // An arrow that says "look here" has nothing left to say the moment you do.
  // Touching any of the three blocks retires both of them, which also keeps a
  // stray curve from running under a settings popover you have just opened.
  let gone = $state(false)

  /**
   * A quadratic curve from a to b, sampled and then nudged off itself by a sine
   * that fades to nothing at both ends — a line drawn by a hand rather than a
   * compass, but still starting and finishing exactly where it was asked to.
   */
  function shaft(ax: number, ay: number, bx: number, by: number, bend: number, phase: number) {
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const cx = (ax + bx) / 2 + nx * bend
    const cy = (ay + by) / 2 + ny * bend

    const pts: string[] = []
    const n = 30
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const u = 1 - t
      const px = u * u * ax + 2 * u * t * cx + t * t * bx
      const py = u * u * ay + 2 * u * t * cy + t * t * by
      const wob = Math.sin(t * 9 + phase) * 1.7 * Math.sin(Math.PI * t)
      pts.push(`${(px + nx * wob).toFixed(1)} ${(py + ny * wob).toFixed(1)}`)
    }
    return `M${pts.join(' L')}`
  }

  // Two strokes off the tip, angled against the curve's last step so the head
  // sits on the direction the line actually arrives from.
  function head(ax: number, ay: number, bx: number, by: number, bend: number) {
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    const a = Math.atan2(dy + (dx / len) * bend * 0.9, dx - (dy / len) * bend * 0.9)
    const arm = (s: number) =>
      `M${bx.toFixed(1)} ${by.toFixed(1)} L${(bx - 12 * Math.cos(a + s)).toFixed(1)} ${(
        by -
        12 * Math.sin(a + s)
      ).toFixed(1)}`
    return `${arm(0.42)} ${arm(-0.42)}`
  }

  function measure() {
    if (window.innerWidth < MIN_W) {
      pins = []
      return
    }
    const next: Pin[] = []
    for (const t of TARGETS) {
      const el = document.querySelector(t.sel)
      if (!el) continue
      const r = el.getBoundingClientRect()
      const left = t.side === 'l'
      // The tip stops a little under the pill rather than on it — an arrow
      // touching a button looks like it is trying to be one.
      const bx = left ? r.left + 26 : r.right - 30
      const by = r.bottom + 10
      const ax = left ? r.left - 52 : r.right + 74
      const ay = r.bottom + (left ? 78 : 86)
      const bend = left ? 26 : -26
      next.push({
        text: t.text,
        shaft: shaft(ax, ay, bx, by, bend, left ? 0 : 2.1),
        head: head(ax, ay, bx, by, bend),
        x: ax + (left ? -12 : 12),
        y: ay,
        side: t.side,
      })
    }
    pins = next
  }

  // The three pills are the only `role="group"`s on the page, and the wrench
  // and the length chip are inside them.
  function touched(e: PointerEvent) {
    if ((e.target as Element | null)?.closest('[role="group"]')) gone = true
  }

  $effect(() => {
    measure()
    // The bar is the thing that moves: a wider custom-length chip, a note
    // appearing under it, the window resizing. Watch all three rather than
    // measuring once and hoping.
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
    /* A quarter-degree of tilt is the difference between handwriting and a
       label that happens to be in a handwritten font. */
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

  /* The arrows are decoration on top of decoration. If motion is unwelcome
     they are simply there, already drawn. */
  @media (prefers-reduced-motion: reduce) {
    .stroke {
      stroke-dashoffset: 0;
    }
    .label {
      opacity: 1;
    }
  }
</style>
