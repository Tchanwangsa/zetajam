<script lang="ts">
  import { roomLink } from '../../lib/room'

  /**
   * The button says what it did in place rather than throwing a toast. A
   * refused clipboard says nothing at all — the link is spelled out beside it,
   * and selecting it by hand is a fine fallback.
   */
  let { code }: { code: string } = $props()

  const link = $derived(roomLink(code))

  let copied = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      return // clipboard blocked — the link is on screen to select by hand
    }
    copied = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copied = false), 1600)
  }
</script>

<div class="head">
  <div class="micro">room</div>
  <div class="code num">{code}</div>
  <button class="btn btn-ghost btn-sm" onclick={copy}>
    {copied ? 'link copied' : 'copy link'}
  </button>
</div>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .code {
    font-size: 2.2rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    line-height: 1.1;
  }
</style>
