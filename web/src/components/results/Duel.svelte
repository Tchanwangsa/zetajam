<script lang="ts">
  import type { Seat } from '../../lib/players'

  /**
   * Two scores the size of a headline, with a dash between them. A two-row
   * table of a duel reads as an administrative record of a fight. Three or
   * more becomes a list; see Table.svelte.
   */
  let { seats }: { seats: Seat[] } = $props()
</script>

<div class="scores num">
  {#each seats as s, i (s.id)}
    {#if i > 0}<div class="vs">–</div>{/if}
    <div class="col">
      <div class="big" style:color={s.color}>{s.score}</div>
      <div class="who">{s.you ? 'you' : s.name}</div>
    </div>
  {/each}
</div>

<style>
  .scores {
    display: flex;
    align-items: center;
    gap: 28px;
    margin: 18px 0 4px;
  }
  .big {
    font-size: clamp(3.4rem, 11vw, 5.6rem);
    font-weight: 600;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .who {
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
  }
  /* Hung from the top of the numbers, not centred: the digits are a line of
     type tall, and a dash mid-way through that reads as punctuation. */
  .vs {
    color: var(--faint);
    font-size: 1.6rem;
    align-self: flex-start;
    margin-top: 1.4rem;
  }
</style>
