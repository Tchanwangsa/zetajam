<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * One of the bar's pills. All three have to be indistinguishable — that is
   * what makes the bar read as one object rather than three widgets. The label
   * is not decoration: the lobby's pointers find a block by name and aim at
   * whichever control inside says it is pressed. See lobby/Hints.svelte.
   */
  let { label, children }: { label: string; children: Snippet } = $props()
</script>

<div class="block" role="group" aria-label={label}>
  {@render children()}
</div>

<style>
  .block {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px 8px;
    border-radius: 999px;
    background: var(--grid);
  }
</style>
