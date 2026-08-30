<script lang="ts">
  import type { Client } from '../../lib/client.svelte'
  import ConfigBar from './config/ConfigBar.svelte'

  /**
   * Whose settings the bar is showing. ConfigBar only knows how to draw a
   * config and hand back a new one; which config, and whether you may touch
   * it, depends on the whole client state — so that lives here, between them.
   */
  let { client }: { client: Client } = $props()

  /**
   * The config in force, not the one this browser saved: the host's in a room,
   * the server's normalized copy during a match — results included, since
   * snapping back would caption those scores with numbers nobody played under.
   */
  const cfg = $derived(
    client.phase === 'room' && client.room
      ? client.room.cfg
      : (client.phase === 'match' || client.phase === 'over') && client.match
        ? client.match.cfg
        : client.cfg,
  )

  const spectated = $derived(
    (client.phase === 'match' || client.phase === 'over') && !!client.match?.spectating,
  )
  const locked = $derived(
    (client.phase === 'match' && !!client.match && client.match.players.length > 1) ||
      spectated ||
      ((client.phase === 'room' || client.phase === 'over') && !!client.room && !client.isHost),
  )
  const note = $derived(
    spectated
      ? 'spectating — these are their settings'
      : client.phase === 'match' && locked
        ? 'locked for the rest of this run'
        : !!client.room && !client.isHost
          ? 'the host sets the rules in here'
          : '',
  )
</script>

<!-- The settings live here on every screen, which is the whole point of them
     being a bar: you never have to leave what you are doing to change one. -->
<div class="bar">
  <ConfigBar {cfg} onChange={(next) => client.setCfg(next, locked)} disabled={locked} {note} />
</div>

<style>
  .bar {
    display: flex;
    justify-content: center;
    flex: none;
    padding-bottom: 18px;
  }
</style>
