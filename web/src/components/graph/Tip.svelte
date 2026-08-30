<script lang="ts">
  import { fmtAt, fmtTook, type Step } from '../../lib/steps'
  import type { Slot } from '../../lib/rush'
  import type { Seat } from '../../lib/players'

  /**
   * What the question under the cursor was. Handed both lists a run can be
   * read out of: outside rush `k` counts your own answers, in rush the slots
   * the room played. The last non-rush tread has none, so it reads `pending`.
   */
  let {
    x,
    y,
    w,
    k,
    steps = [],
    slots = [],
    pending = null,
    seats = [],
    endT = 0,
  }: {
    /** Where the dot sits, in viewBox coordinates. */
    x: number
    y: number
    /** Plot width, for keeping the box on screen. */
    w: number
    /** The index the cursor landed on: a step, or a slot in rush. */
    k: number
    steps?: Step[]
    /** Non-empty is what puts this tooltip in rush mode. */
    slots?: Slot[]
    pending?: { text: string; answer: number } | null
    seats?: Seat[]
    /** Seconds at which the line runs out, for the tread with no answer on it. */
    endT?: number
  } = $props()

  const rush = $derived(slots.length > 0)

  const tip = $derived.by(() => {
    // Follows the cursor along the step, clamped so a tooltip near either end
    // of the run does not hang off the edge of a full-width graph.
    const px = Math.min(Math.max(x, 92), w - 92)
    if (rush) {
      const s = slots[k]
      if (!s) return null
      const seat = s.by ? seats.find((q) => q.id === s.by) : undefined
      return {
        px,
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
    const s = steps[k]
    if (!s && !pending) return null
    const base = { px, n: k + 1, who: null, color: null }
    return s
      ? { ...base, text: s.text, answer: s.answer, ms: s.ms, at: s.t }
      : {
          ...base,
          text: pending!.text,
          answer: pending!.answer,
          // How long it had been going when the clock stopped it.
          ms: Math.max(0, (endT - (steps[k - 1]?.t ?? 0)) * 1000),
          at: null,
        }
  })
</script>

{#if tip}
  <div class="tip surface num" style:left="{tip.px}px" style:top="{y}px">
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

<style>
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
</style>
