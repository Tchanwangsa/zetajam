/**
 * Room deep links. `zetajam.app/r/QK4M` opens straight onto the join screen
 * with the code filled in. Path form is the shareable one; the query form is
 * kept because a static host without a rewrite rule 404s on the path.
 */

import { pageView } from './analytics'

export const CODE_LEN = 4
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/

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

/** The code in the current URL, if there is a plausible one. */
export function codeFromURL(): string {
  const path = location.pathname.match(/^\/r\/([^/]+)\/?$/)
  const raw = path?.[1] ?? new URLSearchParams(location.search).get('room') ?? ''
  const code = cleanCode(raw)
  return validCode(code) ? code : ''
}

export function roomLink(code: string): string {
  return `${location.origin}/r/${code}`
}

/**
 * Reflect the room in the address bar without a reload, so the link is there
 * to copy. Replaces rather than pushes: a room is a place you are, not a page
 * you visited.
 */
export function setURL(code: string | null) {
  const next = code ? `/r/${code}` : '/'
  if (location.pathname !== next || location.search) {
    history.replaceState(null, '', next)
    // The one place the address changes, so the one place a view is reported.
    pageView()
  }
}
