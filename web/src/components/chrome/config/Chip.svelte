<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * The variants are shapes rather than styles — a mode chip carries an icon
   * beside its word, an operation chip needs its own width so + and × keep the
   * same pitch. `on` is separate from `pressed`: the wrench lights while its
   * panel is open, which is not a choice to announce.
   */
  let {
    on = false,
    variant,
    pressed,
    expanded,
    label,
    title,
    disabled = false,
    onclick,
    children,
  }: {
    on?: boolean
    variant?: 'mode' | 'glyph'
    pressed?: boolean
    expanded?: boolean
    label?: string
    title?: string
    disabled?: boolean
    onclick: () => void
    children: Snippet
  } = $props()
</script>

<button
  class="item"
  class:on
  class:mode={variant === 'mode'}
  class:glyph={variant === 'glyph'}
  aria-pressed={pressed}
  aria-expanded={expanded}
  aria-label={label}
  {title}
  {onclick}
  {disabled}
>
  {@render children()}
</button>

<style>
  .item {
    height: 28px;
    padding: 0 10px;
    border-radius: 999px;
    color: var(--muted);
    line-height: 1;
    transition: color 120ms ease, background 120ms ease;
  }
  .item:hover:not(:disabled) {
    color: var(--text);
  }
  .item.on {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .item:disabled {
    cursor: default;
  }

  .mode {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .glyph {
    font-size: 15px;
    min-width: 32px;
  }

  @media (max-width: 560px) {
    .item {
      padding: 0 8px;
    }
  }
</style>
