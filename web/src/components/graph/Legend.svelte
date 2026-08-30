<script lang="ts">
  import type { Seat } from '../../lib/players'

  /**
   * Which line is whose. The key appears only with more than one line; the
   * unit stays either way — it belongs to the y axis, not to the key.
   */
  let { seats = [] }: { seats?: Seat[] } = $props()
</script>

<div class="legend num">
  {#if seats.length > 1}
    {#each seats as s (s.id)}
      <span class="key" style:--dot={s.color}>{s.you ? 'you' : s.name}</span>
    {/each}
  {/if}
  <span class="unit">answers</span>
</div>

<style>
  .legend {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px 14px;
    max-width: 70%;
    font-size: 11px;
    color: var(--muted);
    /* It floats over the plot; without this it would eat the hover in the
       top-right corner of the graph. */
    pointer-events: none;
  }
  .key::before {
    content: '';
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 5px;
    vertical-align: middle;
    background: var(--dot);
  }
  .unit {
    color: var(--g-tick);
  }
</style>
