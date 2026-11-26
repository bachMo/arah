import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = env.VITE_API_PROXY || "http://localhost:8000";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: { "/api": { target, changeOrigin: false } },
    },
    preview: { port: 4173, proxy: { "/api": { target } } },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ["three"],
            vendor: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
          },
        },
      },
    },
  };
});
