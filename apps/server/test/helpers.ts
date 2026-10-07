import { PrismaClient } from "@prisma/client";
import { expect } from "vitest";
import { buildApp, type App, type AppOptions } from "../src/app";
import { parseEnv, type Env } from "../src/env";

export const TEST_PASSWORD = "test-password-123";

export function testEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  return parseEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_PASSWORD: TEST_PASSWORD,
    COOKIE_SECRET: "test-cookie-secret-that-is-at-least-32-chars",
    NODE_ENV: "test",
    ...overrides,
  });
}

export const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE "Todo", "Goal", "Session"');
}

export function createApp(overrides: Partial<AppOptions> = {}): Promise<App> {
  return buildApp({
    env: testEnv(),
    prisma,
    logger: false,
    loginFailureDelayMs: 0,
    ...overrides,
  });
}

/** The `name=value` part of a Set-Cookie header, ready to send back as a Cookie header. */
export function cookiePair(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!header) throw new Error("no Set-Cookie header");
  return header.split(";")[0]!;
}

/** Logs in and returns a Cookie header value for authenticated requests. */
export async function login(app: App, password = TEST_PASSWORD): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password } });
  expect(res.statusCode).toBe(204);
  return cookiePair(res.headers["set-cookie"]);
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** A tiny authenticated client around `app.inject`. */
export function client(app: App, cookie: string) {
  const call = async (method: Method, url: string, payload?: unknown) => {
    const res = await app.inject({
      method,
      url,
      headers: { cookie },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return { status: res.statusCode, body: res.body ? res.json() : undefined, res };
  };
  return {
    get: (url: string) => call("GET", url),
    post: (url: string, payload: unknown) => call("POST", url, payload),
    patch: (url: string, payload: unknown) => call("PATCH", url, payload),
    delete: (url: string) => call("DELETE", url),
  };
}

const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

/** Inserts a todo directly, bypassing the API, for precise board/history fixtures. */
export function insertTodo(data: {
  title: string;
  scope?: "DAY" | "WEEK";
  date: string;
  position?: number;
  completedOn?: string;
  completedAt?: Date;
}) {
  return prisma.todo.create({
    data: {
      title: data.title,
      scope: data.scope ?? "DAY",
      date: day(data.date),
      position: data.position ?? 1,
      completedOn: data.completedOn ? day(data.completedOn) : null,
      completedAt: data.completedOn ? (data.completedAt ?? new Date()) : null,
    },
  });
}

export function insertGoal(data: {
  title: string;
  month: string;
  position?: number;
  completedOn?: string;
  completedAt?: Date;
  color?: string;
}) {
  return prisma.goal.create({
    data: {
      title: data.title,
      color: data.color ?? "amber",
      month: day(data.month),
      position: data.position ?? 1,
      completedOn: data.completedOn ? day(data.completedOn) : null,
      completedAt: data.completedOn ? (data.completedAt ?? new Date()) : null,
    },
  });
}
