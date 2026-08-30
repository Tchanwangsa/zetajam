<script lang="ts">
  import type { Claim, PlayerInfo } from '../../lib/net'

  /**
   * The whole of rush in one strip. Its own component because everything here
   * moves once a question, where the equation and box change on a keystroke.
   * The bar is neither: a node driven by Game's loop, with no reactive graph.
   */
  let {
    claims = {},
    players = [],
    selfId,
    said,
    buzzed = false,
    bar = $bindable<HTMLElement | undefined>(),
  }: {
    /** Who took each slot, as the server settled it. */
    claims?: Record<number, Claim>
    /** Everyone in the run, for putting a name to a claim. */
    players?: PlayerInfo[]
    selfId: string
    /**
     * The slot the line speaks for, or -1. `Run.said`, driven by Game's frame
     * loop — it outlives its slot, which turns over in RUSH_GAP_MS.
     */
    said: number
    /** Whether you have already buzzed on the slot on screen. */
    buzzed?: boolean
    /** The bar itself, handed back so the frame loop can drain it. */
    bar?: HTMLElement
  } = $props()

  const saidBy = $derived(said >= 0 ? claims[said] : undefined)
  const saidMine = $derived(!!saidBy && saidBy.id === selfId)
  const saidName = $derived(players.find((p) => p.id === saidBy?.id)?.name ?? 'somebody')
</script>

<div class="rush" aria-live="polite">
  <div class="track" aria-hidden="true"><i bind:this={bar}></i></div>
  <div class="verdict">
    {#if saidBy}
      <span class="took" class:mine={saidMine}>
        {saidMine ? 'you got it' : `${saidName} got it`}
      </span>
    {:else if said >= 0}
      <span class="none">nobody got it</span>
    {:else if buzzed}
      <span class="pending">…</span>
    {/if}
  </div>
</div>

<style>
  .rush {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 220px;
    margin: -2vh 0 3vh;
  }
  /* How much of the five seconds is left. Driven by transform in the frame
     loop, so it costs a compositor property and nothing else. */
  .track {
    width: 100%;
    height: 3px;
    border-radius: 999px;
    background: var(--grid);
    overflow: hidden;
  }
  .track i {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
    transform-origin: left center;
    transform: scaleX(1);
  }
  /* Fixed height: the line appears and goes on every question, and the board
     must not move under the answer box when it does. */
  .verdict {
    height: 16px;
    font-size: 12px;
    line-height: 16px;
    color: var(--muted);
  }
  .took.mine {
    color: var(--accent);
  }
  .none,
  .pending {
    color: var(--faint);
  }

  @media (max-width: 520px) {
    .rush {
      width: 170px;
    }
  }
</style>
