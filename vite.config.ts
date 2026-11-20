import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build loads from the Tauri bundle.
  base: "./",
  // Tauri expects a fixed dev port (see src-tauri/tauri.conf.json).
  server: { port: 1420, strictPort: true },
  clearScreen: false,
});
