import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The SPA talks to the API over a same-origin path in production (Fastify serves
// both). In dev the proxy recreates that, which keeps the session cookie
// same-origin and sidesteps SameSite handling entirely.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
