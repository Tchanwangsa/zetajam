<script lang="ts">
  import type { MatchResult } from '../../lib/net'
  import type { Seat } from '../../lib/players'
  import Dot from '../ui/Dot.svelte'

  /**
   * The ranked list, for a room too big to be a duel. Position is the
   * interesting number, so it goes first. Drawn on the room roster's line —
   * see `.roster` in app.css — where these people stood five minutes ago.
   */
  let {
    seats,
    /** Only for the flag. Everything else is already in the seats. */
    results,
  }: {
    seats: Seat[]
    results: MatchResult[]
  } = $props()

  const byId = $derived(Object.fromEntries(results.map((r) => [r.id, r])))
</script>

<ol class="table num">
  {#each seats as s, i (s.id)}
    <li class="roster" class:you={s.you}>
      <span class="rank">{i + 1}</span>
      <Dot color={s.color} />
      <span class="who roster-name trunc">{s.you ? 'you' : s.name}</span>
      {#if byId[s.id]?.flagged}<span class="tag">flagged</span>{/if}
      <span class="pts" style:color={s.color}>{s.score}</span>
    </li>
  {/each}
</ol>

<style>
  .table {
    list-style: none;
    margin: 20px 0 8px;
    padding: 0;
    width: 320px;
    max-width: 100%;
    text-align: left;
  }
  .table li {
    padding: 7px 10px;
  }
  .rank {
    width: 1.4em;
    color: var(--faint);
    font-size: 12px;
  }
  .who {
    font-size: 12px;
    color: var(--text);
  }
  .tag {
    color: var(--danger);
  }
  .pts {
    font-weight: 600;
  }
</style>
