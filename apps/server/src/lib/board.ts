import type { PrismaClient } from "@prisma/client";
import { boardDates, toDbDate, type IsoDate } from "../domain/dates";
import { composeBoard } from "../domain/placement";
import { toGoalDto, toTodoDto } from "./serialize";

/** The whole board as seen on `today`: the same lists the client renders. */
export async function loadBoard(prisma: PrismaClient, todayDate: IsoDate) {
  const dates = boardDates(todayDate);
  const today = toDbDate(dates.today);
  const tomorrow = toDbDate(dates.tomorrow);
  const weekStart = toDbDate(dates.weekStart);
  const month = toDbDate(dates.month);

  // Candidate rows per list: everything still active up to the window, plus anything that
  // could be completed inside it. composeBoard applies the exact rules.
  const [dayTodos, weekTodos, goals] = await Promise.all([
    prisma.todo.findMany({
      where: {
        scope: "DAY",
        date: { lte: tomorrow },
        OR: [{ completedAt: null }, { date: { gte: today } }, { completedOn: { gte: today } }],
      },
    }),
    prisma.todo.findMany({
      where: {
        scope: "WEEK",
        date: { lte: weekStart },
        OR: [{ completedAt: null }, { date: { gte: weekStart } }, { completedOn: { gte: weekStart } }],
      },
    }),
    prisma.goal.findMany({
      where: {
        month: { lte: month },
        OR: [{ completedAt: null }, { month: { gte: month } }, { completedOn: { gte: month } }],
      },
    }),
  ]);

  const board = composeBoard(dates, [...dayTodos, ...weekTodos].map(toTodoDto), goals.map(toGoalDto));
  return { dates, ...board };
}
