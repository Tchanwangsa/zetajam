<script lang="ts">
  import { CODE_LEN, cleanCode, validCode } from '../../lib/room'

  /**
   * What counts as a code is lib/room.ts's answer, asked twice per keystroke:
   * once for what the box may contain, once for whether the button is live.
   * Both live here so the screen never has to know what a code looks like.
   */
  let {
    code = $bindable(''),
    onJoin,
  }: {
    code?: string
    onJoin: () => void
  } = $props()

  const ready = $derived(validCode(code))
</script>

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

<style>
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
  /* The box takes the row and the button takes what it needs — four characters
     is not a wide box to start with. */
  .joinrow .btn {
    flex: none;
    width: auto;
    padding: 0 16px;
  }
</style>
