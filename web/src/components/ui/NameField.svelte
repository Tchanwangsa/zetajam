<script lang="ts">
  /**
   * Two screens use it and they are the same box — same width, same twenty
   * characters, and above all the same screen reader label, which is the part
   * that would have drifted. The lobby's is a shade taller, the only reason
   * size is a prop; Enter is a prop because only one has somewhere to go.
   */
  let {
    value = $bindable(''),
    height = 44,
    fontSize = 16,
    onEnter,
    autofocus = false,
    class: klass = '',
  }: {
    value?: string
    height?: number
    fontSize?: number
    onEnter?: () => void
    autofocus?: boolean
    class?: string
  } = $props()

  let el = $state<HTMLInputElement>()

  $effect(() => {
    if (autofocus) el?.focus()
  })
</script>

<input
  class="namefield field {klass}"
  bind:this={el}
  bind:value
  style:height="{height}px"
  style:font-size="{fontSize}px"
  onkeydown={(e) => e.key === 'Enter' && onEnter?.()}
  placeholder="your name"
  maxlength="20"
  autocomplete="off"
  spellcheck="false"
  aria-label="your name"
/>

<style>
  .namefield {
    width: 260px;
    max-width: 100%;
    text-align: center;
  }
</style>
