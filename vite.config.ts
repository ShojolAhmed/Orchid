import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Spotify only accepts loopback redirect URIs written as an IP literal (never "localhost"), and the
// sign-in attempt is saved per origin. So the dev and preview servers are pinned to 127.0.0.1:5173,
// matching the redirect URI in .env.example. `strictPort` fails loudly instead of silently moving to
// another port, which would break the redirect.
const server = { host: '127.0.0.1', port: 5173, strictPort: true }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server,
  preview: server,
})
