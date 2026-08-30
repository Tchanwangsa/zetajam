<script lang="ts">
  import type { RoomGame } from '../../lib/net'
  import { digest } from '../../lib/session'
  import Heads from './Heads.svelte'
  import Runs from './Runs.svelte'

  /**
   * The room's log in the two shapes it gets asked for out loud — *am I up on
   * her*, and *what happened just now*. On the room screen too, so standings
   * are there while everyone decides whether to go again. lib/session.ts reads
   * it once: both halves want the same walk, so the digest stays above them.
   */
  let {
    log = [],
    selfId,
    /** The room screen has the space for every run; the end screen does not. */
    limit = 0,
  }: {
    log?: RoomGame[]
    selfId: string
    limit?: number
  } = $props()

  const s = $derived(digest(log, selfId))
</script>

{#if s.runs.length}
  <section class="session">
    <Heads heads={s.heads} total={s.runs.length} />
    <Runs runs={s.runs} {limit} />
  </section>
{/if}

<style>
  /* Centres itself rather than being centred: both screens that show it were
     declaring the same flex row. The gap above stays theirs, being different. */
  .session {
    width: 420px;
    max-width: 100%;
    margin: 0 auto;
    text-align: left;
  }
</style>
