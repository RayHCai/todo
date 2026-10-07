import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API runs on Fastify; in production it serves this build from the same origin.
    // API_ORIGIN lets the end-to-end suite point at its own server.
    proxy: { "/api": process.env.API_ORIGIN ?? "http://127.0.0.1:3000" },
  },
  css: { modules: { localsConvention: "camelCaseOnly" } },
});
