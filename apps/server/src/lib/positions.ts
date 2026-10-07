/**
 * Fractional ordering. Clients reorder by sending a position between two neighbours; when gaps
 * shrink below MIN_POSITION_GAP the server renumbers to whole numbers, keeping the order.
 */
import type { PrismaClient, TodoScope } from "@prisma/client";

export const MIN_POSITION_GAP = 1e-6;

/**
 * Bottom of the list a new or moved todo lands in: items on its own date plus anything still
 * active from earlier dates (those are carried over into the same column).
 */
export async function nextTodoPosition(prisma: PrismaClient, scope: TodoScope, date: Date): Promise<number> {
  const { _max } = await prisma.todo.aggregate({
    _max: { position: true },
    where: { scope, OR: [{ date }, { date: { lt: date }, completedAt: null }] },
  });
  return (_max.position ?? 0) + 1;
}

export async function nextGoalPosition(prisma: PrismaClient, month: Date): Promise<number> {
  const { _max } = await prisma.goal.aggregate({
    _max: { position: true },
    where: { OR: [{ month }, { month: { lt: month }, completedAt: null }] },
  });
  return (_max.position ?? 0) + 1;
}

const crowdedRange = (position: number) => ({
  gt: position - MIN_POSITION_GAP,
  lt: position + MIN_POSITION_GAP,
});

/**
 * Renumbers every active todo of the scope to 1..n if `todo` now sits too close to another.
 * The whole scope is renumbered, not one date: with carry-over a column spans several dates,
 * and renumbering the superset in order preserves every column's order.
 */
export async function renumberTodosIfCrowded(
  prisma: PrismaClient,
  todo: { id: string; scope: TodoScope; position: number },
): Promise<boolean> {
  const crowded = await prisma.todo.findFirst({
    where: {
      scope: todo.scope,
      completedAt: null,
      id: { not: todo.id },
      position: crowdedRange(todo.position),
    },
    select: { id: true },
  });
  if (!crowded) return false;

  const rows = await prisma.todo.findMany({
    where: { scope: todo.scope, completedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  await prisma.$transaction(
    rows.map((row, index) => prisma.todo.update({ where: { id: row.id }, data: { position: index + 1 } })),
  );
  return true;
}

/** Goal counterpart of {@link renumberTodosIfCrowded}. */
export async function renumberGoalsIfCrowded(
  prisma: PrismaClient,
  goal: { id: string; position: number },
): Promise<boolean> {
  const crowded = await prisma.goal.findFirst({
    where: { completedAt: null, id: { not: goal.id }, position: crowdedRange(goal.position) },
    select: { id: true },
  });
  if (!crowded) return false;

  const rows = await prisma.goal.findMany({
    where: { completedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  await prisma.$transaction(
    rows.map((row, index) => prisma.goal.update({ where: { id: row.id }, data: { position: index + 1 } })),
  );
  return true;
}
