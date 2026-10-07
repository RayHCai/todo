import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthenticated } from "../lib/errors";
import type { SessionStore } from "./sessions";

export const SESSION_COOKIE = "sid";

export interface Auth {
  /** `onRequest` hook that rejects requests without a live session. */
  requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  /** Validates the session cookie (sliding it when due) without rejecting. */
  isAuthenticated(request: FastifyRequest, reply: FastifyReply): Promise<boolean>;
  /** The raw token from a correctly signed session cookie, if any. */
  readToken(request: FastifyRequest): string | null;
  setSessionCookie(reply: FastifyReply, token: string): void;
  clearSessionCookie(reply: FastifyReply): void;
}

export function createAuth(options: { sessions: SessionStore; secureCookies: boolean }): Auth {
  const { sessions, secureCookies } = options;
  const baseCookie = {
    path: "/",
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookies,
  } as const;

  const auth: Auth = {
    readToken(request) {
      const raw = request.cookies[SESSION_COOKIE];
      if (!raw) return null;
      const unsigned = request.unsignCookie(raw);
      return unsigned.valid && unsigned.value ? unsigned.value : null;
    },

    setSessionCookie(reply, token) {
      reply.setCookie(SESSION_COOKIE, token, {
        ...baseCookie,
        signed: true,
        maxAge: Math.floor(sessions.ttlMs / 1000),
      });
    },

    clearSessionCookie(reply) {
      reply.clearCookie(SESSION_COOKIE, baseCookie);
    },

    async isAuthenticated(request, reply) {
      const token = auth.readToken(request);
      const result = token ? await sessions.validate(token) : null;
      if (!result) {
        if (request.cookies[SESSION_COOKIE]) auth.clearSessionCookie(reply);
        return false;
      }
      // Keep the browser cookie's Max-Age sliding along with the server-side expiry.
      if (result.bumped && token) auth.setSessionCookie(reply, token);
      return true;
    },

    async requireAuth(request, reply) {
      if (!(await auth.isAuthenticated(request, reply))) throw unauthenticated();
    },
  };
  return auth;
}
