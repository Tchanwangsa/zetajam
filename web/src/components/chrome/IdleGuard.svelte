<script lang="ts">
  /**
   * The last word before the socket goes down. Only a tab somebody could be
   * looking at ever sees this: a hidden one goes quiet unannounced, because
   * there would be nobody to read it.
   */
  let {
    left = 0,
    inRoom = false,
    onStay,
  }: {
    /** Seconds left. Counted down by the app, not by this. */
    left?: number
    /** Going quiet means leaving the room, so say so before it happens. */
    inRoom?: boolean
    onStay: () => void
  } = $props()
</script>

<div class="scrim"></div>

<div class="box surface" role="dialog" aria-label="still there?">
  <p class="title">still there?</p>
  <p class="note">no sign of you for a while — this tab goes quiet in</p>
  <p class="count num">{left}</p>
  {#if inRoom}
    <p class="note">and leaves the room</p>
  {/if}
  <!-- svelte-ignore a11y_autofocus -->
  <button class="btn btn-primary" autofocus onclick={onStay}>i'm here</button>
</div>

<style>
  /* A scrim, unlike the popover's invisible backdrop: this one is an
     interruption and should read as one. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: color-mix(in srgb, var(--bg) 78%, transparent);
    backdrop-filter: blur(2px);
  }
  .box {
    position: fixed;
    z-index: 41;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    max-width: calc(100vw - 32px);
    padding: 26px 22px;
    text-align: center;
    box-shadow: 0 18px 44px -14px rgba(0, 0, 0, 0.34);
  }
  .title {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .note {
    color: var(--muted);
    font-size: 13px;
    margin-top: 8px;
  }
  /* The one number on screen, so it carries the urgency the copy does not. */
  .count {
    font-size: 40px;
    font-weight: 600;
    line-height: 1.1;
    margin-top: 6px;
    font-variant-numeric: tabular-nums;
  }
  .box .btn {
    width: 100%;
    margin-top: 18px;
  }
</style>
