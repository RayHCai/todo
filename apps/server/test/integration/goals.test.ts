import type { Goal } from "@todo/shared";
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
  await prisma.goal.deleteMany();
});

afterAll(async () => {
  await app.close();
});

async function create(body: Record<string, unknown>): Promise<Goal> {
  const res = await api.post("/api/goals", { color: "teal", month: "2026-10-01", ...body });
  expect(res.status).toBe(201);
  return res.body;
}

describe("goals", () => {
  it("creates a goal with its month normalized to the 1st", async () => {
    const goal = await create({ title: "Run 50 km", description: "", month: "2026-10-17" });
    expect(goal).toMatchObject({
      title: "Run 50 km",
      description: null,
      color: "teal",
      month: "2026-10-01",
      position: 1,
      completedAt: null,
      carriedOver: false,
    });
    expect((await create({ title: "second" })).position).toBe(2);
  });

  it("rejects colors outside the palette", async () => {
    const res = await api.post("/api/goals", { title: "x", color: "chartreuse", month: "2026-10-01" });
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].path).toBe("color");
  });

  it("complete → uncomplete round-trip shows up on the board", async () => {
    const goal = await create({ title: "Read 2 books" });
    await api.patch(`/api/goals/${goal.id}`, { completed: true, completedOn: "2026-10-20" });

    let board = (await api.get("/api/board?today=2026-10-20")).body;
    expect(board.goals.completed.map((g: Goal) => g.id)).toEqual([goal.id]);
    expect(board.goals.active).toEqual([]);

    const res = await api.patch(`/api/goals/${goal.id}`, { completed: false });
    expect(res.body).toMatchObject({ completedAt: null, completedOn: null });
    board = (await api.get("/api/board?today=2026-10-20")).body;
    expect(board.goals.active.map((g: Goal) => g.id)).toEqual([goal.id]);
  });

  it("an unfinished goal carries over into next month", async () => {
    const goal = await create({ title: "Learn Rust" });
    const board = (await api.get("/api/board?today=2026-11-03")).body;
    expect(board.goals.active).toEqual([expect.objectContaining({ id: goal.id, carriedOver: true })]);
  });

  it("edits fields and moves months", async () => {
    const goal = await create({ title: "x" });
    const res = await api.patch(`/api/goals/${goal.id}`, {
      title: "y",
      description: "why",
      color: "rose",
      month: "2026-11-15",
    });
    expect(res.body).toMatchObject({ title: "y", description: "why", color: "rose", month: "2026-11-01" });
  });

  it("deletes and 404s", async () => {
    const goal = await create({ title: "x" });
    expect((await api.delete(`/api/goals/${goal.id}`)).status).toBe(204);
    expect((await api.delete(`/api/goals/${goal.id}`)).status).toBe(404);
    expect((await api.patch(`/api/goals/${goal.id}`, { title: "z" })).status).toBe(404);
  });
});
