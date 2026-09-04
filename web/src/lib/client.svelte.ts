import {
  Net,
  type Claim,
  type MatchResult,
  type Msg,
  type PlayerInfo,
  type RoomBrief,
  type RoomInfo,
} from './net'
import type { Sample } from './series'
import type { Step } from './steps'
import { timeline } from './rush'
import { question } from './questions'
import { load, normalize, save, sig, type Config } from './config'
import { fetchLobby } from './lobby'
import { linkFromURL, setURL, validCode } from './room'
import type { Screen } from './analytics'

/** Everything a run is, as the server handed it over. */
export interface Match {
  seed: number
  cfg: Config
  durMs: number
  startsInMs: number
  you?: PlayerInfo
  players: PlayerInfo[]
  spectating: boolean
  /** The room being watched. Spectates only — see the `match` case in onMsg. */
  code?: string
}

export type Phase = 'lobby' | 'mp' | 'room' | 'match' | 'over'

/**
 * How long a hidden tab is given before nobody counts as being here. The server
 * bills by the second a websocket is open, and the ping/pong in server/main.go
 * means an abandoned tab holds one open for as long as the browser lives — so
 * this is the difference between a forgotten tab costing nothing and costing
 * every hour it sits there. Long enough that glancing at another tab and coming
 * back never costs a reconnect.
 */
const hiddenGraceMs = 60_000

/**
 * The same, for a tab that is on screen and untouched. Being visible is not the
 * same as being watched — a tab parked on a second monitor is visible until the
 * machine is turned off, which is exactly the standing charge above wearing a
 * different hat. Longer than hiddenGraceMs, because going quiet here is
 * something you can see: the board and the counts stop moving.
 */
const shownGraceMs = 5 * 60_000

/**
 * How long the warning stands before the socket goes down. Only a tab somebody
 * could be looking at ever gets one — a hidden tab has nobody to read it, so it
 * goes quiet unannounced.
 */
const warnMs = 30_000

/**
 * How much longer a *hidden* tab holds a seat kept for it — a room, a spectate
 * — on top of its grace. Glancing at another tab for a minute should not cost
 * you your place in a room, and a hidden tab cannot be asked whether it meant
 * to. A visible one can, which is what warnMs is for, so this does not apply to
 * it: there it is the warning that stands between five idle minutes and the
 * door.
 */
const releaseMs = 5 * 60_000

/** How often the away check runs. Every second, because the warning counts down
    in seconds; a hidden tab's timers are clamped to about a minute anyway. */
const tickMs = 1_000

/** How often the lobby asks for its numbers while somebody is looking at it. */
const lobbyPollMs = 20_000

/**
 * How long a question to the hub keeps the socket up while it goes unanswered.
 * Between clicking a live game and the run arriving there is a moment where no
 * screen needs the hub, and without this the tick below would hang up mid-ask.
 */
const askGraceMs = 15_000

/** The countdown a local run gives itself, and how long it sits on the finished
    board before the results — the two beats the hub would otherwise set. */
const localCountdownMs = 3_000
const localEndMs = 1_000

/** Who you are in a run nobody else is in. A local run never reaches the hub,
    so there is no id to be issued one. */
const LOCAL_ID = 'me'

/**
 * The whole client: one socket, one state machine, and what you may ask it to
 * do. Everything here is state the server owns or contributes to — the theme is
 * not, but name and config are, because the server is told about both.
 */
export class Client {
  /** A link straight into a room skips the lobby *and* the join form; the
      `/spectate` form skips the room too. Read before any state exists: it
      decides which screen the app opens on. */
  private readonly deepLink = linkFromURL()

  phase = $state<Phase>('lobby')
  connected = $state(false)
  /** Down because nobody is here, rather than down because something is wrong.
      The two look the same from the socket and read very differently on screen. */
  sleeping = $state(false)
  /** Seconds left on the idle warning, or 0 while there is none to show. */
  warnLeft = $state(0)
  selfId = $state('')

  /**
   * The id the run on screen is being played under, pinned when it starts.
   * `selfId` is reissued on every reconnect, and the results screen outlives
   * the socket that earned them now that we sleep through it — see spare.
   */
  matchId = $state('')

