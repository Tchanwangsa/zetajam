<script lang="ts">
  import type { MatchResult } from '../../lib/net'

  /**
   * The sentence at the top, written from your seat: the first thing anybody
   * wants off this screen is whether they won. A solo run is not a contest, so
   * it is only told it is over; a spectator (no results) gets nothing.
   */
  let {
    results,
    selfId,
  }: {
    results: MatchResult[]
    selfId: string
  } = $props()

  const verdict = $derived.by(() => {
    if (!results.length) return ''
    if (results.length === 1) return 'run complete'
    const top = Math.max(...results.map((r) => r.score))
    const leaders = results.filter((r) => r.score === top)
    if (leaders.length > 1) return leaders.some((l) => l.id === selfId) ? 'dead even' : 'a tie'
    return leaders[0].id === selfId ? 'you win' : `${leaders[0].name} wins`
  })
</script>

<div class="verdict">{verdict}</div>

<style>
  .verdict {
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
  }
</style>
