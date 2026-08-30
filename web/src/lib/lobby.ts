import { httpBase, type GameInfo, type MatchResult } from './net'

/**
 * The first screen's whole share of the server, fetched rather than pushed.
 * Mirrors lobbyView in server/hub.go. Nothing here is worth a held-open socket:
 * two counts, a leaderboard line and a short list of runs to watch, none of
 * which change fast enough to be missed between polls.
 */
export interface LobbyView {
  online: number
  playing: number
  /** Absent until somebody has set one today — `omitempty`, as on the wire. */
  best?: MatchResult
  games?: GameInfo[]
}

/** Null on any failure: the lobby draws without this, and an outage should cost
    it a stale number rather than an error. */
export async function fetchLobby(): Promise<LobbyView | null> {
  try {
    const r = await fetch(`${httpBase()}/api/lobby`)
    return r.ok ? ((await r.json()) as LobbyView) : null
  } catch {
    return null
  }
}
