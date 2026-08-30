<script lang="ts">
  import Dot from '../ui/Dot.svelte'

  /**
   * Anyone who arrived on a link went straight past the lobby's field, so
   * without this they are `guest` all evening. Your own row *is* the field,
   * rather than a form bolted under the roster.
   */
  let {
    name,
    color,
    you,
    isHost,
    canKick,
    onRename,
    onKick,
  }: {
    name: string
    color: string
    /** This row is yours, which is what turns the name into an input. */
    you: boolean
    /** This member is the host. Not the same question as `canKick`. */
    isHost: boolean
    canKick: boolean
    onRename: (name: string) => void
    onKick: () => void
  } = $props()

  // Written by hand rather than bound: a room frame arrives on every join,
  // leave and setting change, and a bound value would wipe half-typed text.
  let nameEl = $state<HTMLInputElement>()
  $effect(() => {
    const server = name
    if (nameEl && document.activeElement !== nameEl) nameEl.value = server
  })

  function rename(next: string) {
    const clean = next.trim().slice(0, 20)
    if (clean && clean !== name) onRename(clean)
    else if (nameEl) nameEl.value = name // blanked, or unchanged
  }
</script>

<div class="member roster" class:you>
  <Dot {color} size={8} />
  {#if you}
    <input
      class="who mine roster-name trunc"
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
    <span class="who roster-name trunc">{name}</span>
  {/if}
  {#if isHost}<span class="tag">host</span>{/if}
  {#if you}<span class="tag you-badge">you</span>{/if}
  {#if canKick}
    <button
      class="btn-icon kick"
      title="remove {name} from the room"
      aria-label="remove {name}"
      onclick={onKick}
    >
      ✕
    </button>
  {/if}
</div>

<style>
  .member {
    padding: 9px 12px;
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
  .you-badge {
    color: var(--accent);
  }
  .kick:hover {
    color: var(--danger);
  }
</style>
