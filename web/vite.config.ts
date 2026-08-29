import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  build: {
    // The Go binary embeds this directory, so it has to land inside the
    // server package — `embed` cannot reach out of its own tree.
    outDir: '../server/dist',
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
