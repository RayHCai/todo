import { defineConfig, devices } from "@playwright/test";
import { API_PORT, WEB_PORT, serverEnv } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${WEB_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 860 } } }],
  webServer: [
    {
      command: "pnpm exec tsx ../client/e2e/prepare-db.ts && pnpm exec tsx src/index.ts",
      cwd: "../server",
      env: serverEnv,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      env: { API_ORIGIN: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
});
