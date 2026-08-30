<script lang="ts" generics="T">
  import type { LucideIcon } from '@lucide/svelte'

  /**
   * A row of options with exactly one on. Plain buttons in a `role="group"`
   * rather than radios: nothing is submitted, each option acts the moment it is
   * pressed, and the group's label says what the choice is between.
   */
  type Option = { value: T; label: string; icon: LucideIcon }

  let {
    value,
    options,
    onSelect,
    label,
    /** Any CSS length. The default fills whatever it is dropped into. */
    width = '100%',
    class: klass = '',
  }: {
    value: T
    options: Option[]
    onSelect: (v: T) => void
    label: string
    width?: string
    class?: string
  } = $props()
</script>

<div class="seg {klass}" style:width role="group" aria-label={label}>
  {#each options as o (o.value)}
    {@const Icon = o.icon}
    <button class="opt" class:on={value === o.value} onclick={() => onSelect(o.value)}>
      <Icon size={13} />
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    gap: 2px;
    max-width: 100%;
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
  /* Lifted out of the track rather than merely coloured — the track is the
     recess, and the chosen option is the thing sitting on top of it. */
  .opt.on {
    background: var(--panel);
    color: var(--accent);
  }
</style>
