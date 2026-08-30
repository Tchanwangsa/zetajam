<script lang="ts">
  import Pulse from '../ui/Pulse.svelte'

  /**
   * Following a room link is the join; this is only the round trip that
   * confirms it. A screen and not a state: nothing on it is also on the one it
   * replaces, and every prop the other half needs means nothing here.
   */
  let { code, onCancel }: { code: string; onCancel: () => void } = $props()
</script>

<h2>joining {code}</h2>
<div class="waiting">
  <Pulse />
  knocking on the door
</div>
<button class="btn-link back" onclick={onCancel}>cancel</button>

<style>
  .waiting {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 15px;
    margin-top: 8px;
  }
</style>
