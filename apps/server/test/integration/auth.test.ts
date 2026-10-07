import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../../src/app";
import { hashToken } from "../../src/auth/sessions";
import { cookiePair, createApp, login, prisma, resetDb, TEST_PASSWORD, testEnv } from "../helpers";

let app: App;

beforeEach(async () => {
  await resetDb();
  app = await createApp();
});

afterEach(async () => {
  await app.close();
});

const loginWith = (password: string) => app.inject({ method: "POST", url: "/api/auth/login", payload: { password } });

describe("public endpoints", () => {
  it("GET /api/health pings the DB without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("GET /api/auth/session reports unauthenticated without a cookie", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/session" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ authenticated: false });
  });

  it("sets security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });
});

describe("login", () => {
  it("succeeds with the right password and sets a hardened session cookie", async () => {
    const res = await loginWith(TEST_PASSWORD);
    expect(res.statusCode).toBe(204);

    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toMatch(/^sid=/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).not.toContain("Secure"); // not production

    const cookie = cookiePair(res.headers["set-cookie"]);
    const session = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } });
    expect(session.json()).toEqual({ authenticated: true });
  });

  it("stores only a hash of the token", async () => {
    const res = await loginWith(TEST_PASSWORD);
    const signed = decodeURIComponent(cookiePair(res.headers["set-cookie"]).slice("sid=".length));
    const unsigned = app.unsignCookie(signed);
    expect(unsigned.valid).toBe(true);

    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(unsigned.value!));
    expect(rows[0]!.tokenHash).not.toBe(unsigned.value);
  });

  it("fails with the wrong password", async () => {
    const res = await loginWith("not-the-password");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Wrong password" },
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it("rejects a missing password as a validation error", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("delays failed attempts by about 500 ms", async () => {
    const slowApp = await createApp({ loginFailureDelayMs: undefined }); // use the default
    try {
      const started = performance.now();
      const res = await slowApp.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: "wrong-password" },
      });
      expect(res.statusCode).toBe(401);
      expect(performance.now() - started).toBeGreaterThanOrEqual(450);
    } finally {
      await slowApp.close();
    }
  });

  it("is rate limited to 5 attempts per minute per IP", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await loginWith("wrong-password")).statusCode).toBe(401);
    }
    // Even the right password is refused once the limit is hit.
    const limited = await loginWith(TEST_PASSWORD);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBeDefined();

    // A different IP has its own budget.
    const other = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: TEST_PASSWORD },
      remoteAddress: "10.0.0.2",
    });
    expect(other.statusCode).toBe(204);
  });

  it("marks the cookie Secure in production", async () => {
    const prodApp = await createApp({ env: testEnv({ NODE_ENV: "production" }) });
    try {
      const res = await prodApp.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { password: TEST_PASSWORD },
      });
      expect(String(res.headers["set-cookie"])).toContain("Secure");
    } finally {
      await prodApp.close();
    }
  });
});

describe("guard", () => {
  const board = (cookie?: string) =>
    app.inject({
      method: "GET",
      url: "/api/board?today=2026-10-06",
      headers: cookie ? { cookie } : {},
    });

  it("rejects a missing cookie", async () => {
    const res = await board();
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a cookie with a bad signature and clears it", async () => {
    const cookie = await login(app);
    const res = await board(`${cookie.slice(0, -4)}AAAA`);
    expect(res.statusCode).toBe(401);
    expect(String(res.headers["set-cookie"])).toMatch(/^sid=;/);
  });

  it("rejects a correctly signed token with no session", async () => {
    const res = await board(`sid=${encodeURIComponent(app.signCookie("made-up-token"))}`);
    expect(res.statusCode).toBe(401);
  });

  it("rejects an expired session", async () => {
    const cookie = await login(app);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await board(cookie)).statusCode).toBe(401);
  });

  it("protects every non-public route", async () => {
    const routes = [
      ["GET", "/api/board?today=2026-10-06"],
      ["GET", "/api/history?from=2026-10-01&to=2026-10-31"],
      ["POST", "/api/todos"],
      ["PATCH", "/api/todos/x"],
      ["DELETE", "/api/todos/x"],
      ["POST", "/api/goals"],
      ["PATCH", "/api/goals/x"],
      ["DELETE", "/api/goals/x"],
      ["POST", "/api/auth/logout"],
    ] as const;
    for (const [method, url] of routes) {
      const res = await app.inject({ method, url, payload: method === "GET" ? undefined : {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("returns NOT_FOUND for unknown API routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});

describe("sliding sessions", () => {
  it("bumps expiry and refreshes the cookie when last bumped over an hour ago", async () => {
    const cookie = await login(app);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const staleExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.session.updateMany({ data: { lastSeenAt: twoHoursAgo, expiresAt: staleExpiry } });

    const res = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } });
    expect(res.json()).toEqual({ authenticated: true });
    expect(String(res.headers["set-cookie"])).toContain("Max-Age=2592000");

    const session = await prisma.session.findFirstOrThrow();
    expect(session.lastSeenAt.getTime()).toBeGreaterThan(twoHoursAgo.getTime());
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it("does not write when bumped within the last hour", async () => {
    const cookie = await login(app);
    const before = await prisma.session.findFirstOrThrow();

    const res = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } });
    expect(res.headers["set-cookie"]).toBeUndefined();
    const after = await prisma.session.findFirstOrThrow();
    expect(after.lastSeenAt).toEqual(before.lastSeenAt);
    expect(after.expiresAt).toEqual(before.expiresAt);
  });
});

describe("logout", () => {
  it("deletes the session and clears the cookie", async () => {
    const cookie = await login(app);
    const res = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers["set-cookie"])).toMatch(/^sid=;/);
    expect(await prisma.session.count()).toBe(0);

    const after = await app.inject({ method: "GET", url: "/api/board?today=2026-10-06", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });
});

describe("boot-time session cleanup", () => {
  it("revokes every session when APP_PASSWORD changes", async () => {
    const cookie = await login(app);
    await app.close();

    app = await createApp({ env: testEnv({ APP_PASSWORD: "a-brand-new-password" }) });
    expect(await prisma.session.count()).toBe(0);
    const res = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } });
    expect(res.json()).toEqual({ authenticated: false });
  });

  it("keeps sessions when the password is unchanged", async () => {
    const cookie = await login(app);
    await app.close();

    app = await createApp();
    const res = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie } });
    expect(res.json()).toEqual({ authenticated: true });
  });

  it("purges expired sessions", async () => {
    await login(app);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await app.close();

    app = await createApp();
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("request limits", () => {
  it("rejects bodies over 16 KB", async () => {
    const cookie = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/todos",
      headers: { cookie },
      payload: { title: "x", notes: "y".repeat(17 * 1024), scope: "DAY", date: "2026-10-06" },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed JSON with the error envelope", async () => {
    const cookie = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/todos",
      headers: { cookie, "content-type": "application/json" },
      payload: "{not json",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});
