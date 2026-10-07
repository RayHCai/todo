/**
 * The end-to-end suite runs its own API on a separate database so it never touches dev data.
 * Real environment variables override apps/server/.env, so these win.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// docker-compose reads DB_PORT from the repo-root .env; read it too so the e2e database matches.
const rootEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const E2E_PASSWORD = "e2e-correct-horse";
export const API_PORT = 3100;
export const WEB_PORT = 5174;

const dbPort = process.env.DB_PORT ?? "5432";

export const serverEnv: Record<string, string> = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? `postgresql://todo:todo@localhost:${dbPort}/todo_e2e`,
  APP_PASSWORD: E2E_PASSWORD,
  COOKIE_SECRET: "e2e-cookie-secret-e2e-cookie-secret-0123456789",
  PORT: String(API_PORT),
  NODE_ENV: "development",
};
