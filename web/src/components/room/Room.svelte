<script lang="ts">
  import type { RoomInfo } from '../../lib/net'
  import RoomCode from './RoomCode.svelte'
  import Visibility from './Visibility.svelte'
  import Roster from './Roster.svelte'
  import Actions from './Actions.svelte'
  import Session from '../session/Session.svelte'

  /**
   * The waiting room. Everyone sees the same screen with the controls off, so
   * nobody has to be told what changed — hence the one thing this file keeps
   * for itself: `host`, the boolean every part below is handed to say whether
   * it is yours to press.
   */
  let {
    room,
    selfId,
    onRename,
    onStart,
    onKick,
    onLeave,
    onPublic,
  }: {
    room: RoomInfo
    selfId: string
    onRename: (name: string) => void
    onStart: () => void
    onKick: (id: string) => void
    onLeave: () => void
    onPublic: (isPublic: boolean) => void
  } = $props()

  const host = $derived(room.hostId === selfId)
</script>

<section class="room screen">
  <RoomCode code={room.code} />

  <Visibility isPublic={room.public} {host} {onPublic} />

  <Roster
    members={room.members}
    {selfId}
    hostId={room.hostId}
    {host}
    isPublic={room.public}
    {onRename}
    {onKick}
  />

  <Actions members={room.members} hostId={room.hostId} {host} {onStart} {onLeave} />

  <!-- Below the button: the screen's job is to get the next run started, and
       the record of the last eight is what you read while waiting. -->
  <div class="log">
    <Session log={room.log ?? []} {selfId} />
  </div>
</section>

<style>
  .room {
    --screen-pad: 3vh;
    width: 100%;
  }

  /* Svelte will not put its scope on a class it only hands to a component,
     hence the `:global`. Two components down rather than one, so the `.room` in
     front is the only thing keeping the rule off every other switch. */
  .room :global(.vis) {
    margin-top: 16px;
  }

  .log {
    width: 100%;
    margin-top: 36px;
  }
</style>
