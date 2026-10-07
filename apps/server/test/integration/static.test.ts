import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { App } from "../../src/app";
import { createApp } from "../helpers";

let app: App;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "todo-client-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>todo</title>");
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log('hi')");
  app = await createApp({ clientDistDir: dir });
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("serving the built client", () => {
  it("serves index.html at / without caching", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>todo</title>");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("serves fingerprinted assets as immutable", async () => {
    const res = await app.inject({ method: "GET", url: "/assets/app-abc123.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("falls back to index.html for client-side routes", async () => {
    const res = await app.inject({ method: "GET", url: "/calendar/2026-10" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("<title>todo</title>");
  });

  it("still returns JSON 404s for unknown API routes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/unknown" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
