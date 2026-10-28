import type { BoardResponse, Goal, ListsResponse, ListTask, Todo } from "@todo/shared";

const stamp = "2026-10-01T09:00:00.000Z";

export function todo(over: Partial<Todo> & { id: string; title: string }): Todo {
  return {
    notes: null,
    scope: "DAY",
    date: "2026-10-06",
    position: 1,
    completedAt: null,
    completedOn: null,
    carriedOver: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  };
}

export function goal(over: Partial<Goal> & { id: string; title: string }): Goal {
  return {
    description: null,
    color: "amber",
    month: "2026-10-01",
    position: 1,
    completedAt: null,
    completedOn: null,
    carriedOver: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  };
}

export function board(): BoardResponse {
  return {
    dates: {
      today: "2026-10-06",
      tomorrow: "2026-10-07",
      weekStart: "2026-10-04",
      weekEnd: "2026-10-10",
      month: "2026-10-01",
    },
    goals: {
      active: [goal({ id: "g1", title: "Run 60 km", color: "emerald" })],
      completed: [goal({ id: "g2", title: "Declutter desk", completedAt: stamp, completedOn: "2026-10-02" })],
    },
    today: {
      active: [
        todo({ id: "t1", title: "Write spec", position: 1 }),
        todo({ id: "t2", title: "Call bank", position: 2, date: "2026-10-05", carriedOver: true }),
      ],
      completed: [todo({ id: "t3", title: "Email Sam", completedAt: stamp, completedOn: "2026-10-06" })],
    },
    tomorrow: { active: [todo({ id: "t4", title: "Gym", date: "2026-10-07" })], completed: [] },
    week: { active: [todo({ id: "t5", title: "Pay rent", scope: "WEEK", date: "2026-10-04" })], completed: [] },
  };
}

export function listTask(over: Partial<ListTask> & { id: string; listId: string; title: string }): ListTask {
  return {
    date: null,
    position: 1,
    completedAt: null,
    completedOn: null,
    createdAt: stamp,
    updatedAt: stamp,
    ...over,
  };
}

export function lists(): ListsResponse {
  return {
    lists: [
      { id: "home", name: "Home", color: "teal", position: 1, createdAt: stamp, updatedAt: stamp },
      { id: "work", name: "Work", color: "indigo", position: 2, createdAt: stamp, updatedAt: stamp },
    ],
    tasks: [
      listTask({ id: "l1", listId: "home", title: "Fix the hallway light", date: "2026-10-06" }),
      listTask({ id: "l2", listId: "home", title: "Repot the fern", position: 2 }),
      listTask({
        id: "l3",
        listId: "home",
        title: "Hang the print",
        position: 3,
        completedAt: stamp,
        completedOn: "2026-10-01",
      }),
      listTask({ id: "l4", listId: "work", title: "Write the roadmap", date: "2026-10-09" }),
    ],
  };
}
