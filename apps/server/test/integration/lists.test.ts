import type { List, ListTask } from "@todo/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { App } from "../../src/app";
import { client, createApp, login, prisma, resetDb } from "../helpers";

let app: App;
let api: ReturnType<typeof client>;

beforeAll(async () => {
  await resetDb();
  app = await createApp();
  api = client(app, await login(app));
});

beforeEach(async () => {
  await prisma.list.deleteMany();
});

afterAll(async () => {
  await app.close();
});

async function createList(body: Record<string, unknown> = {}): Promise<List> {
  const res = await api.post("/api/lists", { name: "Home", color: "teal", ...body });
  expect(res.status).toBe(201);
  return res.body;
}

async function createTask(listId: string, body: Record<string, unknown> = {}): Promise<ListTask> {
  const res = await api.post("/api/list-tasks", { listId, title: "Fix the light", ...body });
  expect(res.status).toBe(201);
  return res.body;
}

describe("lists", () => {
  it("creates lists at the end, and returns them with their tasks", async () => {
    const home = await createList({ name: "  Home " });
    const work = await createList({ name: "Work", color: "indigo" });
    expect(home).toMatchObject({ name: "Home", color: "teal", position: 1 });
    expect(work.position).toBe(2);

    const task = await createTask(home.id);
    expect(task).toMatchObject({ listId: home.id, title: "Fix the light", date: null, position: 1, completedAt: null });

    const res = await api.get("/api/lists");
    expect(res.status).toBe(200);
    expect(res.body.lists.map((l: List) => l.id)).toEqual([home.id, work.id]);
    expect(res.body.tasks.map((t: ListTask) => t.id)).toEqual([task.id]);
  });

  it("renames and recolors a list", async () => {
    const list = await createList();
    const res = await api.patch(`/api/lists/${list.id}`, { name: "House", color: "rose" });
    expect(res.body).toMatchObject({ name: "House", color: "rose" });
  });

  it("deleting a list deletes its tasks", async () => {
    const list = await createList();
    const task = await createTask(list.id);
    expect((await api.delete(`/api/lists/${list.id}`)).status).toBe(204);
    expect((await api.patch(`/api/list-tasks/${task.id}`, { title: "x" })).status).toBe(404);
    expect((await api.delete(`/api/lists/${list.id}`)).status).toBe(404);
  });
});

describe("list tasks", () => {
  it("sets, changes and clears a date", async () => {
    const list = await createList();
    const task = await createTask(list.id, { date: "2026-10-30" });
    expect(task.date).toBe("2026-10-30");
    expect((await api.patch(`/api/list-tasks/${task.id}`, { date: "2026-11-02" })).body.date).toBe("2026-11-02");
    expect((await api.patch(`/api/list-tasks/${task.id}`, { date: null })).body.date).toBeNull();
  });

  it("completes and reopens", async () => {
    const list = await createList();
    const task = await createTask(list.id);
    const done = await api.patch(`/api/list-tasks/${task.id}`, { completed: true, completedOn: "2026-10-28" });
    expect(done.body).toMatchObject({ completedOn: "2026-10-28" });
    expect(done.body.completedAt).not.toBeNull();
    const open = await api.patch(`/api/list-tasks/${task.id}`, { completed: false });
    expect(open.body).toMatchObject({ completedAt: null, completedOn: null });
  });

  it("re-creates a deleted task where it was", async () => {
    const list = await createList();
    await createTask(list.id);
    const restored = await createTask(list.id, {
      title: "Restored",
      position: 0.5,
      completed: true,
      completedOn: "2026-10-27",
    });
    expect(restored).toMatchObject({ position: 0.5, completedOn: "2026-10-27" });
  });

  it("404s for a missing list or task", async () => {
    expect((await api.post("/api/list-tasks", { listId: "nope", title: "x" })).status).toBe(404);
    expect((await api.delete("/api/list-tasks/nope")).status).toBe(404);
  });

  it("requires a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/lists" });
    expect(res.statusCode).toBe(401);
  });
});
