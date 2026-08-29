<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A panel anchored under whatever opened it, closing on Escape or on a click
   * outside. The backdrop is invisible and full-screen: it is the click target,
   * not a scrim, so the page behind stays readable while the panel is open.
   */
  let {
    onClose,
    align = 'center',
    width = 400,
    label,
    children,
  }: {
    onClose: () => void
    align?: 'left' | 'center' | 'right'
    width?: number
    label: string
    children: Snippet
  } = $props()
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose}></div>

<div
  class="popover surface {align}"
  style:width="{width}px"
  role="dialog"
  aria-label={label}
>
  {@render children()}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
  }
  .popover {
    position: absolute;
    top: calc(100% + 8px);
    z-index: 21;
    max-width: calc(100vw - 32px);
    padding: 14px;
    box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.28);
    text-align: left;
  }
  .left {
    left: 0;
  }
  .right {
    right: 0;
  }
  .center {
    left: 50%;
    transform: translateX(-50%);
  }
</style>
