<script lang="ts">
  import { LogOut, RotateCw } from '@lucide/svelte'
  import Mark from './Mark.svelte'
  import ThemeToggle from './ThemeToggle.svelte'

  /**
   * The strip across the top. Handed the run's shape rather than the run
   * itself — all it does with any of it is choose a sentence.
   */
  let {
    /**
     * The connection, as far as the screen is concerned. 'ok' covers having no
     * socket at all, which is the lobby's normal state now — see needsHub in
     * lib/client.svelte.ts. Only a socket something wanted is worth a word.
     */
    link = 'ok',
    online = 0,
    playing = 0,
    /** The lobby is the one screen with room for both numbers. */
    lobby = false,
    canReset = false,
    canLeave = false,
    spectating = false,
    inRoom = false,
    players = 0,
    onBrand,
    onReset,
    onLeave,
  }: {
    link?: 'ok' | 'down' | 'paused'
    online?: number
    playing?: number
    lobby?: boolean
    canReset?: boolean
    canLeave?: boolean
    spectating?: boolean
    inRoom?: boolean
    players?: number
    onBrand: () => void
    onReset: () => void
    onLeave: () => void
  } = $props()

  // The only warning anyone gets that leaving ends the run for the others.
  const leaveLabel = $derived(
    spectating
      ? 'stop watching'
      : inRoom
        ? 'leave the run — back to the room'
        : players > 1
          ? 'leave the run — it ends for everyone'
          : 'leave the run',
  )
</script>

<header>
  <button class="brand" onclick={onBrand}>
    <Mark size={30} />
    zetajam
  </button>
  <div class="right num">
    {#if link === 'paused'}
      <span class="idle note">paused — click anywhere</span>
    {:else if link === 'down'}
      <span class="off note">reconnecting…</span>
    {:else if !lobby}
      <span class="stat note">{online} online</span>
    {:else}
      <span class="stat note">{online} online · {playing} playing</span>
    {/if}
    {#if canReset}
      <button class="btn-icon" title="restart (same settings)" aria-label="restart" onclick={onReset}>
        <RotateCw size={16} />
      </button>
    {/if}
    {#if canLeave}
      <button class="btn-icon leave" title={leaveLabel} aria-label={leaveLabel} onclick={onLeave}>
        <LogOut size={16} />
      </button>
    {/if}
    <ThemeToggle />
  </div>
</header>

<style>
  /* The wordmark is the title now — the lobby no longer carries one — so the
     header has to be big enough to be that rather than a strip of chrome. */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 88px;
    flex: none;
  }
  /* The mark is `currentColor` throughout, so it goes accent on hover with the
     word rather than needing a rule of its own. */
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.03em;
    color: var(--text);
    padding: 0;
    transition: color 140ms ease;
  }
  .brand:hover {
    color: var(--accent);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  /* All three are the quiet line the rest of the app calls `.note`, one size up. */
  .stat,
  .off,
  .idle {
    --note-size: 13px;
  }
  .stat {
    display: flex;
    align-items: center;
  }
  .off {
    color: var(--danger);
  }
  /* Not danger: the socket is down because we put it down. */
  .idle {
    color: var(--muted);
  }
  .leave:hover {
    color: var(--danger);
  }
</style>
