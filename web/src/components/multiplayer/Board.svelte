<script lang="ts">
  import type { RoomBrief } from '../../lib/net'
  import RoomRow from './RoomRow.svelte'

  /**
   * The count beside the heading is of rooms you could actually walk into
   * rather than rooms on the board — four full and four open are not the
   * same news.
   */
  let {
    rooms,
    onJoinCode,
    onSpectate,
  }: {
    rooms: RoomBrief[]
    onJoinCode: (code: string) => void
    onSpectate: (code: string) => void
  } = $props()

  const open = $derived(rooms.filter((r) => !r.playing && r.members < r.max))
</script>

<div class="board">
  <div class="micro head micro-head">
    public rooms
    {#if rooms.length}<span class="micro-note num">{open.length} open</span>{/if}
  </div>
  {#if rooms.length}
    {#each rooms as r (r.code)}
      <RoomRow room={r} {onJoinCode} {onSpectate} />
    {/each}
  {:else}
    <p class="empty note">
      nobody is hosting right now — make one public and you are the first
    </p>
  {/if}
</div>

<style>
  .board {
    width: 100%;
    max-width: 560px;
    margin-top: 34px;
  }
  .head {
    margin-bottom: 8px;
  }
  .empty {
    --note-size: 13px;
    margin: 0;
    padding: 16px 0;
  }
</style>
