<script lang="ts">
  import {
    Net,
    type GameInfo,
    type MatchResult,
    type Msg,
    type PlayerInfo,
    type RoomInfo,
  } from './lib/net'
  import type { Sample } from './lib/series'
  import { load, save, sig, type Config } from './lib/config'
  import { codeFromURL, setURL, validCode } from './lib/room'
  import Lobby from './components/Lobby.svelte'
  import Multiplayer from './components/Multiplayer.svelte'
  import Room from './components/Room.svelte'
  import Game from './components/Game.svelte'
  import Results from './components/Results.svelte'
  import ConfigBar from './components/ConfigBar.svelte'
  import { LogOut, Monitor, Moon, RotateCw, Sun } from '@lucide/svelte';

  interface Match {
    seed: number
    cfg: Config
    durMs: number
    startsInMs: number
    you?: PlayerInfo
    players: PlayerInfo[]
    spectating: boolean
  }

  type Phase = 'lobby' | 'mp' | 'queued' | 'room' | 'match' | 'over'

  // A link straight into a room skips the lobby *and* the join form. Read
  // before any state exists, because it decides which screen the app opens on.
  const deepLink = codeFromURL()

  let phase = $state<Phase>(deepLink ? 'mp' : 'lobby')
  let connected = $state(false)
  let selfId = $state('')
  const savedName = localStorage.getItem('zetajam.name') ?? ''
  let name = $state(savedName)

  let match = $state<Match | null>(null)
  let scores = $state<Record<string, number>>({})
  let samples = $state<Sample[]>([])
  let results = $state<MatchResult[]>([])

  let room = $state<RoomInfo | null>(null)
  let joinCode = $state(deepLink)
  let roomErr = $state('')
  // The code of a join in flight. Only ever set between sending `room.join`
  // and hearing back, which is also exactly the window the screen has nothing
  // true to show — so it doubles as "show the waiting state".
  let joining = $state(deepLink)

  let online = $state(0)
  let playing = $state(0)
  let games = $state<GameInfo[]>([])
  let best = $state<MatchResult | undefined>()
  let runKey = $state(0) // forces a fresh Game instance per match

  // What this client *wants*. What a run actually uses is match.cfg, which the
  // server normalized and sent back — see lib/config.ts.
  let cfg = $state<Config>(load())
  $effect(() => save(cfg))

  let theme = $state(localStorage.getItem('zetajam.theme') ?? 'system')
  $effect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('zetajam.theme', theme)
  })

  const net = new Net(onMsg, (up) => (connected = up))

  // A room link is an instruction, not a suggestion. Prefilling the code and
  // waiting for a click asked for the click twice: following the link was the
  // first one. Sent before the socket is up — Net buffers until it opens.
  if (deepLink) net.send({ t: 'room.join', code: deepLink, name: savedName || 'guest' })

  function onMsg(m: Msg) {
    switch (m.t) {
      case 'welcome':
        selfId = m.self.id
        if (m.best) best = m.best
        break
      case 'online':
        // The server marshals one struct for every frame type, so a numeric
        // field at zero is dropped rather than sent — `omitempty` means "at
        // the type's zero value", not "unset". Nobody playing arrives as an
        // absent key, which is not the same thing as absent players.
        online = m.online ?? 0
        playing = m.playing ?? 0
        break
      case 'games':
        games = m.games
        break
      case 'queued':
        phase = 'queued'
        break
      case 'match':
        match = {
          seed: m.seed,
          cfg: m.cfg,
          durMs: m.durMs,
          startsInMs: m.startsInMs,
          you: m.you,
          players: m.players ?? [],
          spectating: !!m.spectating,
        }
        scores = Object.fromEntries(match.players.map((p) => [p.id, 0]))
        samples = []
        runKey++
        phase = 'match'
        break
      case 'score':
        scores = { ...scores, [m.id]: m.score ?? 0 }
        break
      case 'end':
        results = m.results
        if (m.best) best = m.best
        phase = 'over'
        break
      case 'room':
        room = m.room
        roomErr = ''
        joining = ''
        setURL(room.code)
        // Mid-match the room frame is just a roster update; the screen it
        // belongs to comes back when the run ends.
        if (phase === 'lobby' || phase === 'mp' || phase === 'queued') phase = 'room'
        break
      case 'room.gone':
        room = null
        roomErr = m.msg
        // A refused join leaves its code in the box to be fixed or retried —
        // the whole point of a code you can read out loud. Being kicked out of
        // a room you were already in leaves nothing to retry.
        joinCode = joining
        joining = ''
        setURL(null)
        if (phase !== 'match') phase = 'mp'
        break
      case 'err':
        roomErr = m.msg
        joining = ''
        break
    }
  }

  function play(solo = false) {
    localStorage.setItem('zetajam.name', name)
    net.send({ t: 'join', name: name || 'guest', solo, cfg })
    if (!solo) phase = 'queued'
  }

  // A solo run is yours alone, so restarting it costs nobody anything. In a
  // versus match the button is not offered — leaving mid-run ends it for
  // everyone else too, and that is what ✕ is for. A run of one started from a
  // room is not solo in this sense either: restarting it would walk you out of
  // the room the others are sitting in.
  const soloRun = $derived(
    phase === 'match' && !!match && !match.spectating && match.players.length <= 1 && !room,
  )
  const canReset = $derived(soloRun || (phase === 'over' && !room))

  function reset() {
    if (phase === 'over') play(match ? match.players.length <= 1 : true)
    else if (soloRun) play(true)
  }

  // Walking out of a run, a countdown, a queue or a spectate. Where it puts you
  // is wherever you came in from: a room you are still a member of, otherwise
  // the lobby. The server ends the run for everyone still in it — same as
  // closing the tab — so this is offered plainly rather than hidden behind the
  // brand link, where people found it by accident.
  function leaveMatch() {
    net.send({ t: 'match.leave' })
    phase = room ? 'room' : 'lobby'
  }

  const canLeave = $derived(phase === 'match' || phase === 'queued')
  const leaveLabel = $derived(
    phase === 'queued'
      ? 'stop looking for a match'
      : match?.spectating
        ? 'stop watching'
        : room
          ? 'leave the run — back to the room'
          : (match?.players.length ?? 0) > 1
            ? 'leave the run — it ends for everyone'
            : 'leave the run',
  )

  function goLobby() {
    // Room first: once you are out of it, ending the run cannot bounce a room
    // frame back at you and land you on the room screen you just left.
    if (room) leaveRoom()
    if (canLeave) net.send({ t: 'match.leave' })
    phase = 'lobby'
  }

  // --- rooms ---------------------------------------------------------------

  function createRoom() {
    localStorage.setItem('zetajam.name', name)
    net.send({ t: 'room.create', name: name || 'guest', cfg })
  }

  function joinRoom() {
    if (!validCode(joinCode)) return
    localStorage.setItem('zetajam.name', name)
    joining = joinCode
    net.send({ t: 'room.join', code: joinCode, name: name || 'guest' })
  }

  // Renaming from inside a room. A deep link never shows the lobby's name
  // field, so for anyone who arrived on a link this is the first chance to be
  // somebody other than `guest`.
  function rename(next: string) {
    name = next
    localStorage.setItem('zetajam.name', name)
    net.send({ t: 'room.name', name: name || 'guest' })
  }

  function leaveRoom() {
    net.send({ t: 'room.leave' })
    room = null
    joinCode = ''
    joining = ''
    setURL(null)
  }

  // --- the settings bar ----------------------------------------------------

  // In a room the host's config is the one that counts, and during a match it
  // is whatever the server normalized — so the bar shows the config that is
  // actually in force, not the one this browser happens to have saved.
  const barCfg = $derived(
    phase === 'room' && room ? room.cfg : phase === 'match' && match ? match.cfg : cfg,
  )
  const isHost = $derived(!!room && room.hostId === selfId)
  const barLocked = $derived(
    (phase === 'match' && !!match && (match.spectating || match.players.length > 1)) ||
      (phase === 'room' && !!room && !isHost) ||
      (phase === 'over' && !!room && !isHost),
  )
  const barNote = $derived(
    phase === 'match' && match?.spectating
      ? 'spectating — these are their settings'
      : phase === 'match' && barLocked
        ? 'locked for the rest of this run'
        : !!room && !isHost
          ? 'the host sets the rules in here'
          : '',
  )

  function onCfg(next: Config) {
    if (room && isHost) {
      net.send({ t: 'room.cfg', cfg: next })
      cfg = next // keep your own default in step with the room you run
      return
    }
    if (barLocked) return
    const changed = sig(next) !== sig(cfg)
    cfg = next
    if (!changed) return
    // New settings only reach a run at join time. A solo run can just be
    // restarted under them, and a queue can be re-entered on the new signature.
    if (soloRun) play(true)
    else if (phase === 'queued') play(false)
  }

  function answer(i: number, v: number, ms: number) {
    net.send({ t: 'answer', i, v, ms })
    scores = { ...scores, [selfId]: (scores[selfId] ?? 0) + 1 }
  }

  // The clock ran out locally. The server's `end` frame is what actually
  // decides the scores, but if it is slow or lost we still leave the board.
  //
  // Pinned to the run it was armed for: restarting inside the 2.5s window —
  // easy with a reset button — must not drag the new run onto the old run's
  // results screen.
  function expire() {
    const key = runKey
    setTimeout(() => {
      if (phase !== 'match' || runKey !== key || !match) return
      results = match.spectating
        ? []
        : match.players.map((p) => ({ id: p.id, name: p.name, score: scores[p.id] ?? 0 }))
      phase = 'over'
    }, 2500)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return
    const t = e.target as HTMLElement | null
    if (t?.closest('input, [role="dialog"]')) return
    if (phase === 'over') {
      if (room) phase = 'room'
      else play(match ? match.players.length <= 1 : true)
    } else if (phase === 'lobby') play()
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <header>
    <button class="brand" onclick={goLobby}>zetajam</button>
    <div class="right num">
      {#if !connected}
        <span class="off">reconnecting…</span>
      {:else if phase !== 'lobby'}
        <span class="stat">{online} online</span>
      {:else}
        <span class="stat">{online} online · {playing} playing</span>
      {/if}
      {#if canReset}
        <button class="btn-icon" title="restart (same settings)" aria-label="restart" onclick={reset}>
          <RotateCw size={12}/>
        </button>
      {/if}
      {#if canLeave}
        <button class="btn-icon leave" title={leaveLabel} aria-label={leaveLabel} onclick={leaveMatch}>
          <LogOut size={12} />
        </button>
      {/if}
      <button
        class="btn-icon theme"
        title="theme"
        aria-label="cycle theme"
        onclick={() => (theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
      >
        {#if theme === 'system'}
          <Monitor size={12} />
        {:else if theme === 'light'}
          <Sun size={12} />
        {:else}
          <Moon size={12} />
        {/if}
      </button>
    </div>
  </header>

  <div class="bar">
    <ConfigBar cfg={barCfg} onChange={onCfg} disabled={barLocked} note={barNote} />
  </div>

  <main>
    {#if phase === 'lobby' || phase === 'queued'}
      <Lobby
        bind:name
        {games}
        {best}
        queued={phase === 'queued'}
        onPlay={() => play(false)}
        onSolo={() => play(true)}
        onFriends={() => ((roomErr = ''), (phase = 'mp'))}
        onCancel={() => play(true)}
        onSpectate={(id) => net.send({ t: 'spectate', id })}
      />
    {:else if phase === 'mp'}
      <Multiplayer
        bind:name
        bind:code={joinCode}
        error={roomErr}
        {joining}
        onCreate={createRoom}
        onJoin={joinRoom}
        onCancel={() => (joining = '')}
        onBack={() => (phase = 'lobby')}
      />
    {:else if phase === 'room' && room}
      <Room
        {room}
        {selfId}
        onRename={rename}
        onStart={() => net.send({ t: 'room.start' })}
        onKick={(id) => net.send({ t: 'room.kick', id })}
        onLeave={() => ((phase = 'lobby'), leaveRoom())}
      />
    {:else if phase === 'match' && match}
      {#key runKey}
        <Game
          seed={match.seed}
          cfg={match.cfg}
          durMs={match.durMs}
          startsInMs={match.startsInMs}
          players={match.players}
          {selfId}
          {scores}
          spectating={match.spectating}
          bind:samples
          onAnswer={answer}
          onExpire={expire}
        />
      {/key}
    {:else if phase === 'over' && match}
      <Results
        {results}
        {selfId}
        players={match.players}
        {samples}
        durMs={match.durMs}
        inRoom={!!room}
        onAgain={() => play(match ? match.players.length <= 1 : true)}
        onRoom={() => (phase = 'room')}
        onLobby={goLobby}
      />
    {/if}
  </main>
</div>

<style>
  .shell {
    max-width: 820px;
    min-height: 100vh;
    margin: 0 auto;
    padding: 0 24px 40px;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
    flex: none;
  }
  .brand {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--muted);
    padding: 0;
    transition: color 140ms ease;
  }
  .brand:hover {
    color: var(--text);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .stat {
    display: flex;
    align-items: center;
  }

  .stat,
  .off {
    font-size: 12px;
    color: var(--faint);
  }
  .off {
    color: var(--danger);
  }
  .theme {
    font-size: 13px;
  }
  .leave:hover {
    color: var(--danger);
  }

  /* The settings live here on every screen, which is the whole point of them
     being a bar: you never have to leave what you are doing to change one. */
  .bar {
    display: flex;
    justify-content: center;
    flex: none;
    padding-bottom: 18px;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
</style>
