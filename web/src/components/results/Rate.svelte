<script lang="ts">
  import type { MatchResult } from '../../lib/net'

  /**
   * How fast you were going. Answers per minute rather than a total: a total
   * only compares against runs of the same length. The flag sits with the rate,
   * not the score — the score stands; only the typing did not look human.
   */
  let {
    results,
    selfId,
    durMs,
  }: {
    results: MatchResult[]
    selfId: string
    durMs: number
  } = $props()

  const mine = $derived(results.find((r) => r.id === selfId))
  const rate = $derived(mine ? (mine.score * 60000) / durMs : 0)
</script>

<div class="meta num">
  {rate.toFixed(1)} answers / min
</div>
{#if mine?.flagged}
  <div class="flag">flagged: answers came in faster than a human hand</div>
{/if}

<style>
  .meta {
    color: var(--muted);
    font-size: 13px;
  }
  .flag {
    color: var(--danger);
    font-size: 12px;
    margin-top: 6px;
  }
</style>
