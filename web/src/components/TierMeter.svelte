<script lang="ts">
  import { TIERS } from '../lib/config'

  /**
   * Which rung of the ramp you are on, while you are on it.
   *
   * A ramp run changes the numbers under you without saying so, which reads as
   * the generator being erratic rather than as a difficulty curve — the run
   * looks identical to a classic one until you notice the terms have grown.
   * This says which rung you are on and nothing else: the run already has one
   * clock in it, and counting down to the next step up puts a second one on
   * the board.
   */
  let { tier = 0 }: { tier?: number } = $props()
</script>

<div class="meter num" aria-label="ramp difficulty, tier {tier + 1} of {TIERS.length}">
  <span class="rungs" aria-hidden="true">
    {#each TIERS as _, k (k)}
      <i class:on={k <= tier} class:cur={k === tier}></i>
    {/each}
  </span>
  <span class="lbl">tier {tier + 1}</span>
</div>

<style>
  .meter {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--muted);
  }

  /* Three filled-in bars rather than "2/3" — the shape of the ramp is the
     information, and it is readable without being read. */
  .rungs {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }
  .rungs i {
    display: block;
    width: 4px;
    border-radius: 1px;
    background: var(--line);
    transition: background 200ms ease;
  }
  .rungs i:nth-child(1) {
    height: 6px;
  }
  .rungs i:nth-child(2) {
    height: 9px;
  }
  .rungs i:nth-child(3) {
    height: 12px;
  }
  .rungs i.on {
    background: color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .rungs i.cur {
    background: var(--accent);
  }

  .lbl {
    color: var(--accent);
  }

  @media (max-width: 520px) {
    .meter {
      font-size: 11px;
    }
  }
</style>
