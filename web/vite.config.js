import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web console runs on :5173 in dev; the backend runs on :4000.
//
// We proxy /api and /uploads through the Vite dev server so a browser only ever
// talks to :5173 (which is already exposed on the LAN). Vite forwards those
// requests to the backend on localhost:4000 *from the server machine itself*.
// That's why the console works from another device WITHOUT opening port 4000 in
// the firewall — the phone/other PC never connects to 4000 directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // expose on the LAN so other devices can open it
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
