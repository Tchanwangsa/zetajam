import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Two build targets out of one config:
//
//   vite build                  -> ../server/dist, which the Go binary embeds
//   WEB_OUT=dist vite build     -> web/dist, for a static host
//
// The second is what Vercel or Cloudflare Pages builds, and it needs
// VITE_WS_URL set to wherever the Go server actually lives — see lib/net.ts.
export default defineConfig({
  plugins: [svelte()],
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