  /**
   * A run has started; the lobby's pointers use it to retire themselves. Declared
   * up here because a class field initializes only when its declaration is
   * reached, and `net` below opens its socket the moment it is constructed.
   */
  onMatchStart: () => void = () => {}

  match = $state<Match | null>(null)
  scores = $state<Record<string, number>>({})
  samples = $state<Sample[]>([])
  /** Kept out here so the results screen still has them after Game is torn
      down. See lib/steps.ts. */
  steps = $state<Step[]>([])
  results = $state<MatchResult[]>([])
  /** Rush only: who took each slot. The server settles the race by arrival, so
      this is entirely its word — including for your own buzzes. */
  claims = $state<Record<number, Claim>>({})
  /** Forces a fresh Game instance per match. */
  runKey = $state(0)
  /**
   * This run was generated here and the hub knows nothing about it. Solo is the
   * only way that happens: the generator is the same on both sides, every
   * client already runs it from the seed, and a run of one has nothing to
   * settle between anybody. See solo().
   */
  local = $state(false)

  room = $state<RoomInfo | null>(null)
  joinCode = $state('')
  roomErr = $state('')
  /** The code of a join in flight. Set only between sending `room.join` and
      hearing back, which is also the window where the screen has nothing true
      to show — so it doubles as "show the waiting state". */
  joining = $state('')

  online = $state(0)
  playing = $state(0)
  rooms = $state<RoomBrief[]>([])
  best = $state<MatchResult | undefined>()

  /** Written through an accessor rather than watched by an effect, so
      `bind:name` saves on the keystroke that changed it. Saving only on the way
      into a run lost the name to a reload or a room link. */
  #name = $state(localStorage.getItem('zetajam.name') ?? '')

  /** What this client *wants*. A run uses match.cfg, which the server
      normalized and sent back — see lib/config.ts. */
  #cfg = $state<Config>(load())

  /**
   * Rush only: the run laid out as the questions it held, rebuilt whenever a
   * claim settles one. Up here because both screens want it, only this one has
   * the claims, and its shape has to survive Game being torn down.
   */
  readonly slots = $derived(
    this.match && this.match.cfg.mode === 'rush'
      ? timeline(this.match.seed, this.match.cfg, this.claims, this.match.durMs)
      : [],
  )

  /**
   * A solo run is yours alone, so restarting costs nobody anything. Not in a
   * versus match — leaving mid-run ends it for everyone, which is what ✕ is for.
   * Not a run of one inside a room either: restarting would walk you out of it.
   */
  readonly soloRun = $derived(
    this.phase === 'match' &&
      !!this.match &&
      !this.match.spectating &&
      this.match.players.length <= 1 &&
      !this.room,
  )
  /** Who you are inside the run and its results. Everywhere else — the room
      roster, the host check — wants the live `selfId` instead. */
  readonly runId = $derived(this.matchId || this.selfId)
  readonly canReset = $derived(this.soloRun || (this.phase === 'over' && !this.room))
  readonly canLeave = $derived(this.phase === 'match')
  readonly isHost = $derived(!!this.room && this.room.hostId === this.selfId)

  /**
   * Which screen is on, named for the analytics report — every one of them is
   * the same address, so nothing else can tell them apart. Playing alone,
   * playing in a room and watching somebody else play are three different
   * things that all read `phase === 'match'`; what separates them is a room
   * and a spectator flag.
   */
  readonly screen = $derived.by((): Screen => {
    if (this.phase === 'lobby') return 'home'
    if (this.phase === 'mp') return 'multiplayer'
    if (this.phase === 'room') return 'room'
    const done = this.phase === 'over'
    if (this.match?.spectating) return done ? 'spectate-results' : 'spectate'
    if (this.room) return done ? 'room-results' : 'room-game'
    return done ? 'solo-results' : 'solo-game'
  })

  /**
   * What the header should say about the connection. 'ok' covers the case that
   * is now the common one — there is no socket and nothing wants one — because
   * a lobby that reports itself offline is reporting a problem it does not have.
   */
  readonly link = $derived<'ok' | 'down' | 'paused'>(
    !this.needsHub || this.connected ? 'ok' : this.sleeping ? 'paused' : 'down',
  )

  private readonly net = new Net(
    (m) => this.onMsg(m),
    (up) => {
      this.connected = up
      this.sleeping = !up && !!this.net?.sleeping
    },
  )

