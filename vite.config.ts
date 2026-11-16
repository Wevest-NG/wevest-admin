/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The dashboard and the API must share an origin (the refresh token is an HttpOnly cookie, and the API has no CORS).
// In development the dev server proxies the API; in production put both behind one reverse proxy (see README).
const api = process.env.WEVEST_API ?? 'http://localhost:3005'

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { port: 5173, proxy: { '/v1': { target: api, changeOrigin: false }, '/health': api } },
  build: { sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 700 },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false, testTimeout: 15_000 },
})
