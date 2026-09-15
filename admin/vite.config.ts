import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The SPA talks to the API over a same-origin path in production (Fastify serves
// both). In dev the proxy recreates that, which keeps the session cookie
// same-origin and sidesteps SameSite handling entirely.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Production serves this app under /admin (see the deployment section of
  // docs/backend-admin-plan.md), so built asset URLs have to carry that
  // prefix. The dev server stays at the root of its own port.
  base: command === "build" ? "/admin/" : "/",

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
}));
