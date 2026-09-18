import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src/client") } },
  server: {
    proxy: {
      // On the platform every request carries a verified X-Clawnify-Org-Id that
      // app-router injects and a client cannot forge. `vite dev` has no such
      // perimeter, so without this the authenticated routes answer 403 on a
      // fresh clone and the app looks broken. Dev only: the deploy pipeline
      // drops this file.
      "/api": {
        target: "http://localhost:8794",
        changeOrigin: true,
        headers: { "X-Clawnify-Org-Id": "local-dev-org", "X-Clawnify-Caller": "user" },
      },
      // The widget loader. Trailing slash on purpose: a bare "/w" prefix would
      // also swallow the admin's own screens.
      "/w/": { target: "http://localhost:8794", changeOrigin: true },
    },
  },
});
