import { BoardQuery, BoardResponse } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { boardDates, toDbDate } from "../domain/dates";
import { composeBoard } from "../domain/placement";
import { toGoalDto, toTodoDto } from "../lib/serialize";

export const boardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/board", { schema: { querystring: BoardQuery, response: { 200: BoardResponse } } }, async (request) => {
    const dates = boardDates(request.query.today);
    const today = toDbDate(dates.today);
    const tomorrow = toDbDate(dates.tomorrow);
    const weekStart = toDbDate(dates.weekStart);
    const month = toDbDate(dates.month);

    // Candidate rows per list: everything still active up to the window, plus anything that
    // could be completed inside it. composeBoard applies the exact rules.
    const [dayTodos, weekTodos, goals] = await Promise.all([
      app.prisma.todo.findMany({
        where: {
          scope: "DAY",
          date: { lte: tomorrow },
          OR: [{ completedAt: null }, { date: { gte: today } }, { completedOn: { gte: today } }],
        },
      }),
      app.prisma.todo.findMany({
        where: {
          scope: "WEEK",
          date: { lte: weekStart },
          OR: [{ completedAt: null }, { date: { gte: weekStart } }, { completedOn: { gte: weekStart } }],
        },
      }),
      app.prisma.goal.findMany({
        where: {
          month: { lte: month },
          OR: [{ completedAt: null }, { month: { gte: month } }, { completedOn: { gte: month } }],
        },
      }),
    ]);

    const board = composeBoard(dates, [...dayTodos, ...weekTodos].map(toTodoDto), goals.map(toGoalDto));
    return { dates, ...board };
  });
};
