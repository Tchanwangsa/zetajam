<script lang="ts">
  import type { RoomBrief } from '../../lib/net'
  import NameField from '../ui/NameField.svelte'
  import Board from './Board.svelte'
  import CreateRoom from './CreateRoom.svelte'
  import JoinRoom from './JoinRoom.svelte'
  import Joining from './Joining.svelte'

  /**
   * One screen for every way of playing against somebody: there is one kind of
   * room and `public` is the only knob. This replaced a matchmaking queue that
   * told you nothing while you waited — a board of real rooms you can read the
   * settings off answers the same question out loud.
   */
  let {
    name = $bindable(''),
    code = $bindable(''),
    rooms = [],
    error = '',
    joining = '',
    onCreate,
    onJoin,
    onJoinCode,
    onCancel,
    onBack,
  }: {
    name?: string
    code?: string
    rooms?: RoomBrief[]
    error?: string
    /** A code we have asked to join and not yet heard back about. */
    joining?: string
    onCreate: (isPublic: boolean) => void
    onJoin: () => void
    onJoinCode: (code: string) => void
    onCancel: () => void
    onBack: () => void
  } = $props()
</script>

<section class="mp screen">
{#if joining}
  <Joining code={joining} {onCancel} />
{:else}
  <h2>multiplayer</h2>

  <NameField bind:value={name} autofocus />

  <div class="cards">
    <CreateRoom {onCreate} />
    <JoinRoom bind:code {onJoin} />
  </div>

  {#if error}
    <p class="err">{error}</p>
  {/if}

  <Board {rooms} {onJoinCode} />

  <button class="btn-link back" onclick={onBack}>back</button>
{/if}
</section>

<style>
  .mp {
    --screen-pad: 4vh;
    text-align: center;
  }

  /* The title and the way out sit on both halves of the branch above, one of
     which is a component — hence the scope hop, rather than declaring twice. */
  .mp :global(h2) {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.03em;
    margin: 0 0 20px;
  }
  .mp :global(.back) {
    margin-top: 26px;
  }

  /* Two cards that have to read as one — the difference is meant to be what is
     written on them — so the shell is one rule here, not two identical ones. */
  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 32px;
    width: 100%;
    max-width: 560px;
  }
  .cards :global(.card) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    text-align: left;
  }
  .cards :global(.card p) {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.45;
    flex: 1;
  }

  .err {
    color: var(--danger);
    font-size: 13px;
    margin: 16px 0 0;
  }

  @media (max-width: 560px) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
