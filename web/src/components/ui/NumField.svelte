<script lang="ts">
  import { untrack } from 'svelte'

  /**
   * A small integer input that only ever hands its parent a clamped value.
   *
   * Typing is left completely alone — writing "1" on the way to "150" must not
   * be rewritten under the cursor — so clamping happens once, on commit, which
   * is blur or Enter. Everything that takes a number in this app goes through
   * here, because the alternative was four copies of that rule and one of them
   * silently dropping the value you typed.
   */
  let {
    value,
    onCommit,
    min = 0,
    max = 9999,
    width = 58,
    label,
    disabled = false,
    autofocus = false,
  }: {
    value: number
    onCommit: (v: number) => void
    min?: number
    max?: number
    width?: number
    label: string
    disabled?: boolean
    autofocus?: boolean
  } = $props()

  // Seeded once and then owned by the keyboard — the $effect below is what
  // pulls it back in step when the value changes from somewhere else.
  let text = $state(untrack(() => String(value)))
  let el = $state<HTMLInputElement>()

  // Resync when the value changes from somewhere else — the host editing the
  // room settings, "restore defaults", a preset chip.
  $effect(() => {
    const v = value
    untrack(() => {
      if (Number(text) !== v) text = String(v)
    })
  })

  $effect(() => {
    if (autofocus) {
      el?.focus()
      el?.select()
    }
  })

  function commit() {
    const digits = text.replace(/\D/g, '')
    if (!digits) {
      text = String(value) // an empty box means "never mind", not "zero"
      return
    }
    const next = Math.min(max, Math.max(min, Number(digits)))
    text = String(next)
    if (next !== value) onCommit(next)
  }
</script>

<input
  bind:this={el}
  bind:value={text}
  class="numfield num"
  style:width="{width}px"
  onblur={commit}
  onkeydown={(e) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      text = String(value)
      e.currentTarget.blur()
    }
  }}
  oninput={(e) => (text = e.currentTarget.value.replace(/\D/g, ''))}
  inputmode="numeric"
  aria-label={label}
  {disabled}
/>

<style>
  .numfield {
    height: 30px;
    min-width: 0;
    padding: 0 6px;
    text-align: center;
    font-size: 13px;
    background: var(--bg);
    border: 1.5px solid var(--line);
    border-radius: 6px;
    outline: none;
    transition: border-color 140ms ease;
  }
  .numfield:focus {
    border-color: var(--accent);
  }
  .numfield:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
