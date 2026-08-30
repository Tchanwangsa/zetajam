<script lang="ts">
  import { CODE_LEN, cleanCode, validCode } from '../lib/room'

  /**
   * The fork in the road: start a room or join one. Two things, side by side,
   * rather than a code box that also has a "or create" link underneath it —
   * whoever is organising the game and whoever was sent the link want opposite
   * halves of this screen, and neither should have to read the other's.
   */
  let {
    name = $bindable(''),
    code = $bindable(''),
    error = '',
    joining = '',
    onCreate,
    onJoin,
    onCancel,
    onBack,
  }: {
    name?: string
    code?: string
    error?: string
    /** A code we have asked to join and not yet heard back about. */
    joining?: string
    onCreate: () => void
    onJoin: () => void
    onCancel: () => void
    onBack: () => void
  } = $props()

  let nameEl = $state<HTMLInputElement>()

  $effect(() => {
    if (!joining) nameEl?.focus()
  })

  const ready = $derived(validCode(code))
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
  <h2>play with friends</h2>

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
      <p>Make a private room, share with friends.</p>
      <button class="btn btn-primary" onclick={onCreate}>create a room</button>
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
    margin-top: 40px;
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
    margin-top: 22px;
  }

  @media (max-width: 560px) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
