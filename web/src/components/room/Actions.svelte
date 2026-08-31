<script lang="ts">
  import type { PlayerInfo } from '../../lib/net'

  /**
   * Only the host can start; everyone else gets a line naming whose decision it
   * is rather than a dead button, which is a thing you keep pressing. The head
   * count goes on the host's button — starting while somebody is still typing
   * their name in is the mistake this screen exists to prevent.
   */
  let {
    members,
    hostId,
    host,
    onStart,
    onLeave,
  }: {
    members: PlayerInfo[]
    hostId: string
    host: boolean
    onStart: () => void
    onLeave: () => void
  } = $props()
</script>

<div class="actions">
  {#if host}
    <button class="btn btn-primary" onclick={onStart}>
      start {members.length > 1 ? `— ${members.length} players` : 'anyway'}
    </button>
  {:else}
    <div class="waiting">waiting for {members.find((m) => m.id === hostId)?.name ?? 'the host'} to start</div>
  {/if}
  <button class="btn btn-ghost" onclick={onLeave}>leave</button>
</div>

<style>
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 24px;
  }
  .waiting {
    font-size: 13px;
    color: var(--muted);
  }
</style>
