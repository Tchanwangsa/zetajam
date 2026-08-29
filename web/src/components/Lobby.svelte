<script lang="ts">
  import type { GameInfo, MatchResult } from '../lib/net'

  let {
    name = $bindable(''),
    games = [],
    best,
    queued = false,
    onPlay,
    onSolo,
    onFriends,
    onSpectate,
    onCancel,
  }: {
    name?: string
    games?: GameInfo[]
    best?: MatchResult
    queued?: boolean
    onPlay: () => void
    onSolo: () => void
    onFriends: () => void
    onSpectate: (id: string) => void
    onCancel: () => void
  } = $props()

  let input = $state<HTMLInputElement>()
  $effect(() => input?.focus())
</script>

<section class="lobby">
  <h1>zetajam</h1>
  <p class="tag">mental arithmetic, head to head</p>

  {#if queued}
    <div class="queued">
      <span class="pulse"></span>
      looking for an opponent on these settings
    </div>
    <button class="btn btn-ghost" onclick={onCancel}>play alone instead</button>
  {:else}
    <input
      class="field name"
      bind:this={input}
      bind:value={name}
      onkeydown={(e) => e.key === 'Enter' && onPlay()}
      placeholder="your name"
      maxlength="20"
      autocomplete="off"
      spellcheck="false"
      aria-label="your name"
    />
    <div class="actions">
      <button class="btn btn-primary" onclick={onPlay}>find a match</button>
      <button class="btn btn-ghost" onclick={onFriends}>play with friends</button>
      <button class="btn btn-ghost" onclick={onSolo}>practice solo</button>
    </div>
  {/if}

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
  .lobby {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding-top: 6vh;
  }
  h1 {
    font-size: 2.4rem;
    font-weight: 600;
    letter-spacing: -0.04em;
    margin: 0;
  }
  .tag {
    color: var(--muted);
    margin: 6px 0 36px;
    font-size: 14px;
  }
  .name {
    width: 260px;
    max-width: 100%;
    height: 48px;
    text-align: center;
    font-size: 17px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 14px;
  }

  .queued {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 15px;
    margin-bottom: 18px;
  }
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: breathe 1.6s ease-in-out infinite;
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.25;
    }
    50% {
      opacity: 1;
    }
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