  /** When somebody was last here: an input event, or the tab coming back into
      view. The clock everything below is measured from. */
  #seen = Date.now()

  /** The room we walked out of because nobody was looking, kept so coming back
      walks straight back into it. */
  #awayRoom = ''

  /** When we last asked the hub for something. See askGraceMs. */
  #asked = 0

  /** When the lobby may ask for its numbers again. See pollLobby. */
  #nextPollAt = 0

  constructor() {
    // Before the deep-link return below: a tab opened straight into a room
    // still gets put down once it is done with that room.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.stir()
    })
    // pointermove included on purpose: "nobody has moved" should mean what it
    // says, and a tab under a moving cursor is one somebody is at.
    for (const e of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) {
      addEventListener(e, () => this.stir(), { passive: true, capture: true })
    }
    setInterval(() => this.tick(), tickMs)

    const { code, watch } = this.deepLink
    if (!code) {
      this.pollLobby()
      return
    }
    // A room link is an instruction, not a suggestion: following it was the
    // click. Sent before the socket is up — Net buffers until it opens. The
    // multiplayer screen is what a refusal lands on, either way.
    this.phase = 'mp'
    if (watch) {
      this.spectate(code)
      return
    }
    this.joinCode = code
    this.joining = code
    this.ask({ t: 'room.join', code, name: this.#name || 'guest' })
  }

  get name(): string {
    return this.#name
  }

  set name(next: string) {
    this.#name = next
    localStorage.setItem('zetajam.name', next)
  }

  get cfg(): Config {
    return this.#cfg
  }

  set cfg(next: Config) {
    this.#cfg = next
    save(next)
  }

  /** The name to play under. Nobody is allowed to be nameless. */
  private get who(): string {
    return this.#name || 'guest'
  }

  // --- going quiet ---------------------------------------------------------

  /**
   * Whether anything on screen wants the hub. Everything that does is here: a
   * room seat somebody is keeping for us, a question we have asked and not had
   * answered, the multiplayer screen's live board, and a run the hub is
   * refereeing. The lobby is not on the list, and neither is a local run or its
   * results — which is most of most visits, and all of a visit that never plays
   * anybody. Closing the socket *is* how you leave a room, so this doubles as
   * the rule for when it is ours to close; see Hub.remove in server/hub.go.
   */
  private get needsHub(): boolean {
    if (this.room || this.joining) return true
    if (Date.now() - this.#asked < askGraceMs) return true
    if (this.phase === 'mp') return true
    return (this.phase === 'match' || this.phase === 'over') && !this.local
  }

  /** Open the socket, or keep it open. Every way into a screen that wants the
      hub goes through here, so the tick below never has to guess. */
  private hub() {
    this.sleeping = false
    this.net.wake()
  }

  /** Ask the hub for something. Stamped, so the socket outlives the question —
      see askGraceMs. */
  private ask(m: Record<string, unknown>) {
    this.#asked = Date.now()
    this.hub()
    this.net.send(m)
  }

  /** How long an unattended tab is given before nobody counts as being here. */
  private get graceMs(): number {
    return document.hidden ? hiddenGraceMs : shownGraceMs
  }

  /** In a run of our own, which is never timed out from under us: it ends on
      its own clock, and walking out of one ends it for everybody else too. */
  private get pinned(): boolean {
    return this.phase === 'match' && !this.match?.spectating
  }

  /**
   * Somebody is here. Bumps the clock, calls off any warning, and brings the
   * socket back if the screen we are on wanted it — a click on a board that
   * stopped updating ten minutes ago should not be answered with what it says.
   * On the lobby it wakes nothing, which is the point of needsHub.
   */
  private stir() {
    this.#seen = Date.now()
    this.warnLeft = 0
    if (!this.net.sleeping || !this.needsHub) return
    this.hub()
    const code = this.#awayRoom
    if (!code) return
    this.#awayRoom = ''
    this.phase = 'mp'
    this.joinRoom(code)
  }

  /** The answer to the warning. Any input at all is the same answer — see the
      listeners in the constructor — so this is the button, not the only way. */
  stay() {
    this.stir()
  }

  private tick() {
    this.check()
    this.pollLobby()
  }

  /**
   * The whole of the going-quiet rule, once a second.
   *
   * A socket nothing wants goes down at once — there is nobody to warn and
   * nothing to lose. One something wants is held to a timeline instead: on a
   * visible tab, five idle minutes, then thirty seconds of being asked, then the
   * door. A hidden tab is never asked, because there is nobody to ask, so it
   * keeps the older two-stage deal — quick to go quiet, slow to give up a seat
   * somebody would miss.
   */
  private check() {
    this.warnLeft = 0
    if (!this.needsHub) {
      this.net.sleep()
      return
    }
    if (this.net.sleeping || this.pinned) return
    const now = Date.now()
    const due = this.#seen + this.graceMs + (document.hidden ? releaseMs : 0)
    if (document.hidden) {
      if (now >= due) this.release()
      return
    }
    const left = due + warnMs - now
    if (left > warnMs) return
    if (left > 0) {
      this.warnLeft = Math.ceil(left / 1000)
      return
    }
    this.release()
  }

  /**
   * Go quiet, handing back whatever was being kept for us. A spectate is nothing
   * but an open socket. A room seat is one of eight, and leaving is leaving —
   * the server passes the host role on and drops the room when the last member
   * goes, exactly as it does for the ✕ — so the code goes in #awayRoom and
   * stir() walks back in if the room is still there.
   */
  private release() {
    if (this.pinned) return
    if (this.phase === 'match') this.leaveMatch()
    // A join that was never answered holds the socket the same way a room does,
    // and by now it is not going to be.
    this.joining = ''
    this.#asked = 0
    if (this.room) {
      this.#awayRoom = this.room.code
      this.leaveRoom()
      this.phase = 'mp'
    }
    this.net.sleep()
  }

  /**
   * The lobby's numbers, asked for rather than pushed. Only while it is the
   * screen on show, only while the tab is, and only while somebody is here —
   * an unattended lobby should cost nothing at all, which is the whole reason
   * it stopped holding a socket.
   */
  private pollLobby() {
    const now = Date.now()
    if (now < this.#nextPollAt) return
    if (this.phase !== 'lobby' || document.hidden) return
    if (now - this.#seen > shownGraceMs) return
    this.#nextPollAt = now + lobbyPollMs
    fetchLobby().then((v) => {
      // Checked again on the way back: a socket may have opened meanwhile, and
      // its frames are live where this is a snapshot.
      if (!v || this.phase !== 'lobby') return
      this.online = v.online
      this.playing = v.playing
      if (v.best) this.best = v.best
    })
  }

  // --- the wire ------------------------------------------------------------

  private onMsg(m: Msg) {
    switch (m.t) {
      case 'welcome':
        this.selfId = m.self.id
        if (m.best) this.best = m.best
        break
      case 'online':
        // `omitempty` drops a numeric field at its zero value, so nobody
        // playing arrives as an absent key rather than a 0.
        this.online = m.online ?? 0
        this.playing = m.playing ?? 0
        break
      // `omitempty` again: an empty board is dropped from the frame entirely,
      // so this is not safe to read straight through.
      case 'rooms':
        this.rooms = m.rooms ?? []
        break
      case 'match':
        this.onMatchStart()
        // Set back by solo(), which deals its own frame and then says so.
        this.local = false
        this.match = {
          seed: m.seed,
          cfg: m.cfg,
          durMs: m.durMs,
          startsInMs: m.startsInMs,
          you: m.you,
          players: m.players ?? [],
          spectating: !!m.spectating,
          code: m.code,
        }
        // Watching has an address of its own: /r/QK4M/spectate. Not a room we
        // are in, so leaveRoom is never what clears it again — see leaveMatch.
        if (this.match.spectating && m.code) setURL(m.code, true)
        // Pinned for as long as this run and its results are on screen. The
        // frame's own word for who you are, which a local run can set too and a
        // reconnect cannot spoil. See runId.
        this.matchId = m.you?.id ?? this.selfId
        this.scores = Object.fromEntries(this.match.players.map((p) => [p.id, 0]))
        this.samples = []
        this.steps = []
        this.claims = {}
        this.runKey++
        this.phase = 'match'
        break
      case 'score':
        this.scores = { ...this.scores, [m.id]: m.score ?? 0 }
        break
      case 'claim':
        this.claims = { ...this.claims, [m.i]: { id: m.id, ms: m.ms ?? 0 } }
        this.scores = { ...this.scores, [m.id]: m.score ?? 0 }
        // Recorded here rather than in Game, because here is where you find
        // out you won it. `i` is the slot and also the index in the question
        // stream, so the question can be named from the seed alone.
        if (m.id === this.runId && this.match) {
          const at = m.ms ?? 0
          const q = question(this.match.seed, m.i, this.match.cfg)
          const prev = this.steps.length ? this.steps[this.steps.length - 1].t * 1000 : 0
          this.steps = [
            ...this.steps,
            {
              i: m.i,
              t: at / 1000,
              ms: at - prev,
              text: q.text,
              answer: q.answer,
              level: -1,
            },
          ]
        }
        break
      case 'end':
        this.results = m.results
        if (m.best) this.best = m.best
        this.phase = 'over'
        break
      case 'room':
        this.room = m.room
        this.roomErr = ''
        this.joining = ''
        setURL(this.room.code)
        // Mid-match a room frame is just a roster update.
        if (this.phase === 'lobby' || this.phase === 'mp') this.phase = 'room'
        break
      case 'room.gone':
        this.room = null
        this.roomErr = m.msg
        // A refused join leaves its code in the box to fix or retry. Being
        // kicked out of a room you were in leaves nothing to retry.
        this.joinCode = this.joining
        this.joining = ''
        setURL(null)
        if (this.phase !== 'match') this.phase = 'mp'
        break
      case 'err':
        this.roomErr = m.msg
        this.joining = ''
        break
    }
  }

  // --- starting and leaving ------------------------------------------------

  /**
   * The only way into a run that does not go through a room, and the only one
   * that never leaves the browser. The hub's whole contribution to a run of one
   * was a random number and a config it normalized: both are here, the generator
   * that turns them into questions is the same code on both sides, and a solo
   * score has never been eligible for the day's best — see `eligible` in
   * finish(), server/hub.go. So it is dealt here, and the socket stays shut.
   *
   * Fed through onMsg rather than assigned: there is one way a run starts, and
   * a second one would be a second place to forget to clear the claims.
   */
  solo() {
    // A run with other people in it is not yours to end — `match.leave` is the
    // way out of one of those, and it says out loud what it costs everyone else.
    // The refusal used to be the hub's; a local run never reaches it to be told.
    if (
      this.phase === 'match' &&
      !this.match?.spectating &&
      (this.match?.players.length ?? 0) > 1
    ) {
      return
    }
    // Same reason: the `solo` frame used to hand back whatever was being kept
    // for us on its way past, on the rule that asking for a new game is the same
    // statement as leaving the old one. Nothing is sent now, so it happens here.
    if (this.phase === 'match' && this.match?.spectating) this.ask({ t: 'match.leave' })
    if (this.room) this.leaveRoom()

    const cfg = normalize(this.#cfg)
    const seed = new Uint32Array(1)
    crypto.getRandomValues(seed)
    const you = { id: LOCAL_ID, name: this.who }
    this.onMsg({
      t: 'match',
      seed: seed[0],
      cfg,
      durMs: cfg.durSec * 1000,
      startsInMs: localCountdownMs,
      you,
      players: [you],
    })
    this.local = true
  }

  /** The ↻ button, and Enter on the results. Both are offered only where a
      restart costs nobody anything — see canReset — and solo() refuses the rest. */
  reset() {
    if (this.phase === 'over' || this.soloRun) this.solo()
  }

  /**
   * Walking out of a run, a countdown or a spectate. Puts you back where you
   * came in from: a room you are still a member of, otherwise the lobby. The
   * server ends the run for everyone still in it, same as closing the tab.
   */
  leaveMatch() {
    // Nobody to tell about a run nobody else knew about.
    if (!this.local) this.ask({ t: 'match.leave' })
    // A spectator is in nobody's room, so nothing else takes its link down.
    if (this.match?.spectating) setURL(null)
    this.phase = this.room ? 'room' : 'lobby'
  }

  goLobby() {
    // Room first, or ending the run bounces a room frame back and lands you
    // on the room screen you just left.
    if (this.room) this.leaveRoom()
    else setURL(null) // a spectate link, most likely; the lobby is at /
    if (this.canLeave && !this.local) this.ask({ t: 'match.leave' })
    this.phase = 'lobby'
    // Back to the one screen that pays for nothing — and the one that has to
    // ask for what the socket used to bring it.
    this.#nextPollAt = 0
    this.pollLobby()
  }

  goMultiplayer() {
    this.roomErr = ''
    this.phase = 'mp'
    // The board here is live, so this is where the socket earns its keep.
    this.hub()
  }

  goRoom() {
    this.phase = 'room'
  }

  /** Watch whatever is being played in a room. Addressed by code, not by match
      id: it is the thing the board shows and the thing a link can carry. */
  spectate(code: string) {
    if (!validCode(code)) return
    this.ask({ t: 'spectate', code })
  }

  // --- rooms ---------------------------------------------------------------

  createRoom(isPublic: boolean) {
    this.ask({
      t: 'room.create',
      name: this.who,
      public: isPublic,
      cfg: this.#cfg,
    })
  }

  /** Typed into the box, or clicked off the public board — the same join either
      way, so the row on the board fills the box in on its way past and a refused
      one leaves the code there to look at. */
  joinRoom(code = this.joinCode) {
    if (!validCode(code)) return
    this.joinCode = code
    this.joining = code
    this.ask({ t: 'room.join', code, name: this.who })
  }

  cancelJoin() {
    this.joining = ''
  }

  startRoom() {
    this.ask({ t: 'room.start' })
  }

  kick(id: string) {
    this.ask({ t: 'room.kick', id })
  }

  /** Listing or unlisting the room you host. The server checks the host too. */
  setPublic(isPublic: boolean) {
    this.ask({ t: 'room.public', public: isPublic })
  }

  /** Renaming from inside a room. A deep link never shows the lobby's name
      field, so for anyone who arrived on a link this is the first chance to be
      somebody other than `guest`. */
  rename(next: string) {
    this.name = next
    this.ask({ t: 'room.name', name: this.who })
  }

  leaveRoom() {
    this.ask({ t: 'room.leave' })
    this.room = null
    this.joinCode = ''
    this.joining = ''
    setURL(null)
  }

  // --- during a run --------------------------------------------------------

  answer(i: number, v: number, ms: number) {
    if (!this.local) this.ask({ t: 'answer', i, v, ms })
    // Everywhere but rush your score is yours the moment you type it and the
    // round trip only tells the others. In rush the point belongs to whoever
    // got there first, which this browser cannot know — so it waits for the
    // `claim` frame. Unless it is the only browser in the run: then there is
    // nothing to wait for, and the buzz Run let through is the point.
    if (this.match?.cfg.mode === 'rush') {
      if (this.local) {
        const score = (this.scores[this.runId] ?? 0) + 1
        this.onMsg({ t: 'claim', i, id: this.runId, ms, score })
      }
      return
    }
    this.scores = {
      ...this.scores,
      [this.runId]: (this.scores[this.runId] ?? 0) + 1,
    }
  }

  /**
   * The clock ran out locally; the server's `end` frame decides the scores and
   * this is the fallback. Pinned to the run it was armed for, so a restart inside
   * the 2.5s window does not land the new run on the old one's results screen.
   */
  expire() {
    const key = this.runKey
    setTimeout(
      () => {
        if (this.phase !== 'match' || this.runKey !== key || !this.match) return
        this.results = this.match.spectating
          ? []
          : this.match.players.map((p) => ({
              id: p.id,
              name: p.name,
              score: this.scores[p.id] ?? 0,
            }))
        this.phase = 'over'
        // A local run has nobody to wait for, so it only waits long enough to let
        // the last question be read.
      },
      this.local ? localEndMs : 2500,
    )
  }

  // --- settings ------------------------------------------------------------

  /**
   * A new config from the settings bar. In a room the host's word counts and
   * everyone else's is refused. Outside one it is yours, and a solo run in
   * progress is restarted under it — new settings only reach a run at its start.
   */
  setCfg(next: Config, locked: boolean) {
    if (this.room && this.isHost) {
      this.ask({ t: 'room.cfg', cfg: next })
      this.cfg = next // keep your own default in step with the room you run
      return
    }
    if (locked) return
    const changed = sig(next) !== sig(this.#cfg)
    this.cfg = next
    if (!changed) return
    if (this.soloRun) this.solo()
  }
}
