<script lang="ts">
  import type { RoomBrief } from '../../lib/net'
  import { summary } from '../../lib/config'

  /**
   * Five columns that always line up, so scanning is one column at a time. A
   * shut room stays on the board — it still answers who is playing what — so
   * saying why it is shut is part of drawing a row, not an exception to it.
   *
   * A room mid-run is not shut any more: the door is, but the window is not,
   * and the last column says which of the two this row opens. That is the only
   * way in to watching somebody play — see Hub.spectate in server/hub.go.
   */
  let {
    room,
    onJoinCode,
    onSpectate,
  }: {
    room: RoomBrief
    onJoinCode: (code: string) => void
    onSpectate: (code: string) => void
  } = $props()

  const full = $derived(room.members >= room.max)
  const shut = $derived(full && !room.playing)
  const title = $derived(
    room.playing ? 'a run is on — watch it' : full ? 'room is full' : 'join this room',
  )
</script>

<button
  class="row listrow"
  disabled={shut}
  {title}
  onclick={() => (room.playing ? onSpectate(room.code) : onJoinCode(room.code))}
>
  <span class="rcode num">{room.code}</span>
  <span class="trunc">{room.host}</span>
  <span class="rcfg num trunc">{summary(room.cfg)}</span>
  <span class="rsize num" class:full>{room.members}/{room.max}</span>
  <span class="rstate tag">{room.playing ? 'watch' : full ? 'full' : 'join'}</span>
</button>

<style>
  .row {
    display: grid;
    grid-template-columns: auto 1fr auto auto 3.2rem;
    align-items: center;
    gap: 12px;
    text-align: left;
  }
  .rcode {
    letter-spacing: 0.14em;
    font-weight: 600;
    color: var(--text);
  }
  .row:disabled .rcode {
    color: var(--faint);
  }
  .rcfg,
  .rsize {
    color: var(--faint);
  }
  .rsize.full {
    color: var(--danger);
  }
  .rstate {
    --tag-size: 11px;
    text-align: right;
  }
  .row:hover:not(:disabled) .rstate {
    color: var(--accent);
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: auto 1fr auto;
    }
    .rcfg {
      display: none;
    }
  }
</style>
