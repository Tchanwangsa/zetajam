<script lang="ts">
  import type { RoomInfo } from '../lib/net'
  import { colorFor } from '../lib/players'
  import { roomLink } from '../lib/room'
  import { Globe, Lock } from '@lucide/svelte'

  /**
   * The waiting room. Everything the host can do to the run — who is in it,
   * what it is set to, when it starts — is on this one screen, and everyone
   * else sees the same screen with the controls turned off, so nobody has to
   * be told what changed.
   */
  let {
    room,
    selfId,
    onRename,
    onStart,
    onKick,
    onLeave,
    onPublic,
  }: {
    room: RoomInfo
    selfId: string
    onRename: (name: string) => void
    onStart: () => void
    onKick: (id: string) => void
    onLeave: () => void
    onPublic: (isPublic: boolean) => void
  } = $props()

  const host = $derived(room.hostId === selfId)
  const link = $derived(roomLink(room.code))
  const youIndex = $derived(room.members.findIndex((m) => m.id === selfId))

  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  // Your own row is the name field. Anyone who arrived on a link went straight
  // past the lobby's, so without this they are `guest` for the whole evening —
  // and it reads as what it is, the line with your name on it.
  const you = $derived(room.members.find((m) => m.id === selfId))

  // Written to by hand rather than bound. A room frame arrives every time
  // anyone joins, leaves or changes a setting, and a bound value would wipe
  // half-typed text on every one of them.
  let nameEl = $state<HTMLInputElement>()
  $effect(() => {
    const server = you?.name ?? ''
    if (nameEl && document.activeElement !== nameEl) nameEl.value = server
  })

  function rename(next: string) {
    const clean = next.trim().slice(0, 20)
    if (clean && clean !== you?.name) onRename(clean)
    else if (nameEl) nameEl.value = you?.name ?? '' // blanked, or unchanged
  }

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

  <!-- Visibility is a live setting, not a decision you made once on the way
       in: a room that filled up from the board can go private for the rematch,
       and a private one can open its doors when the group is short a player.
       The code never changes either way, so a link already sent still works. -->
  {#if host}
    <div class="vis seg" role="group" aria-label="who can join">
      <button class="opt" class:on={room.public} onclick={() => onPublic(true)}>
        <Globe size={13} /> public
      </button>
      <button class="opt" class:on={!room.public} onclick={() => onPublic(false)}>
        <Lock size={13} /> private
      </button>
    </div>
    <p class="vishint">
      {room.public
        ? 'listed on the multiplayer board — anyone can walk in'
        : 'unlisted — only people with the code can join'}
    </p>
  {:else}
    <p class="vishint tagged">
      {#if room.public}<Globe size={12} /> public room{:else}<Lock size={12} /> private room{/if}
    </p>
  {/if}

  <div class="members">
    {#if room.members.length < 2}
      <div class="empty">
        <span class="pulse"></span>
        {room.public
          ? 'waiting for players — the board is showing this room'
          : 'waiting for players — send them the link'}
      </div>
    {/if}

    {#each room.members as m, i (m.id)}
      <div class="member" class:you={m.id === selfId}>
        <span class="dot" style:background={colorFor(i, youIndex)}></span>
        {#if m.id === selfId}
          <input
            class="who mine"
            bind:this={nameEl}
            placeholder="your name"
            maxlength="20"
            autocomplete="off"
            spellcheck="false"
            aria-label="your name"
            onblur={(e) => rename(e.currentTarget.value)}
            onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        {:else}
          <span class="who">{m.name}</span>
        {/if}
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

  .vis {
    display: flex;
    gap: 2px;
    width: 220px;
    max-width: 100%;
    padding: 2px;
    margin-top: 16px;
    border-radius: 8px;
    background: var(--grid);
  }
  .opt {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    flex: 1;
    height: 28px;
    border-radius: 6px;
    font-size: 12px;
    color: var(--muted);
    transition: background 140ms ease, color 140ms ease;
  }
  .opt:hover {
    color: var(--text);
  }
  .opt.on {
    background: var(--panel);
    color: var(--accent);
  }
  .vishint {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--faint);
  }
  .vishint.tagged {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
  }

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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Looks like the text beside it until you go near it — the row is a roster
     first and a form second. */
  .who.mine {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    border-bottom: 1px dashed transparent;
    border-radius: 0;
    padding: 0;
    height: auto;
    outline: none;
    transition: border-color 140ms ease;
  }
  .who.mine:hover {
    border-bottom-color: var(--line);
  }
  .who.mine:focus {
    border-bottom-color: var(--accent);
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
