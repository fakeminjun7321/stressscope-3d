import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/stressscope-3d/",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
