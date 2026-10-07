import { HistoryQuery, HistoryResponse } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { startOfMonth, startOfWeek, toDbDate } from "../domain/dates";
import { toGoalDto, toTodoDto } from "../lib/serialize";

export const historyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/history",
    { schema: { querystring: HistoryQuery, response: { 200: HistoryResponse } } },
    async (request) => {
      const { from, to } = request.query;
      const fromDb = toDbDate(from);
      const toDb = toDbDate(to);
      const completedInRange = { completedOn: { gte: fromDb, lte: toDb } };

      const [todos, goals] = await Promise.all([
        app.prisma.todo.findMany({
          where: {
            OR: [
              { scope: "DAY", date: { gte: fromDb, lte: toDb } },
              // A week overlaps [from, to] when its Sunday is on or after the Sunday of `from`.
              { scope: "WEEK", date: { gte: toDbDate(startOfWeek(from)), lte: toDb } },
              completedInRange,
            ],
          },
          orderBy: [{ date: "asc" }, { position: "asc" }],
        }),
        app.prisma.goal.findMany({
          where: {
            OR: [{ month: { gte: toDbDate(startOfMonth(from)), lte: toDb } }, completedInRange],
          },
          orderBy: [{ month: "asc" }, { position: "asc" }],
        }),
      ]);

      return { from, to, todos: todos.map(toTodoDto), goals: goals.map(toGoalDto) };
    },
  );
};
