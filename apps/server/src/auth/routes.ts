import { setTimeout as sleep } from "node:timers/promises";
import { LoginBody, SessionResponse } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { unauthenticated } from "../lib/errors";
import type { Auth } from "./guard";
import type { PasswordVerifier } from "./password";
import type { SessionStore } from "./sessions";

export interface AuthRoutesOptions {
  auth: Auth;
  passwords: PasswordVerifier;
  sessions: SessionStore;
  /** Extra delay before answering a wrong password. */
  loginFailureDelayMs: number;
}

export const LOGIN_RATE_LIMIT = { max: 5, timeWindow: "1 minute" } as const;

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, options) => {
  const { auth, passwords, sessions, loginFailureDelayMs } = options;

  app.post(
    "/auth/login",
    {
      schema: { body: LoginBody },
      config: { rateLimit: LOGIN_RATE_LIMIT },
    },
    async (request, reply) => {
      if (!(await passwords.verify(request.body.password))) {
        if (loginFailureDelayMs > 0) await sleep(loginFailureDelayMs);
        throw unauthenticated("Wrong password");
      }
      const { token } = await sessions.create();
      auth.setSessionCookie(reply, token);
      return reply.status(204).send();
    },
  );

  app.get("/auth/session", { schema: { response: { 200: SessionResponse } } }, async (request, reply) => ({
    authenticated: await auth.isAuthenticated(request, reply),
  }));

  app.post("/auth/logout", { onRequest: auth.requireAuth }, async (request, reply) => {
    const token = auth.readToken(request);
    if (token) await sessions.revoke(token);
    auth.clearSessionCookie(reply);
    return reply.status(204).send();
  });
};
