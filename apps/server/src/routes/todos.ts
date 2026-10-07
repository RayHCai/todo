import type { Prisma } from "@prisma/client";
import { CreateTodoBody, IdParams, TodoSchema, UpdateTodoBody } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { fromDbDate, normalizeTodoDate, toDbDate } from "../domain/dates";
import { notFound } from "../lib/errors";
import { nextTodoPosition, renumberTodosIfCrowded } from "../lib/positions";
import { emptyToNull, toTodoDto } from "../lib/serialize";

export const todoRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma } = app;

  app.post("/todos", { schema: { body: CreateTodoBody, response: { 201: TodoSchema } } }, async (request, reply) => {
    const body = request.body;
    const date = toDbDate(normalizeTodoDate(body.scope, body.date));
    const completedOn = body.completed === true ? body.completedOn : undefined;
    const todo = await prisma.todo.create({
      data: {
        title: body.title,
        notes: emptyToNull(body.notes),
        scope: body.scope,
        date,
        position: body.position ?? (await nextTodoPosition(prisma, body.scope, date)),
        completedAt: completedOn ? new Date() : null,
        completedOn: completedOn ? toDbDate(completedOn) : null,
      },
    });
    return reply.status(201).send(toTodoDto(todo));
  });

  app.patch(
    "/todos/:id",
    { schema: { params: IdParams, body: UpdateTodoBody, response: { 200: TodoSchema } } },
    async (request) => {
      const { id } = request.params;
      const body = request.body;
      const existing = await prisma.todo.findUnique({ where: { id } });
      if (!existing) throw notFound("Todo");

      const data: Prisma.TodoUpdateInput = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.notes !== undefined) data.notes = emptyToNull(body.notes);

      // Changing scope or date moves the todo to another column (e.g. "move to tomorrow").
      if (body.scope !== undefined || body.date !== undefined) {
        const scope = body.scope ?? existing.scope;
        const date = normalizeTodoDate(scope, body.date ?? fromDbDate(existing.date));
        data.scope = scope;
        data.date = toDbDate(date);
        const moved = scope !== existing.scope || date !== fromDbDate(existing.date);
        if (moved && body.position === undefined) {
          data.position = await nextTodoPosition(prisma, scope, toDbDate(date));
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

      let todo = await prisma.todo.update({ where: { id }, data });
      if (body.position !== undefined && (await renumberTodosIfCrowded(prisma, todo))) {
        todo = await prisma.todo.findUniqueOrThrow({ where: { id } });
      }
      return toTodoDto(todo);
    },
  );

  app.delete("/todos/:id", { schema: { params: IdParams } }, async (request, reply) => {
    const { count } = await prisma.todo.deleteMany({ where: { id: request.params.id } });
    if (count === 0) throw notFound("Todo");
    return reply.status(204).send();
  });
};
