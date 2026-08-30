import { getContext, setContext } from 'svelte'
import type { Config } from './config'
import type { Claim, PlayerInfo } from './net'
import type { Slot } from './rush'

/**
 * The run as a screen reads it: what the server said this match is, who you are,
 * and the records it keeps amending. Getters, not a snapshot: `scores` and
 * `claims` change many times a second, and a frozen copy would stop the run.
 */
export interface RunContext {
  readonly seed: number
  readonly cfg: Config
  readonly durMs: number
  readonly startsInMs: number
  /** Everyone in the run, in the order the graph indexes them. */
  readonly players: PlayerInfo[]
  readonly spectating: boolean
  readonly selfId: string
  /** Scores as the server last reported them, by player id. */
  readonly scores: Record<string, number>
  /** Rush only: who took each slot, as the server settled it. */
  readonly claims: Record<number, Claim>
  /** Rush only: the whole run as questions. See lib/rush.ts. */
  readonly slots: Slot[]
}

/** Module-private, so nothing can reach the run context by guessing a string. */
const KEY = Symbol('zetajam.run')

export function setRunContext(value: RunContext): RunContext {
  return setContext(KEY, value)
}

export function getRunContext(): RunContext {
  return getContext(KEY)
}
