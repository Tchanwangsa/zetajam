import type { Config } from './config'

export interface PlayerInfo {
  id: string
  name: string
}

/** Who took a rush slot, and at what point on the match clock. */
export interface Claim {
  id: string
  ms: number
}

export interface MatchResult {
  id: string
  name: string
  score: number
  flagged?: boolean
}

/**
 * One finished run, as the room remembers it. The results keep the ids of
 * players who have since left, so the session record does not quietly forget
 * whoever walked out after losing — see lib/session.ts.
 */
export interface RoomGame {
  id: string
  results: MatchResult[]
  /** What it was played on. The host can change the settings between runs. */
  cfg?: Config
}

export interface RoomInfo {
  code: string
  hostId: string
  members: PlayerInfo[]
  cfg: Config
  /** Listed on the public board, or reachable only by its code. */
  public: boolean
  /** Every run played in this room, oldest first, capped by the server.
      `omitempty`: absent while the room has played nothing. */
  log?: RoomGame[]
}

/** One row of the public board. Private rooms never appear in it. */
export interface RoomBrief {
  code: string
  host: string
  members: number
  max: number
  /** Mid-run — the room is on the board but the door is shut. */
  playing: boolean
  cfg: Config
}

export type Msg =
  | { t: 'welcome'; self: PlayerInfo; best?: MatchResult }
  | {
      t: 'match'
      seed: number
      /** Normalized by the server. This, not the local copy, is what the
          generator runs on — every side of a match uses it verbatim. */
      cfg: Config
      durMs: number
      startsInMs: number
      /** Absent for a spectator, who is not one of the players. */
      you?: PlayerInfo
      /** Everyone in the run, in the order scores should be laid out. */
      players: PlayerInfo[]
      spectating?: boolean
      /** The room the run is in. Sent to a spectator only — it is what the
          address bar says while watching. See setURL in lib/room.ts. */
      code?: string
    }
  // Optional because the server drops a zero-valued field rather than sending
  // it — `omitempty`.
  | { t: 'score'; id: string; score?: number; ms?: number }
  /** Rush: slot `i` has been taken by `id`, and nobody else can have it. Sent
      to the buzzer too — you do not know you won until this arrives. `i` is a
      real 0 on the first slot, so the server sends it as a pointer rather than
      letting `omitempty` swallow it. */
  | { t: 'claim'; i: number; id: string; score?: number; ms?: number }
  | { t: 'end'; results: MatchResult[]; best?: MatchResult }
  | { t: 'online'; online?: number; playing?: number }
  // `omitempty`: an empty board is absent from the frame, not sent as [].
  | { t: 'rooms'; rooms?: RoomBrief[] }
  | { t: 'room'; room: RoomInfo }
  | { t: 'room.gone'; msg: string }
  | { t: 'err'; msg: string }

/**
 * Where the hub is. Same origin in dev and in the single-binary build;
 * VITE_WS_URL when the page and the socket are hosted apart. The server has to
 * name that origin back — see ORIGINS in server/main.go. Given as either
 * scheme; the two below take it whichever way it was written.
 */
function hubOrigin(): string {
  return (import.meta.env.VITE_WS_URL || location.origin).replace(/\/$/, '')
}

/** The hub over plain HTTP, for the lobby — see lib/lobby.ts. */
export function httpBase(): string {
  const u = hubOrigin()
  if (u.startsWith('wss:')) return 'https:' + u.slice(4)
  if (u.startsWith('ws:')) return 'http:' + u.slice(3)
  return u
}

function wsURL(): string {
  const u = hubOrigin()
  if (u.startsWith('https:')) return 'wss:' + u.slice(6) + '/ws'
  if (u.startsWith('http:')) return 'ws:' + u.slice(5) + '/ws'
  return u + '/ws'
}

/**
 * The close code the hub uses to say "you were idle, stay down". A plain close
 * is a network blip as far as this class is concerned and it reconnects out of
 * one within the second, which would undo the saving entirely — see clientIdle
 * in server/hub.go.
 */
const CLOSE_IDLE = 4001

/** A websocket that reconnects and buffers. Deliberately dumb. */
export class Net {
  private ws: WebSocket | null = null
  private backlog: string[] = []
  private retry = 0
  private closed = false
  /**
   * Down on purpose, and allowed back up — unlike `closed`, which is for good.
   * Nothing reconnects while this is set. See sleep().
   *
   * Starts set: nothing connects until something wants the hub. Most of a visit
   * to the lobby wants nothing from it, and a socket opened on page load is one
   * billed for the whole visit — see needsHub in lib/client.svelte.ts.
   */
  private asleep = true
  /** The pending reconnect, held so sleep() can call it off. Without this a
      backoff scheduled just before we went down would wake us right back up. */
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private onMsg: (m: Msg) => void,
    private onStatus: (up: boolean) => void,
  ) {}

  private connect() {
    if (this.closed || this.asleep) return
    const ws = new WebSocket(wsURL())
    this.ws = ws

    ws.onopen = () => {
      this.retry = 0
      this.onStatus(true)
      for (const m of this.backlog.splice(0)) ws.send(m)
    }
    ws.onmessage = (e) => {
      try {
        this.onMsg(JSON.parse(e.data))
      } catch {
        /* ignore malformed frames */
      }
    }
    ws.onclose = (e) => {
      // Set before the status goes out: the hub swept us, and this takes the
      // state a sleep() would have left, so the next wake() — a click, a tab
      // coming back — brings us up again.
      if (e.code === CLOSE_IDLE) this.asleep = true
      this.onStatus(false)
      if (this.closed || this.asleep) return
      const wait = Math.min(8000, 400 * 2 ** this.retry++)
      this.timer = setTimeout(() => this.connect(), wait)
    }
    ws.onerror = () => ws.close()
  }

  send(m: Record<string, unknown>) {
    const raw = JSON.stringify(m)
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(raw)
    else {
      this.backlog.push(raw)
      // Something wants the server while we are down. Sleeping is a guess
      // about idleness and this is proof it was wrong, so take it back rather
      // than leave the message to rot in the backlog.
      this.wake()
    }
  }

  /**
   * Put the socket down until wake(), keeping anything sent meanwhile. The
   * host bills a websocket for every second it stays open, so an unattended
   * tab is a standing charge: the ping/pong in server/main.go is doing its
   * job, and its job is to make sure this connection never lapses on its own.
   * Only safe where nothing on the server is holding a place for you — the
   * hub drops you out of your room the moment the socket closes.
   */
  sleep() {
    if (this.closed || this.asleep) return
    this.asleep = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.ws?.close()
  }

  /** Whether the socket is down on purpose. Worth drawing differently from a
      drop: one is us saving money, the other is something being wrong. */
  get sleeping(): boolean {
    return this.asleep
  }

  /** Back up now, at full speed — a wake is a fresh start, not a retry. */
  wake() {
    if (this.closed || !this.asleep) return
    this.asleep = false
    this.retry = 0
    this.connect()
  }

  close() {
    this.closed = true
    this.ws?.close()
  }
}
