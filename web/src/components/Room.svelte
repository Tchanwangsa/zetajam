<script lang="ts">
  import type { RoomInfo } from '../lib/net'
  import { colorFor } from '../lib/players'
  import { roomLink } from '../lib/room'

  /**
   * The waiting room. Everything the host can do to the run — who is in it,
   * what it is set to, when it starts — is on this one screen, and everyone
   * else sees the same screen with the controls turned off, so nobody has to
   * be told what changed.
   */
  let {
    room,
    selfId,
    onStart,
    onKick,
    onLeave,
  }: {
    room: RoomInfo
    selfId: string
    onStart: () => void
    onKick: (id: string) => void
    onLeave: () => void
  } = $props()

  const host = $derived(room.hostId === selfId)
  const link = $derived(roomLink(room.code))
  const youIndex = $derived(room.members.findIndex((m) => m.id === selfId))

  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      return // clipboard blocked — the link is on screen to select by hand
    }
    copied = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied = false), 1600)
  }
</script>

<section class="room">
  <div class="head">
    <div class="micro">room</div>
    <div class="code num">{room.code}</div>
    <button class="btn btn-ghost btn-sm" onclick={copy}>
      {copied ? 'link copied' : 'copy link'}
    </button>
  </div>

  <div class="members">
    {#if room.members.length < 2}
      <div class="empty">
        <span class="pulse"></span>
        waiting for players — send them the link
      </div>
    {/if}

    {#each room.members as m, i (m.id)}
      <div class="member" class:you={m.id === selfId}>
        <span class="dot" style:background={colorFor(i, youIndex)}></span>
        <span class="who">{m.name}</span>
        {#if m.id === room.hostId}<span class="badge">host</span>{/if}
        {#if m.id === selfId}<span class="badge you-badge">you</span>{/if}
        {#if host && m.id !== selfId}
          <button
            class="btn-icon kick"
            title="remove {m.name} from the room"
            aria-label="remove {m.name}"
            onclick={() => onKick(m.id)}
          >
            ✕
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <div class="actions">
    {#if host}
      <button class="btn btn-primary" onclick={onStart}>
        start {room.members.length > 1 ? `— ${room.members.length} players` : 'anyway'}
      </button>
    {:else}
      <div class="waiting">waiting for {room.members.find((m) => m.id === room.hostId)?.name ?? 'the host'} to start</div>
    {/if}
    <button class="btn btn-ghost" onclick={onLeave}>leave</button>
  </div>
</section>

<style>
  .room {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    padding-top: 3vh;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .code {
    font-size: 2.2rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    line-height: 1.1;
  }

  .members {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 320px;
    max-width: 100%;
    margin-top: 26px;
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
  .pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    animation: breathe 1.6s ease-in-out infinite;
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.25;
    }
    50% {
      opacity: 1;
    }
  }

  .member {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 14px;
  }
  .member.you {
    background: var(--grid);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
  }
  .who {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .you-badge {
    color: var(--accent);
  }
  .kick:hover {
    color: var(--danger);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 24px;
  }
  .waiting {
    font-size: 13px;
    color: var(--muted);
  }
</style>
