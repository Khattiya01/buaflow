import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev only: proxy API calls to the FastAPI backend running on 8000 so the
    // browser sees same-origin requests (matches how the built app is served in
    // production — FastAPI serves the built frontend, see backend/app/main.py).
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
  },
});
