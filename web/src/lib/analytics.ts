/**
 * Google Analytics. The tag is only injected into production builds — see the
 * analytics plugin in vite.config.ts — so every call in here is a no-op in
 * development, and the module stays safe to call unconditionally.
 */

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void
  }
}

/**
 * Where somebody is, as far as a report is concerned. The address bar cannot
 * answer this: the lobby, the join screen, a solo run and its results all
 * happen at `/`, and a room and a run inside it share the one `/r/CODE`. So
 * the screen is named here and reported as the page instead.
 */
export type Screen =
  | 'home'
  | 'multiplayer'
  | 'room'
  | 'solo-game'
  | 'solo-results'
  | 'room-game'
  | 'room-results'
  | 'spectate'
  | 'spectate-results'

/** Path and title per screen. The paths are invented, not navigated to. */
const PAGES: Record<Screen, readonly [path: string, title: string]> = {
  home: ['/', 'Home'],
  multiplayer: ['/multiplayer', 'Multiplayer lobby'],
  room: ['/room', 'Room'],
  'solo-game': ['/solo', 'Solo run'],
  'solo-results': ['/solo/results', 'Solo results'],
  'room-game': ['/room/game', 'Room run'],
  'room-results': ['/room/results', 'Room results'],
  spectate: ['/spectate', 'Spectating'],
  'spectate-results': ['/spectate/results', 'Spectator results'],
}

/**
 * Report a screen as a page view. Called once per screen change and nowhere
 * else; the tag is configured with send_page_view off so these are the only
 * views sent.
 *
 * `set` before the event, rather than parameters on it, because gtag stamps
 * *every* event with the real location.href otherwise — session_start,
 * user_engagement and the enhanced-measurement ones included — and a room code
 * is private by default (the same reason robots.txt disallows /r/). Sending an
 * invented path globally is what keeps the code out of all of them, rather
 * than only out of the view.
 */
export function pageView(screen: Screen): void {
  const [path, title] = PAGES[screen]
  window.gtag?.('set', { page_location: location.origin + path, page_title: title })
  window.gtag?.('event', 'page_view')
}
