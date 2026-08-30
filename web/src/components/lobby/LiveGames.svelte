<script lang="ts">
  import type { GameInfo } from '../../lib/net'

  /**
   * An empty server is the normal case, so emptiness is answered here by
   * drawing nothing rather than by the screen above.
   */
  let {
    games,
    onSpectate,
  }: {
    games: GameInfo[]
    onSpectate: (id: string) => void
  } = $props()
</script>

{#if games.length}
  <div class="spectate">
    <div class="micro head">live now</div>
    {#each games as g (g.id)}
      <button class="row listrow num" onclick={() => onSpectate(g.id)}>
        <span class="who trunc">{g.names.join(' · ')}</span>
        <span class="sc">{g.scores.join(' – ')}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .spectate {
    margin-top: 28px;
    width: 320px;
    max-width: 100%;
  }
  .head {
    margin-bottom: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .who {
    text-align: left;
  }
  .sc {
    color: var(--faint);
    flex: none;
  }
</style>
