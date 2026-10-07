import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "./app";
import { loadDotEnv, parseEnv, type Env } from "./env";

function readEnv(): Env {
  try {
    loadDotEnv();
    return parseEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const env = readEnv();
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });

const app = await buildApp({
  env,
  prisma,
  // In production Fastify serves the built client from the same origin, so no CORS is needed.
  clientDistDir:
    env.NODE_ENV === "production" ? fileURLToPath(new URL("../../client/dist/", import.meta.url)) : undefined,
});

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "shutting down");
  try {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "error during shutdown");
    process.exit(1);
  }
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
  await app.listen({
    port: env.PORT,
    host: env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  });
} catch (err) {
  app.log.error({ err }, "failed to start");
  await prisma.$disconnect();
  process.exit(1);
}
