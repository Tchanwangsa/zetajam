import type { Config } from './config'

export interface PlayerInfo {
  id: string
  name: string
}

export interface MatchResult {
  id: string
  name: string
  score: number
  flagged?: boolean
}

export interface GameInfo {
  id: string
  n1: string
  n2: string
  s1: number
  s2: number
}

export type Msg =
  | { t: 'welcome'; self: PlayerInfo; best?: MatchResult }
  | { t: 'queued' }
  | {
      t: 'match'
      seed: number
      /** Normalized by the server. This, not the local copy, is what the
          question generator runs on — both sides of a match use it verbatim. */
      cfg: Config
      durMs: number
      startsInMs: number
      you: PlayerInfo
      opp?: PlayerInfo
      spectating?: boolean
    }
  | { t: 'score'; id: string; score: number; ms: number }
  | { t: 'end'; results: MatchResult[]; best?: MatchResult }
  | { t: 'online'; online: number; playing: number }
  | { t: 'games'; games: GameInfo[] }
  | { t: 'err'; msg: string }

function wsURL(): string {
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
