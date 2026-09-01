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
 * Collapse a room code out of an address. A code names a live match that is
 * private by default (the same reason robots.txt disallows /r/), so it is
 * replaced by a literal `:code` before the URL leaves the browser — in the
 * path form and in the `?room=` fallback a host without a rewrite rule serves.
 */
export function sanitize(href: string): string {
  const url = new URL(href)
  url.pathname = url.pathname.replace(/^\/r\/[^/]+\/?$/, '/r/:code')
  if (url.searchParams.has('room')) url.searchParams.set('room', ':code')
  return url.toString()
}

/**
 * Report the current address as a page view. Called on mount and again from
 * room.setURL, which is the only place the address bar changes; the tag itself
 * is configured with send_page_view off so these are the only views sent.
 */
export function pageView(): void {
  window.gtag?.('event', 'page_view', { page_location: sanitize(location.href) })
}
