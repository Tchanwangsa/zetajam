<script lang="ts">
  import type { GameInfo, MatchResult } from '../lib/net'

  let {
    name = $bindable(''),
    games = [],
    best,
    onMulti,
    onSolo,
    onSpectate,
  }: {
    name?: string
    games?: GameInfo[]
    best?: MatchResult
    onMulti: () => void
    onSolo: () => void
    onSpectate: (id: string) => void
  } = $props()

  let input = $state<HTMLInputElement>()
  $effect(() => input?.focus())
</script>

<section class="lobby">
  <input
    class="field name"
    bind:this={input}
    bind:value={name}
    onkeydown={(e) => e.key === 'Enter' && onMulti()}
    placeholder="your name"
    maxlength="20"
    autocomplete="off"
    spellcheck="false"
    aria-label="your name"
  />
  <!-- Two doors, not three. Playing against somebody is one thing now — a
       room, public or private — and the choice between those belongs on the
       screen where you make one, not here. -->
  <div class="actions">
    <button class="btn btn-primary" onclick={onMulti}>multiplayer</button>
    <button class="btn btn-ghost" onclick={onSolo}>practice solo</button>
  </div>

  {#if best}
    <p class="best num">best today — <strong>{best.score}</strong> by {best.name}</p>
  {/if}

  {#if games.length}
    <div class="spectate">
      <div class="micro head">live now</div>
      {#each games as g (g.id)}
        <button class="row num" onclick={() => onSpectate(g.id)}>
          <span class="who">{g.names.join(' · ')}</span>
          <span class="sc">{g.scores.join(' – ')}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  /* The wordmark lives in the header now, so there is no title to sit under —
     the name field is the first thing on the screen and the top padding is
     what keeps it off the settings bar. */
  .lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding-top: 14vh;
  }
  .name {
    width: 260px;
    max-width: 100%;
    height: 48px;
    text-align: center;
    font-size: 17px;
  }

  /* One column, one width. Side by side these read as a row of equals; stacked
     and matched to the field above them, the primary one is plainly first. */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 260px;
    max-width: 100%;
    margin-top: 12px;
  }
  .actions :global(.btn) {
    width: 100%;
  }

  .best {
    color: var(--muted);
    font-size: 13px;
    margin-top: 32px;
  }
  .best strong {
    color: var(--text);
    font-weight: 600;
  }

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
    width: 100%;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--muted);
    transition: background 120ms ease, color 120ms ease;
  }
  .row:hover {
    background: var(--panel);
    color: var(--text);
  }
  .who {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sc {
    color: var(--faint);
    flex: none;
  }
</style>
