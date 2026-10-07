import type { BoardResponse, Goal, Todo } from "@todo/shared";

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
