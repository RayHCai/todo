import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://todo:todo@localhost:5432/todo_test";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["test/global-setup.ts"],
          env: { DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
          // Integration tests share one database.
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
