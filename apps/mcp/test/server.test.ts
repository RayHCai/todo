import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "../src/api";
import { createServer, localToday } from "../src/server";

interface Recorded {
  method: string;
  path: string;
  cookie: string | undefined;
  body: unknown;
}

const todo = {
  id: "t1",
  title: "Buy milk",
  notes: null,
  scope: "DAY",
  date: "2026-10-06",
  position: 1,
  completedAt: null,
  completedOn: null,
  carriedOver: false,
  createdAt: "2026-10-06T10:00:00.000Z",
  updatedAt: "2026-10-06T10:00:00.000Z",
};

/**
 * A fake backend: records every request and answers from `routes`, keyed by "METHOD /path".
 * Login always succeeds and hands out a numbered session cookie.
 */
function fakeBackend() {
  const calls: Recorded[] = [];
  const routes = new Map<string, (call: Recorded) => Response>();
  let sessions = 0;

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const call: Recorded = {
      method: init?.method ?? "GET",
      path: url.pathname + url.search,
      cookie: (init?.headers as Record<string, string> | undefined)?.cookie,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    if (call.path === "/api/auth/login") {
      sessions += 1;
      return new Response(null, {
        status: 204,
        headers: { "set-cookie": `sid=session-${sessions}; Path=/; HttpOnly` },
      });
    }
    const handler = routes.get(`${call.method} ${url.pathname}`);
    return handler
      ? handler(call)
      : Response.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, { status: 404 });
  };

  return { calls, routes, fetch: fetchImpl };
}

async function connect(backend: ReturnType<typeof fakeBackend>) {
  const api = createApiClient({ baseUrl: "http://backend.test/", password: "pw", fetch: backend.fetch });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(api).connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

const text = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  (result.content as { type: string; text: string }[])[0]!.text;

describe("todo MCP server", () => {
  let backend: ReturnType<typeof fakeBackend>;
  let client: Client;

  beforeEach(async () => {
    backend = fakeBackend();
    client = await connect(backend);
  });

  it("exposes every backend CRUD route as a described tool", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_goal",
      "create_todo",
      "delete_goal",
      "delete_todo",
      "get_board",
      "get_history",
      "update_goal",
      "update_todo",
    ]);
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy();
      for (const [param, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect((schema as { description?: string }).description, `${tool.name}.${param}`).toBeTruthy();
      }
    }
  });

  it("logs in once and sends the session cookie with each request", async () => {
    backend.routes.set("POST /api/todos", () => Response.json(todo, { status: 201 }));

    await client.callTool({ name: "create_todo", arguments: { title: "Buy milk", scope: "DAY", date: "2026-10-06" } });
    await client.callTool({ name: "create_todo", arguments: { title: "Buy milk", scope: "DAY", date: "2026-10-06" } });

    expect(backend.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /api/auth/login",
      "POST /api/todos",
      "POST /api/todos",
    ]);
    expect(backend.calls[0]!.body).toEqual({ password: "pw" });
    expect(backend.calls[1]!.cookie).toBe("sid=session-1");
    expect(backend.calls[1]!.body).toEqual({ title: "Buy milk", scope: "DAY", date: "2026-10-06" });
  });

  it("logs in again when the session has expired", async () => {
    let first = true;
    backend.routes.set("DELETE /api/todos/t1", () => {
      if (first) {
        first = false;
        return Response.json({ error: { code: "UNAUTHENTICATED", message: "Not authenticated" } }, { status: 401 });
      }
      return new Response(null, { status: 204 });
    });

    const result = await client.callTool({ name: "delete_todo", arguments: { id: "t1" } });

    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe("Deleted todo t1.");
    expect(backend.calls.filter((c) => c.path === "/api/auth/login")).toHaveLength(2);
    expect(backend.calls.at(-1)!.cookie).toBe("sid=session-2");
  });

  it("returns structured data for reads and defaults today to the local date", async () => {
    const board = {
      dates: {
        today: "2026-10-06",
        tomorrow: "2026-10-07",
        weekStart: "2026-10-04",
        weekEnd: "2026-10-10",
        month: "2026-10-01",
      },
      goals: { active: [], completed: [] },
      today: { active: [todo], completed: [] },
      tomorrow: { active: [], completed: [] },
      week: { active: [], completed: [] },
    };
    backend.routes.set("GET /api/board", () => Response.json(board));

    const result = await client.callTool({ name: "get_board", arguments: {} });

    expect(backend.calls.at(-1)!.path).toBe(`/api/board?today=${localToday()}`);
    expect(result.structuredContent).toEqual(board);
  });

  it("puts the id in the path and defaults completedOn when checking an item off", async () => {
    backend.routes.set("PATCH /api/todos/t1", (call) => Response.json({ ...todo, ...(call.body as object) }));

    await client.callTool({ name: "update_todo", arguments: { id: "t1", completed: true } });

    expect(backend.calls.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/api/todos/t1",
      body: { completed: true, completedOn: localToday() },
    });
  });

  it("reports backend errors as tool errors with a recovery hint", async () => {
    const result = await client.callTool({ name: "update_goal", arguments: { id: "missing", title: "x" } });

    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^NOT_FOUND: .*get_board or get_history/);
  });

  it("rejects malformed input before calling the backend", async () => {
    const result = await client.callTool({
      name: "create_goal",
      arguments: { title: "Run a 10k", color: "chartreuse", month: "2026-10-01" },
    });

    expect(result.isError).toBe(true);
    expect(backend.calls).toHaveLength(0);
  });
});
