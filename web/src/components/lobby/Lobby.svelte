<script lang="ts">
  import type { GameInfo, MatchResult } from '../../lib/net'
  import NameField from '../ui/NameField.svelte'
  import Hints from './Hints.svelte'
  import LiveGames from './LiveGames.svelte'
  import Welcome from './Welcome.svelte'

  /**
   * The first screen. The settings-bar pointers are drawn from here because
   * they only appear on this screen; whether they are welcome is a fact only
   * the app knows, so it arrives as a prop.
   */
  let {
    name = $bindable(''),
    games = [],
    best,
    hints = false,
    onMulti,
    onSolo,
    onSpectate,
  }: {
    name?: string
    games?: GameInfo[]
    best?: MatchResult
    /** Draw the pointers at the settings bar — see Hints.svelte. */
    hints?: boolean
    onMulti: () => void
    onSolo: () => void
    onSpectate: (id: string) => void
  } = $props()
</script>

<section class="lobby screen">
  <Welcome />

  <NameField bind:value={name} onEnter={onMulti} autofocus height={48} fontSize={17} class="name" />
  <!-- Two doors, not three. Playing against somebody is one thing now — a room,
       public or private — and that choice belongs where you make it. -->
  <div class="actions">
    <button class="btn btn-primary" onclick={onMulti}>multiplayer</button>
    <button class="btn btn-ghost" onclick={onSolo}>practice solo</button>
  </div>

  {#if best}
    <p class="best num">best today — <strong>{best.score}</strong> by {best.name}</p>
  {/if}

  <LiveGames {games} {onSpectate} />
</section>

<!-- Beside the column, not in it: the pointers are a fixed layer over the whole
     page, and must not inherit the centring every line in the lobby gets. -->
{#if hints}
  <Hints />
{/if}

<style>
  /* The deepest drop of any screen: a greeting, a name and two buttons can
     afford to start low, and starting low keeps the banner off the bar. */
  .lobby {
    --screen-pad: 9vh;
    text-align: center;
  }

  /* Svelte does not put its scope on a class it only hands to a component,
     hence this `:global` hop and the one `.actions` makes below. */
  .lobby :global(.name) {
    margin-top: 34px;
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
</style>
