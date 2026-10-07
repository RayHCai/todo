import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type { PrismaClient } from "@prisma/client";
import Fastify, { type FastifyServerOptions } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuth } from "./auth/guard";
import { createPasswordVerifier } from "./auth/password";
import { authRoutes } from "./auth/routes";
import { createSessionStore } from "./auth/sessions";
import type { Env } from "./env";
import { notFound, rateLimited, registerErrorHandling } from "./lib/errors";
import { boardRoutes } from "./routes/board";
import { goalRoutes } from "./routes/goals";
import { healthRoutes } from "./routes/health";
import { historyRoutes } from "./routes/history";
import { todoRoutes } from "./routes/todos";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export interface AppOptions {
  env: Env;
  prisma: PrismaClient;
  /** Defaults to pino with secrets redacted; tests pass `false`. */
  logger?: FastifyServerOptions["logger"];
  /** Delay added to each failed login, to slow down password guessing. */
  loginFailureDelayMs?: number;
  /** Built client to serve with an SPA fallback. Omit to serve the API only. */
  clientDistDir?: string;
}

const BODY_LIMIT_BYTES = 16 * 1024;
const SESSION_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function defaultLogger(env: Env): FastifyServerOptions["logger"] {
  return {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: {
      paths: ["req.body.password", "req.headers.cookie", 'res.headers["set-cookie"]'],
      censor: "[redacted]",
    },
  };
}

export async function buildApp(options: AppOptions) {
  const { env, prisma } = options;

  const app = Fastify({
    logger: options.logger ?? defaultLogger(env),
    bodyLimit: BODY_LIMIT_BYTES,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);
  app.decorate("prisma", prisma);

  await app.register(fastifyHelmet);
  await app.register(fastifyCookie, { secret: env.COOKIE_SECRET });
  await app.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_request, context) => rateLimited(`Too many login attempts, try again in ${context.after}`),
  });

  // Auth state: the password hash lives only in memory; sessions are revoked when it changes.
  const passwords = await createPasswordVerifier(env.APP_PASSWORD, env.COOKIE_SECRET);
  const sessions = createSessionStore({
    prisma,
    ttlDays: env.SESSION_TTL_DAYS,
    passwordFingerprint: passwords.fingerprint,
  });
  const auth = createAuth({ sessions, secureCookies: env.NODE_ENV === "production" });

  const revoked = await sessions.purgeOtherPasswords();
  const expired = await sessions.purgeExpired();
  if (revoked + expired > 0) app.log.info({ revoked, expired }, "purged sessions at boot");

  const purgeTimer = setInterval(() => {
    sessions
      .purgeExpired()
      .then((count) => count > 0 && app.log.info({ count }, "purged expired sessions"))
      .catch((err: unknown) => app.log.error({ err }, "session purge failed"));
  }, SESSION_PURGE_INTERVAL_MS);
  purgeTimer.unref();
  app.addHook("onClose", async () => clearInterval(purgeTimer));

  await app.register(
    async (api) => {
      // Public: health, login, session check.
      await api.register(healthRoutes);
      await api.register(authRoutes, {
        auth,
        passwords,
        sessions,
        loginFailureDelayMs: options.loginFailureDelayMs ?? 500,
      });

      // Everything else under /api requires a session.
      await api.register(async (guarded) => {
        // onRequest (not preHandler) so the guard runs before body parsing and validation:
        // an unauthenticated caller always gets 401, never a 400 that reveals the schema.
        guarded.addHook("onRequest", auth.requireAuth);
        await guarded.register(boardRoutes);
        await guarded.register(todoRoutes);
        await guarded.register(goalRoutes);
        await guarded.register(historyRoutes);
      });
    },
    { prefix: "/api" },
  );

  const clientDir = options.clientDistDir;
  const serveClient = clientDir !== undefined && existsSync(join(clientDir, "index.html"));
  if (clientDir !== undefined && !serveClient) {
    app.log.warn({ clientDir }, "client build not found; serving the API only");
  }
  if (serveClient) {
    await app.register(fastifyStatic, {
      root: clientDir,
      setHeaders(reply, path) {
        // Vite fingerprints everything in assets/, so those files never change.
        if (/[\\/]assets[\\/]/.test(path)) {
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          reply.header("Cache-Control", "no-cache");
        }
      },
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    const isApi = request.url === "/api" || request.url.startsWith("/api/");
    if (serveClient && !isApi && (request.method === "GET" || request.method === "HEAD")) {
      // SPA fallback: client-side routes all load index.html.
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    }
    throw notFound("Route");
  });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
