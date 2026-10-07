import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

/**
 * Brings the disposable test database up to date with the migrations (creating it if needed).
 * Tests truncate the tables they use, so the database is never reset as a whole.
 */
export default function setup(project: TestProject): void {
  const databaseUrl = project.config.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set for tests");
  // The suite wipes this database; refuse anything that doesn't look disposable.
  if (!/\/[^/?]*_test(\?|$)/.test(databaseUrl)) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in "_test": ${databaseUrl}`);
  }
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
}
