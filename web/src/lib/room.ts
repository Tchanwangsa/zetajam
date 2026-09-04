/**
 * Room deep links. `zetajam.app/r/QK4M` opens straight onto the join screen
 * with the code filled in; `/r/QK4M/spectate` opens straight into watching
 * whatever is being played in there. Path form is the shareable one; the query
 * form is kept because a static host without a rewrite rule 404s on the path.
 */

export const CODE_LEN = 4
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/

/** A link into a room, and which of its two doors was asked for. */
export interface RoomLink {
  code: string
  /** Watch the run rather than join the room. */
  watch: boolean
}

export function validCode(code: string): boolean {
  return CODE_RE.test(code)
}

/** Strip whatever the user pasted down to a candidate code. */
export function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LEN)
}

/** The room in the current URL, if there is a plausible one. */
export function linkFromURL(): RoomLink {
  const path = location.pathname.match(/^\/r\/([^/]+)(\/spectate)?\/?$/)
  const query = new URLSearchParams(location.search)
  const code = cleanCode(path?.[1] ?? query.get('room') ?? '')
  if (!validCode(code)) return { code: '', watch: false }
  return { code, watch: !!path?.[2] || query.has('spectate') }
}

export function roomLink(code: string): string {
  return `${location.origin}/r/${code}`
}

/**
 * Reflect the room in the address bar without a reload, so the link is there
 * to copy. Replaces rather than pushes: a room is a place you are, not a page
 * you visited. `watch` writes the spectator's door instead of the joiner's —
 * the two are the same room and a very different invitation.
 */
export function setURL(code: string | null, watch = false) {
  const next = code ? `/r/${code}${watch ? '/spectate' : ''}` : '/'
  if (location.pathname !== next || location.search) {
    history.replaceState(null, '', next)
  }
}
