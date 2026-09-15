import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

// Port 8000 matches the backend's default PUBLIC_SITE_ORIGINS entry, so a dev
// build pointed at http://localhost:3000 passes CORS without editing backend env.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8000,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: false
  }
});
