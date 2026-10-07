import type { BoardResponse, Todo } from "@todo/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../../src/app";
import { client, createApp, login, prisma, resetDb } from "../helpers";

const TODAY = "2026-10-06";
const TOMORROW = "2026-10-07";

let app: App;
let api: ReturnType<typeof client>;

beforeAll(async () => {
  await resetDb();
  app = await createApp();
  api = client(app, await login(app));
});

beforeEach(async () => {
  await prisma.todo.deleteMany();
});

afterAll(async () => {
  await app.close();
});

async function create(body: Record<string, unknown>): Promise<Todo> {
  const res = await api.post("/api/todos", { scope: "DAY", date: TODAY, ...body });
  expect(res.status).toBe(201);
  return res.body;
}

async function getBoard(today = TODAY): Promise<BoardResponse> {
  return (await api.get(`/api/board?today=${today}`)).body;
}

describe("POST /api/todos", () => {
  it("creates a todo at the bottom of its list", async () => {
    const first = await create({ title: "  first  ", notes: "some notes" });
    expect(first).toMatchObject({
      title: "first",
      notes: "some notes",
      scope: "DAY",
      date: TODAY,
      position: 1,
      completedAt: null,
      completedOn: null,
      carriedOver: false,
    });
    expect(first.id).toEqual(expect.any(String));
    expect(Date.parse(first.createdAt)).not.toBeNaN();

    const second = await create({ title: "second" });
    expect(second.position).toBe(2);

    // Another list starts its own numbering.
    const tomorrow = await create({ title: "tomorrow", date: TOMORROW });
    expect(tomorrow.position).toBe(3); // tomorrow's column also counts still-active earlier items
  });

  it("places new items below carried-over ones", async () => {
    await create({ title: "yesterday", date: "2026-10-05" }); // position 1, still active
    await create({ title: "yesterday 2", date: "2026-10-05" }); // position 2
    const today = await create({ title: "today" });
    expect(today.position).toBe(3);
    const board = await getBoard();
    expect(board.today.active.map((t) => t.title)).toEqual(["yesterday", "yesterday 2", "today"]);
  });

  it("normalizes a WEEK todo to the Sunday that starts its week", async () => {
    const todo = await create({ title: "weekly", scope: "WEEK", date: "2026-10-08" });
    expect(todo.date).toBe("2026-10-04");
  });

  it("stores empty notes as null", async () => {
    expect((await create({ title: "x", notes: "   " })).notes).toBeNull();
  });

  it("accepts position and completion so undo can re-create a deleted item", async () => {
    const todo = await create({
      title: "restored",
      position: 4.5,
      completed: true,
      completedOn: TODAY,
    });
    expect(todo.position).toBe(4.5);
    expect(todo.completedOn).toBe(TODAY);
    expect(todo.completedAt).not.toBeNull();
  });

  it.each([
    [{ scope: "DAY", date: TODAY }, "title"],
    [{ title: "", scope: "DAY", date: TODAY }, "title"],
    [{ title: "x".repeat(201), scope: "DAY", date: TODAY }, "title"],
    [{ title: "x", scope: "MONTH", date: TODAY }, "scope"],
    [{ title: "x", scope: "DAY", date: "2026-13-01" }, "date"],
    [{ title: "x", scope: "DAY" }, "date"],
    [{ title: "x", scope: "DAY", date: TODAY, notes: "n".repeat(2001) }, "notes"],
    [{ title: "x", scope: "DAY", date: TODAY, completed: true }, "completedOn"],
  ])("rejects %j", async (body, field) => {
    const res = await api.post("/api/todos", body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toContain(field);
    expect(res.body.error.details.issues[0].path).toBe(field);
  });
});

describe("PATCH /api/todos/:id", () => {
  it("edits title and notes", async () => {
    const todo = await create({ title: "old", notes: "n" });
    const res = await api.patch(`/api/todos/${todo.id}`, { title: "new", notes: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: "new", notes: null, position: todo.position });
  });

  it("complete → uncomplete round-trip", async () => {
    const other = await create({ title: "other" });
    const todo = await create({ title: "task" });

    const done = await api.patch(`/api/todos/${todo.id}`, { completed: true, completedOn: TODAY });
    expect(done.status).toBe(200);
    expect(done.body.completedOn).toBe(TODAY);
    expect(Date.parse(done.body.completedAt)).not.toBeNaN();

    let board = await getBoard();
    expect(board.today.active.map((t) => t.id)).toEqual([other.id]);
    expect(board.today.completed.map((t) => t.id)).toEqual([todo.id]);

    const undone = await api.patch(`/api/todos/${todo.id}`, { completed: false });
    expect(undone.status).toBe(200);
    expect(undone.body).toMatchObject({ completedAt: null, completedOn: null, position: todo.position });

    board = await getBoard();
    expect(board.today.active.map((t) => t.id)).toEqual([other.id, todo.id]);
    expect(board.today.completed).toEqual([]);
  });

  it("keeps the original completedAt when completing again", async () => {
    const todo = await create({ title: "task" });
    const first = await api.patch(`/api/todos/${todo.id}`, { completed: true, completedOn: TODAY });
    const second = await api.patch(`/api/todos/${todo.id}`, { completed: true, completedOn: TODAY });
    expect(second.body.completedAt).toBe(first.body.completedAt);
  });

  it("requires completedOn with completed: true, and only then", async () => {
    const todo = await create({ title: "task" });
    for (const body of [{ completed: true }, { completedOn: TODAY }, { completed: false, completedOn: TODAY }]) {
      const res = await api.patch(`/api/todos/${todo.id}`, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.details.issues[0].path).toBe("completedOn");
    }
  });

  it("moves a todo to tomorrow, landing at the bottom", async () => {
    const existing = await create({ title: "already tomorrow", date: TOMORROW });
    const todo = await create({ title: "move me" });
    const res = await api.patch(`/api/todos/${todo.id}`, { date: TOMORROW });
    expect(res.body.date).toBe(TOMORROW);
    expect(res.body.position).toBeGreaterThan(existing.position);

    const board = await getBoard();
    expect(board.today.active).toEqual([]);
    expect(board.tomorrow.active.map((t) => t.title)).toEqual(["already tomorrow", "move me"]);
  });

  it("changing scope to WEEK normalizes the date to Sunday", async () => {
    const todo = await create({ title: "daily", date: "2026-10-08" });
    const res = await api.patch(`/api/todos/${todo.id}`, { scope: "WEEK" });
    expect(res.body).toMatchObject({ scope: "WEEK", date: "2026-10-04" });
  });

  it("reorders with a fractional position", async () => {
    const a = await create({ title: "a" });
    const b = await create({ title: "b" });
    const c = await create({ title: "c" });
    const res = await api.patch(`/api/todos/${c.id}`, { position: (a.position + b.position) / 2 });
    expect(res.body.position).toBe(1.5);
    expect((await getBoard()).today.active.map((t) => t.title)).toEqual(["a", "c", "b"]);
  });

  it("renumbers the list when gaps get smaller than 1e-6", async () => {
    const a = await create({ title: "a" }); // 1
    const b = await create({ title: "b", position: 1 + 4e-7 });
    const c = await create({ title: "c" });

    const res = await api.patch(`/api/todos/${c.id}`, { position: 1 + 2e-7 });
    expect(res.status).toBe(200);
    expect(res.body.position).toBe(2);

    const active = (await getBoard()).today.active;
    expect(active.map((t) => [t.title, t.position])).toEqual([
      ["a", 1],
      ["c", 2],
      ["b", 3],
    ]);
    expect(active.map((t) => t.id)).toEqual([a.id, c.id, b.id]);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await api.patch("/api/todos/does-not-exist", { title: "x" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("DELETE /api/todos/:id", () => {
  it("hard-deletes, then 404s", async () => {
    const todo = await create({ title: "bye" });
    expect((await api.delete(`/api/todos/${todo.id}`)).status).toBe(204);
    expect(await prisma.todo.count()).toBe(0);

    const again = await api.delete(`/api/todos/${todo.id}`);
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe("NOT_FOUND");
  });
});
