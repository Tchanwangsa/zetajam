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
    onCreate,
    onJoin,
    onBack,
  }: {
    name?: string
    code?: string
    error?: string
    onCreate: () => void
    onJoin: () => void
    onBack: () => void
  } = $props()

  let nameEl = $state<HTMLInputElement>()
  let codeEl = $state<HTMLInputElement>()

  // Arriving on a link means the code is already known and the name is not.
  $effect(() => {
    if (code) nameEl?.focus()
    else nameEl?.focus()
  })

  const ready = $derived(validCode(code))
</script>

<section class="mp">
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
          bind:this={codeEl}
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
