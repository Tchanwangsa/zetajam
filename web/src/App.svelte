<script lang="ts">
  import { Net, type GameInfo, type MatchResult, type Msg, type PlayerInfo } from './lib/net'
  import type { Sample } from './lib/series'
  import { load, save, sig, type Config } from './lib/config'
  import Lobby from './components/Lobby.svelte'
  import Game from './components/Game.svelte'
  import Results from './components/Results.svelte'
  import Settings from './components/Settings.svelte'

  interface Match {
    seed: number
    cfg: Config
    durMs: number
    startsInMs: number
    you: PlayerInfo
    opp?: PlayerInfo
    spectating: boolean
  }

  let phase = $state<'lobby' | 'queued' | 'match' | 'over'>('lobby')
  let connected = $state(false)
  let selfId = $state('')
  let name = $state(localStorage.getItem('zetajam.name') ?? '')

  let match = $state<Match | null>(null)
  let oppScore = $state(0)
  let specA = $state(0)
  let specB = $state(0)
  let samples = $state<Sample[]>([])
  let results = $state<MatchResult[]>([])

  let online = $state(0)
  let playing = $state(0)
  let games = $state<GameInfo[]>([])
  let best = $state<MatchResult | undefined>()
  let runKey = $state(0) // forces a fresh Game instance per match

  // What this client *wants*. What a run actually uses is match.cfg, which
  // the server normalized and sent back — see lib/config.ts.
  let cfg = $state<Config>(load())
  let settings = $state(false)
  let sigAtOpen = ''
  $effect(() => save(cfg))

  let theme = $state(localStorage.getItem('zetajam.theme') ?? 'system')
  $effect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('zetajam.theme', theme)
  })

  const net = new Net(onMsg, (up) => (connected = up))

  function onMsg(m: Msg) {
    switch (m.t) {
      case 'welcome':
        selfId = m.self.id
        if (m.best) best = m.best
        break
      case 'online':
        online = m.online
        playing = m.playing
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
          opp: m.opp,
          spectating: !!m.spectating,
        }
        oppScore = 0
        specA = 0
        specB = 0
        samples = []
        runKey++
        phase = 'match'
        break
      case 'score':
        if (match?.spectating) {
          if (m.id === match.you.id) specA = m.score
          else specB = m.score
        } else if (m.id !== selfId) {
          oppScore = m.score
        }
        break
      case 'end':
        results = m.results
        if (m.best) best = m.best
        phase = 'over'
        break
    }
  }

  function play(solo = false) {
    localStorage.setItem('zetajam.name', name)
    net.send({ t: 'join', name: name || 'guest', solo, cfg })
    if (!solo) phase = 'queued'
  }

  // A solo run is yours alone, so restarting it costs nobody anything. In a
  // versus match the button is not offered — leaving mid-run would end it for
  // the opponent too, and that is what the brand link is for.
  const soloRun = $derived(phase === 'match' && !!match && !match.spectating && !match.opp)
  const canReset = $derived(soloRun || phase === 'over')

  function reset() {
    if (phase === 'over') play(!match?.opp)
    else if (soloRun) play(true)
  }

  function openSettings() {
    sigAtOpen = sig(cfg)
    settings = true
  }

  function closeSettings() {
    settings = false
    // New settings only reach a run at join time. A solo run can just be
    // restarted under them; anything else waits for the next one.
    if (sig(cfg) !== sigAtOpen && soloRun) play(true)
  }

  function answer(i: number, v: number, ms: number) {
    net.send({ t: 'answer', i, v, ms })
  }

  // The clock ran out locally. The server's `end` frame is what actually
  // decides the scores, but if it is slow or lost we still leave the board.
  //
  // Pinned to the run it was armed for: restarting inside the 2.5s window —
  // easy now that there is a reset button — must not drag the new run onto the
  // old run's results screen.
  function expire() {
    const key = runKey
    setTimeout(() => {
      if (phase === 'match' && runKey === key) {
        results = match?.spectating ? [] : [{ id: selfId, name: name || 'you', score: 0 }]
        phase = 'over'
      }
    }, 2500)
  }

  function onKey(e: KeyboardEvent) {
    if (settings || e.key !== 'Enter') return
    if (phase === 'over') play(!match?.opp)
    else if (phase === 'lobby') play()
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <header>
    <button class="brand" onclick={() => (phase = 'lobby')}>zetajam</button>
    <div class="right num">
      {#if !connected}
        <span class="off">reconnecting…</span>
      {:else if phase !== 'lobby'}
        <span class="stat">{online} online</span>
      {:else}
        <span class="stat">{online} online · {playing} playing</span>
      {/if}
      {#if canReset}
        <button class="icon" title="restart (same settings)" aria-label="restart" onclick={reset}>
          ↻
        </button>
      {/if}
      <button
        class="icon"
        class:active={settings}
        title="settings"
        aria-label="settings"
        aria-expanded={settings}
        onclick={() => (settings ? closeSettings() : openSettings())}
      >
        ⚙
      </button>
      <button
        class="theme"
        title="theme"
        aria-label="cycle theme"
        onclick={() => (theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
      >
        {theme === 'system' ? '◐' : theme === 'light' ? '○' : '●'}
      </button>
    </div>

    {#if settings}
      <Settings bind:cfg live={phase === 'match' || phase === 'queued'} onClose={closeSettings} />
    {/if}
  </header>

  <main>
    {#if phase === 'lobby' || phase === 'queued'}
      <Lobby
        bind:name
        {games}
        {best}
        queued={phase === 'queued'}
        onPlay={() => play(false)}
        onSolo={() => play(true)}
        onCancel={() => play(true)}
        onSpectate={(id) => net.send({ t: 'spectate', id })}
        {cfg}
        onSettings={openSettings}
      />
    {:else if phase === 'match' && match}
      {#key runKey}
        <Game
          seed={match.seed}
          cfg={match.cfg}
          durMs={match.durMs}
          startsInMs={match.startsInMs}
          you={match.you}
          opp={match.opp}
          spectating={match.spectating}
          {oppScore}
          {specA}
          {specB}
          bind:samples
          onAnswer={answer}
          onExpire={expire}
        />
      {/key}
    {:else if phase === 'over' && match}
      <Results
        {results}
        {selfId}
        opp={match.opp}
        {samples}
        durMs={match.durMs}
        onAgain={() => play(!match?.opp)}
        onLobby={() => (phase = 'lobby')}
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
    position: relative; /* the settings popover anchors to this */
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
  .icon {
    font-size: 14px;
    color: var(--faint);
    line-height: 1;
    padding: 4px;
    transition: color 140ms ease;
  }
  .icon:hover,
  .icon.active {
    color: var(--text);
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
    color: var(--faint);
    line-height: 1;
    padding: 4px;
    transition: color 140ms ease;
  }
  .theme:hover {
    color: var(--text);
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
</style>
