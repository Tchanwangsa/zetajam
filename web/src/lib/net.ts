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

/** One row of the spectate list. Names and scores are parallel, in match order. */
export interface GameInfo {
  id: string
  names: string[]
  scores: number[]
}

/**
 * One finished run, as the room remembers it. The results carry the ids of
 * players who have since left, so a session's record does not quietly forget
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
      Dropped from the frame entirely while the room has played nothing —
      `omitempty` again, so it is not safe to read unguarded. */
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
          question generator runs on — every side of a match uses it verbatim. */
      cfg: Config
      durMs: number
      startsInMs: number
      /** Absent for a spectator, who is not one of the players. */
      you?: PlayerInfo
      /** Everyone in the run, in the order scores should be laid out. */
      players: PlayerInfo[]
      spectating?: boolean
    }
  // Numbers here are optional because the server drops a zero-valued field
  // rather than sending it — see the `omitempty` note in App.svelte.
  | { t: 'score'; id: string; score?: number; ms?: number }
  /** Rush: slot `i` has been taken by `id`, and nobody else can have it.
      Sent to the buzzer too — in rush you do not know you won until this
      arrives, because the point goes to whichever frame reached the server
      first. `i` is a real 0 on the first slot, so the server sends it as a
      pointer rather than letting `omitempty` swallow it. */
  | { t: 'claim'; i: number; id: string; score?: number; ms?: number }
  | { t: 'end'; results: MatchResult[]; best?: MatchResult }
  | { t: 'online'; online?: number; playing?: number }
  // Both lists are dropped from the frame entirely when they are empty — see
  // the `omitempty` note in App.svelte — so neither is safe to read unguarded.
  | { t: 'games'; games?: GameInfo[] }
  | { t: 'rooms'; rooms?: RoomBrief[] }
  | { t: 'room'; room: RoomInfo }
  | { t: 'room.gone'; msg: string }
  | { t: 'err'; msg: string }

/**
 * Where the hub is. Same origin in development and in the single-binary build;
 * VITE_WS_URL when the frontend is hosted apart from the server — a static host
 * for the page, Cloud Run for the socket. The server has to name that origin
 * back, see ORIGINS in server/main.go.
 */
function wsURL(): string {
  const explicit = import.meta.env.VITE_WS_URL
  if (explicit) {
    return explicit.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws'
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws`
}

/**
 * A websocket that reconnects and buffers. Deliberately dumb — the protocol
 * carries so little traffic that nothing here needs to be clever.
 */
export class Net {
  private ws: WebSocket | null = null
  private backlog: string[] = []
  private retry = 0
  private closed = false

  constructor(
    private onMsg: (m: Msg) => void,
    private onStatus: (up: boolean) => void,
  ) {
    this.connect()
  }

  private connect() {
    if (this.closed) return
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
    ws.onclose = () => {
      this.onStatus(false)
      if (this.closed) return
      const wait = Math.min(8000, 400 * 2 ** this.retry++)
      setTimeout(() => this.connect(), wait)
    }
    ws.onerror = () => ws.close()
  }

  send(m: Record<string, unknown>) {
    const raw = JSON.stringify(m)
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(raw)
    else this.backlog.push(raw)
  }

  close() {
    this.closed = true
    this.ws?.close()
  }
}
