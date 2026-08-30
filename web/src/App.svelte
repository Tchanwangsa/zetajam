<script lang="ts">
  import { Client } from './lib/client.svelte'
  import { setRunContext } from './lib/run-context.svelte'
  import Header from './components/chrome/Header.svelte'
  import IdleGuard from './components/chrome/IdleGuard.svelte'
  import SettingsBar from './components/chrome/SettingsBar.svelte'
  import Lobby from './components/lobby/Lobby.svelte'
  import Multiplayer from './components/multiplayer/Multiplayer.svelte'
  import Room from './components/room/Room.svelte'
  import Game from './components/game/Game.svelte'
  import Results from './components/results/Results.svelte'

  /**
   * Which screen is on, and nothing else. Server state lives in the client
   * (lib/client.svelte.ts); drawing lives in the screens. What is left here is
   * the arrangement, plus the two keys that mean "next".
   */
  const client = new Client()

  /**
   * What the game and results screens read, in place of a dozen props each.
   * Getters rather than a snapshot, so a read reaches the live state — `scores`
   * and `claims` land many times a second during a run. The fallbacks are for
   * the screens that never see this: nothing reads it without a match.
   */
  setRunContext({
    get seed() {
      return client.match?.seed ?? 0
    },
    get cfg() {
      return client.match?.cfg ?? client.cfg
    },
    get durMs() {
      return client.match?.durMs ?? 0
    },
    get startsInMs() {
      return client.match?.startsInMs ?? 0
    },
    get players() {
      return client.match?.players ?? []
    },
    get spectating() {
      return !!client.match?.spectating
    },
    get selfId() {
      // The run's id, not the socket's: a reconnect is issued a fresh one, and
      // the results screen outlives its socket now. See Client.runId.
      return client.runId
    },
    get scores() {
      return client.scores
    },
    get claims() {
      return client.claims
    },
    get slots() {
      return client.slots
    },
  })

  // The pointers are for people who have never seen the settings bar. Once
  // you have started a run, an arrow at it every time is nagging.
  let hinted = $state(localStorage.getItem('zetajam.hinted') === '1')
  client.onMatchStart = () => {
    hinted = true
    localStorage.setItem('zetajam.hinted', '1')
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return
    const t = e.target as HTMLElement | null
    if (t?.closest('input, [role="dialog"]')) return
    if (client.phase === 'over') {
      if (client.room) client.goRoom()
      else client.solo()
    } else if (client.phase === 'lobby') client.goMultiplayer()
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Over everything, including a run: nothing else on screen matters once the
     connection is thirty seconds from going. -->
{#if client.warnLeft}
  <IdleGuard left={client.warnLeft} inRoom={!!client.room} onStay={() => client.stay()} />
{/if}

<div class="shell">
  <Header
    link={client.link}
    online={client.online}
    playing={client.playing}
    lobby={client.phase === 'lobby'}
    canReset={client.canReset}
    canLeave={client.canLeave}
    spectating={!!client.match?.spectating}
    inRoom={!!client.room}
    players={client.match?.players.length ?? 0}
    onBrand={() => client.goLobby()}
    onReset={() => client.reset()}
    onLeave={() => client.leaveMatch()}
  />

  <SettingsBar {client} />

  <main>
    {#if client.phase === 'lobby'}
      <Lobby
        bind:name={client.name}
        hints={!hinted}
        games={client.games}
        best={client.best}
        onMulti={() => client.goMultiplayer()}
        onSolo={() => client.solo()}
        onSpectate={(id) => client.spectate(id)}
      />
    {:else if client.phase === 'mp'}
      <Multiplayer
        bind:name={client.name}
        bind:code={client.joinCode}
        rooms={client.rooms}
        error={client.roomErr}
        joining={client.joining}
        onCreate={(isPublic) => client.createRoom(isPublic)}
        onJoin={() => client.joinRoom()}
        onJoinCode={(code) => client.joinRoom(code)}
        onCancel={() => client.cancelJoin()}
        onBack={() => client.goLobby()}
      />
    {:else if client.phase === 'room' && client.room}
      <Room
        room={client.room}
        selfId={client.selfId}
        onRename={(next) => client.rename(next)}
        onStart={() => client.startRoom()}
        onKick={(id) => client.kick(id)}
        onPublic={(isPublic) => client.setPublic(isPublic)}
        onLeave={() => client.goLobby()}
      />
    {:else if client.phase === 'match' && client.match}
      {#key client.runKey}
        <Game
          bind:samples={client.samples}
          bind:steps={client.steps}
          onAnswer={(i, v, ms) => client.answer(i, v, ms)}
          onExpire={() => client.expire()}
        />
      {/key}
    {:else if client.phase === 'over' && client.match}
      <Results
        results={client.results}
        samples={client.samples}
        steps={client.steps}
        inRoom={!!client.room}
        log={client.room?.log ?? []}
        onAgain={() => client.solo()}
        onRoom={() => client.goRoom()}
        onLobby={() => client.goLobby()}
      />
    {/if}
  </main>
</div>

<style>
  .shell {
    max-width: 1536px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 0 96px 40px;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
</style>
