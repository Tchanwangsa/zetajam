<script lang="ts">
  import type { PlayerInfo } from '../../lib/net'
  import { colorFor } from '../../lib/players'
  import MemberRow from './MemberRow.svelte'
  import Pulse from '../ui/Pulse.svelte'

  /**
   * Who is in the room, in the server's order. The order is the point: seat one
   * is seat one on the graph too, so a roster that sorted itself would quietly
   * relabel everybody's line. It holds its height while empty, or the start
   * button walks down the screen every time somebody joins.
   */
  let {
    members,
    selfId,
    hostId,
    host,
    isPublic,
    onRename,
    onKick,
  }: {
    members: PlayerInfo[]
    selfId: string
    hostId: string
    /** You are the host, which is what puts a kick button on everyone else. */
    host: boolean
    isPublic: boolean
    onRename: (name: string) => void
    onKick: (id: string) => void
  } = $props()

  const youIndex = $derived(members.findIndex((m) => m.id === selfId))
</script>

<div class="members">
  {#if members.length < 2}
    <div class="empty">
      <Pulse />
      {isPublic
        ? 'waiting for players — the board is showing this room'
        : 'waiting for players — send them the link'}
    </div>
  {/if}

  {#each members as m, i (m.id)}
    <MemberRow
      name={m.name}
      color={colorFor(i, youIndex)}
      you={m.id === selfId}
      isHost={m.id === hostId}
      canKick={host && m.id !== selfId}
      {onRename}
      onKick={() => onKick(m.id)}
    />
  {/each}
</div>

<style>
  .members {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 320px;
    max-width: 100%;
    margin-top: 22px;
    min-height: 140px;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 18px 0;
    color: var(--muted);
    font-size: 13px;
  }
</style>
