import type { Prisma } from "@prisma/client";
import { CreateGoalBody, GoalSchema, IdParams, UpdateGoalBody } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { fromDbDate, startOfMonth, toDbDate } from "../domain/dates";
import { notFound } from "../lib/errors";
import { nextGoalPosition, renumberGoalsIfCrowded } from "../lib/positions";
import { emptyToNull, toGoalDto } from "../lib/serialize";

export const goalRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma } = app;

  app.post("/goals", { schema: { body: CreateGoalBody, response: { 201: GoalSchema } } }, async (request, reply) => {
    const body = request.body;
    const month = toDbDate(startOfMonth(body.month));
    const completedOn = body.completed === true ? body.completedOn : undefined;
    const goal = await prisma.goal.create({
      data: {
        title: body.title,
        description: emptyToNull(body.description),
        color: body.color,
        month,
        position: body.position ?? (await nextGoalPosition(prisma, month)),
        completedAt: completedOn ? new Date() : null,
        completedOn: completedOn ? toDbDate(completedOn) : null,
      },
    });
    return reply.status(201).send(toGoalDto(goal));
  });

  app.patch(
    "/goals/:id",
    { schema: { params: IdParams, body: UpdateGoalBody, response: { 200: GoalSchema } } },
    async (request) => {
      const { id } = request.params;
      const body = request.body;
      const existing = await prisma.goal.findUnique({ where: { id } });
      if (!existing) throw notFound("Goal");

      const data: Prisma.GoalUpdateInput = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = emptyToNull(body.description);
      if (body.color !== undefined) data.color = body.color;

      if (body.month !== undefined) {
        const month = startOfMonth(body.month);
        data.month = toDbDate(month);
        if (month !== fromDbDate(existing.month) && body.position === undefined) {
          data.position = await nextGoalPosition(prisma, toDbDate(month));
        }
      }
      if (body.position !== undefined) data.position = body.position;

      if (body.completed === true && body.completedOn !== undefined) {
        data.completedAt = existing.completedAt ?? new Date();
        data.completedOn = toDbDate(body.completedOn);
      } else if (body.completed === false) {
        data.completedAt = null;
        data.completedOn = null;
      }

      let goal = await prisma.goal.update({ where: { id }, data });
      if (body.position !== undefined && (await renumberGoalsIfCrowded(prisma, goal))) {
        goal = await prisma.goal.findUniqueOrThrow({ where: { id } });
      }
      return toGoalDto(goal);
    },
  );

  app.delete("/goals/:id", { schema: { params: IdParams } }, async (request, reply) => {
    const { count } = await prisma.goal.deleteMany({ where: { id: request.params.id } });
    if (count === 0) throw notFound("Goal");
    return reply.status(204).send();
  });
};
