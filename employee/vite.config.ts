import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Same story as `admin/`: in production Fastify serves this SPA and the API
// from one origin, so the session cookie is same-origin. The dev proxy
// recreates that, which keeps cookies working without adding this port to the
// backend's CORS allow-list.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig(({ command }) => ({
  plugins: [react()],

  // Production serves this app under /staff (see the deployment section of
  // docs/backend-admin-plan.md — it is also what `admin/`'s
  // VITE_EMPLOYEE_APP_URL falls back to). The dev server stays at the root of
  // its own port so `VITE_EMPLOYEE_APP_URL=http://localhost:5174` lands here.
  base: command === "build" ? "/staff/" : "/",

  server: {
    // 5173 is admin/, 8000 is the customer site. Fixed, not "next free port":
    // admin/ links here by URL, so a silent port bump would 404 that link.
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false }
    }
  },

  build: {
    outDir: "dist",
    sourcemap: false
  }
}));
