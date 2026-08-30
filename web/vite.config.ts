import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// The public address of the page, used by everything a crawler or a social
// scraper reads: the canonical link, the og:/twitter: URLs, the JSON-LD, and
// the robots.txt and sitemap.xml written below. Those all need an absolute URL
// — a scraper is never on this origin — and they all need the *same* absolute
// URL, so it is resolved once here rather than pasted into five files.
const SITE_URL = (process.env.VITE_SITE_URL ?? 'https://zetajam.vercel.app').replace(/\/+$/, '')

// Substitutes %SITE_URL% into index.html and generates the two crawler files
// from the same constant. They are generated rather than kept in public/
// because a stale hostname in a sitemap is worse than no sitemap at all.
function seo(): Plugin {
  const robots = `User-agent: *
Allow: /

# Room codes are ephemeral and private-by-default; there is nothing at one of
# these to index and following them would join a crawler to a live match.
Disallow: /r/

Sitemap: ${SITE_URL}/sitemap.xml
`
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
  const files: Record<string, string> = {
    '/robots.txt': robots,
    '/sitemap.xml': sitemap,
  }

  return {
    name: 'zetajam-seo',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%SITE_URL%', SITE_URL),
    },
    // Dev serves them too, so what you check locally is what ships.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const body = files[req.url?.split('?')[0] ?? '']
        if (body === undefined) return next()
        res.setHeader('Content-Type', req.url!.endsWith('.xml') ? 'application/xml' : 'text/plain')
        res.end(body)
      })
    },
    generateBundle() {
      for (const [path, source] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source })
      }
    },
  }
}

// Two build targets out of one config:
//
//   vite build                  -> ../server/dist, which the Go binary embeds
//   WEB_OUT=dist vite build     -> web/dist, for a static host
//
// The second is what Vercel or Cloudflare Pages builds, and it needs
// VITE_WS_URL set to wherever the Go server actually lives — see lib/net.ts.
export default defineConfig({
  plugins: [svelte(), seo()],
  build: {
    // The Go binary embeds this directory, so it has to land inside the
    // server package — `embed` cannot reach out of its own tree.
    outDir: process.env.WEB_OUT ?? '../server/dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
})
