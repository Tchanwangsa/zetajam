<script lang="ts">
  import type { RoomBrief } from '../lib/net'
  import { summary } from '../lib/config'
  import { CODE_LEN, cleanCode, validCode } from '../lib/room'
  import { Globe, Lock } from '@lucide/svelte'

  /**
   * One screen for every way of playing against somebody. There used to be two
   * — a queue that paired you with a stranger on matching settings, and a
   * private room you shared a code for — and they were the same thing wearing
   * different clothes: a group, a config, and somebody who says go. So there is
   * one room now, and `public` is the only knob. Public rooms sit on the board
   * below for anyone to walk into; private ones are reachable only by code.
   *
   * The queue is gone with it. Waiting on a stranger whose settings happened to
   * match yours told you nothing while you waited and often never resolved. A
   * board of real rooms you can read the settings off before joining answers
   * the same question — who can I play right now — out loud.
   */
  let {
    name = $bindable(''),
    code = $bindable(''),
    rooms = [],
    error = '',
    joining = '',
    onCreate,
    onJoin,
    onJoinCode,
    onCancel,
    onBack,
  }: {
    name?: string
    code?: string
    rooms?: RoomBrief[]
    error?: string
    /** A code we have asked to join and not yet heard back about. */
    joining?: string
    onCreate: (isPublic: boolean) => void
    onJoin: () => void
    onJoinCode: (code: string) => void
    onCancel: () => void
    onBack: () => void
  } = $props()

  let nameEl = $state<HTMLInputElement>()
  // What the next room you make will be. Remembered, because whoever runs
  // public rooms runs public rooms.
  let isPublic = $state(localStorage.getItem('zetajam.public') !== '0')
  $effect(() => localStorage.setItem('zetajam.public', isPublic ? '1' : '0'))

  $effect(() => {
    if (!joining) nameEl?.focus()
  })

  const ready = $derived(validCode(code))
  const open = $derived(rooms.filter((r) => !r.playing && r.members < r.max))
</script>

<section class="mp">
{#if joining}
  <!-- Following a room link is the join. This screen exists only for the round
       trip that confirms it, so it says which room and offers the way out. -->
  <h2>joining {joining}</h2>
  <div class="waiting">
    <span class="pulse"></span>
    knocking on the door
  </div>
  <button class="btn-link back" onclick={onCancel}>cancel</button>
{:else}
  <h2>multiplayer</h2>

  <input
    class="field name"
    bind:this={nameEl}
    bind:value={name}
    placeholder="your name"
    maxlength="20"
    autocomplete="off"
    spellcheck="false"
    aria-label="your name"
  />

  <div class="cards">
    <div class="card surface">
      <div class="micro">start one</div>
      <!-- The toggle is above the button rather than inside a settings panel:
           it changes what the button makes, so it has to be read first. -->
      <div class="seg" role="group" aria-label="who can join">
        <button class="opt" class:on={isPublic} onclick={() => (isPublic = true)}>
          <Globe size={13} /> public
        </button>
        <button class="opt" class:on={!isPublic} onclick={() => (isPublic = false)}>
          <Lock size={13} /> private
        </button>
      </div>
      <p>
        {isPublic
          ? 'Listed below for anyone to join. You host, you set the rules.'
          : 'Reachable only by its code. Share the link with friends.'}
      </p>
      <button class="btn btn-primary" onclick={() => onCreate(isPublic)}>create a room</button>
    </div>

    <div class="card surface">
      <div class="micro">join one</div>
      <p>Enter room code from your friends.</p>
      <div class="joinrow">
        <input
          class="field code num"
          value={code}
          oninput={(e) => (code = cleanCode(e.currentTarget.value))}
          onkeydown={(e) => e.key === 'Enter' && ready && onJoin()}
          placeholder="ABCD"
          maxlength={CODE_LEN}
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          aria-label="room code"
        />
        <button class="btn btn-primary" onclick={onJoin} disabled={!ready}>join</button>
      </div>
    </div>
  </div>

  {#if error}
    <p class="err">{error}</p>
  {/if}

  <div class="board">
    <div class="micro head">
      public rooms
      {#if rooms.length}<span class="count num">{open.length} open</span>{/if}
    </div>
    {#if rooms.length}
      {#each rooms as r (r.code)}
        <button
          class="row"
          disabled={r.playing || r.members >= r.max}
          onclick={() => onJoinCode(r.code)}
        >
          <span class="rcode num">{r.code}</span>
          <span class="rhost">{r.host}</span>
          <span class="rcfg num">{summary(r.cfg)}</span>
          <span class="rsize num" class:full={r.members >= r.max}>{r.members}/{r.max}</span>
          <span class="rstate">{r.playing ? 'in a run' : r.members >= r.max ? 'full' : 'join'}</span>
        </button>
      {/each}
    {:else}
      <p class="empty">
        nobody is hosting right now — make one public and you are the first
      </p>
    {/if}
  </div>

  <button class="btn-link back" onclick={onBack}>back</button>
{/if}
</section>

<style>
  .mp {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding-top: 4vh;
  }
  h2 {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    margin: 0 0 20px;
  }
  .name {
    width: 260px;
    max-width: 100%;
    text-align: center;
    font-size: 16px;
  }

  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 32px;
    width: 100%;
    max-width: 560px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    text-align: left;
  }
  .card p {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.45;
    flex: 1;
  }
  .card .btn {
    width: 100%;
  }

  .seg {
    display: flex;
    gap: 2px;
    width: 100%;
    padding: 2px;
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

  .joinrow {
    display: flex;
    gap: 8px;
    width: 100%;
  }
  .code {
    width: 100%;
    min-width: 0;
    text-align: center;
    font-size: 18px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    background: var(--bg);
  }
  .joinrow .btn {
    flex: none;
    width: auto;
    padding: 0 16px;
  }

  /* The board. Five columns that always line up, so scanning it is scanning
     one column at a time — who, on what, how many — not five little cards. */
  .board {
    width: 100%;
    max-width: 560px;
    margin-top: 34px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .count {
    color: var(--faint);
    text-transform: none;
    letter-spacing: 0;
  }
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto auto 3.2rem;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--muted);
    text-align: left;
    transition: background 120ms ease, color 120ms ease;
  }
  .row:hover:not(:disabled) {
    background: var(--panel);
    color: var(--text);
  }
  .row:disabled {
    cursor: default;
    color: var(--faint);
  }
  .rcode {
    letter-spacing: 0.14em;
    font-weight: 600;
    color: var(--text);
  }
  .row:disabled .rcode {
    color: var(--faint);
  }
  .rhost,
  .rcfg {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rcfg,
  .rsize {
    color: var(--faint);
  }
  .rsize.full {
    color: var(--danger);
  }
  .rstate {
    text-align: right;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .row:hover:not(:disabled) .rstate {
    color: var(--accent);
  }
  .empty {
    margin: 0;
    padding: 16px 0;
    font-size: 13px;
    color: var(--faint);
  }

  .waiting {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 15px;
    margin-top: 8px;
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

  .err {
    color: var(--danger);
    font-size: 13px;
    margin: 16px 0 0;
  }
  .back {
    margin-top: 26px;
  }

  @media (max-width: 560px) {
    .cards {
      grid-template-columns: 1fr;
    }
    .row {
      grid-template-columns: auto 1fr auto;
    }
    .rcfg {
      display: none;
    }
  }
</style>
