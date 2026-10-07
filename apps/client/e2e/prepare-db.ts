/**
 * Runs before the e2e API starts: migrates the e2e database (creating it if needed), and empties it.
 * Never touches the dev database.
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { serverEnv } from "./env";

const serverDir = fileURLToPath(new URL("../../server/", import.meta.url));
const env = { ...process.env, ...serverEnv };
const run = (cmd: string, input?: string) =>
  execSync(cmd, { cwd: serverDir, env, input, stdio: input ? ["pipe", "inherit", "inherit"] : "inherit" });

run("pnpm exec prisma migrate deploy");
run("pnpm exec prisma db execute --schema prisma/schema.prisma --stdin", 'TRUNCATE "Todo", "Goal", "Session";');
