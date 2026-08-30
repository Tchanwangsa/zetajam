import type { PlayerInfo } from './net'

/**
 * Line colours. You are always the accent; everybody else takes the next free
 * slot in roster order, so a colour means the same person on every screen.
 */
export const SEATS = 7

export function colorFor(index: number, youIndex: number): string {
  if (youIndex >= 0 && index === youIndex) return 'var(--accent)'
  // Skip your seat so the palette lasts in a full room. A spectator has no
  // seat, so nothing is skipped and nobody gets the accent.
  const slot = youIndex >= 0 && index > youIndex ? index - 1 : index
  return `var(--p${(slot % SEATS) + 1})`
}

export interface Seat {
  id: string
  name: string
  score: number
  color: string
  you: boolean
}

export function seats(
  players: PlayerInfo[],
  scores: Record<string, number>,
  selfId: string,
): Seat[] {
  const youIndex = players.findIndex((p) => p.id === selfId)
  return players.map((p, i) => ({
    id: p.id,
    name: p.name,
    score: scores[p.id] ?? 0,
    color: colorFor(i, youIndex),
    you: p.id === selfId,
  }))
}
