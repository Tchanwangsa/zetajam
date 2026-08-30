<script lang="ts">
  import { Monitor, Moon, Sun } from '@lucide/svelte'

  /**
   * Three themes cycled from one button. The preference lives here because
   * nothing else reads it: it sets an attribute on <html>, and every colour
   * comes off that. See app.css.
   */
  type Theme = 'system' | 'light' | 'dark'

  const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

  let theme = $state<Theme>((localStorage.getItem('zetajam.theme') as Theme) ?? 'system')

  $effect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('zetajam.theme', theme)
  })
</script>

<button
  class="btn-icon theme"
  title="theme"
  aria-label="cycle theme"
  onclick={() => (theme = NEXT[theme])}
>
  {#if theme === 'system'}
    <Monitor size={16} />
  {:else if theme === 'light'}
    <Sun size={16} />
  {:else}
    <Moon size={16} />
  {/if}
</button>

<style>
  .theme {
    font-size: 14px;
  }
</style>
