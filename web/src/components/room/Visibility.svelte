<script lang="ts">
  import Segmented from '../ui/Segmented.svelte'
  import { Globe, Lock } from '@lucide/svelte'
  import { VISIBILITY } from '../ui/visibility'

  /**
   * A live setting, not a decision made on the way in: a room can go private
   * for the rematch, and the code never changes so a sent link still works.
   * Everyone sees the state, only the host a control — a switch you cannot
   * move still reads as one you might, so the rest get a flat line of type.
   */
  let {
    isPublic,
    host,
    onPublic,
  }: {
    isPublic: boolean
    host: boolean
    onPublic: (isPublic: boolean) => void
  } = $props()

</script>

{#if host}
  <Segmented
    class="vis"
    value={isPublic}
    options={VISIBILITY}
    onSelect={onPublic}
    label="who can join"
    width="220px"
  />
  <p class="vishint note">
    {isPublic
      ? 'listed on the multiplayer board — anyone can walk in'
      : 'unlisted — only people with the code can join'}
  </p>
{:else}
  <p class="vishint note tagged">
    {#if isPublic}<Globe size={12} /> public room{:else}<Lock size={12} /> private room{/if}
  </p>
{/if}

<style>
  .vishint {
    --note-size: 12px;
    margin: 8px 0 0;
  }
  .vishint.tagged {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
  }
</style>
