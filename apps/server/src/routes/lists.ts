import type { Prisma, PrismaClient, Todo as TodoRow } from "@prisma/client";
import {
  CreateListBody,
  CreateListTaskBody,
  IdParams,
  ListSchema,
  ListsResponse,
  ListTaskSchema,
  UpdateListBody,
  UpdateListTaskBody,
} from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { toDbDate } from "../domain/dates";
import { notFound } from "../lib/errors";
import { nextListPosition, nextListTaskPosition, nextTodoPosition } from "../lib/positions";
import { toListDto, toListTaskDto } from "../lib/serialize";

/**
 * List tasks are todos with a `listId`. Dating one makes it a DAY todo on that day, so it shows
 * on the board and in the calendar; it lands at the bottom of that day's column.
 */
const asListTask = (row: TodoRow) => toListTaskDto(row as TodoRow & { listId: string });

const position = (prisma: PrismaClient, listId: string, date: string | null | undefined) =>
  date ? nextTodoPosition(prisma, "DAY", toDbDate(date)) : nextListTaskPosition(prisma, listId);

export const listRoutes: FastifyPluginAsyncZod = async (app) => {
  const { prisma } = app;

  app.get("/lists", { schema: { response: { 200: ListsResponse } } }, async () => {
    const [lists, tasks] = await Promise.all([
      prisma.list.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
      prisma.todo.findMany({
        where: { listId: { not: null } },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    return { lists: lists.map(toListDto), tasks: tasks.map(asListTask) };
  });

  app.post("/lists", { schema: { body: CreateListBody, response: { 201: ListSchema } } }, async (request, reply) => {
    const body = request.body;
    const list = await prisma.list.create({
      data: { name: body.name, color: body.color, position: body.position ?? (await nextListPosition(prisma)) },
    });
    return reply.status(201).send(toListDto(list));
  });

  app.patch(
    "/lists/:id",
    { schema: { params: IdParams, body: UpdateListBody, response: { 200: ListSchema } } },
    async (request) => {
      const { id } = request.params;
      const existing = await prisma.list.findUnique({ where: { id } });
      if (!existing) throw notFound("List");
      const list = await prisma.list.update({ where: { id }, data: request.body });
      return toListDto(list);
    },
  );

  // Deleting a list deletes its tasks with it (ON DELETE CASCADE), dated ones included.
  app.delete("/lists/:id", { schema: { params: IdParams } }, async (request, reply) => {
    const { count } = await prisma.list.deleteMany({ where: { id: request.params.id } });
    if (count === 0) throw notFound("List");
    return reply.status(204).send();
  });

  app.post(
    "/list-tasks",
    { schema: { body: CreateListTaskBody, response: { 201: ListTaskSchema } } },
    async (request, reply) => {
      const body = request.body;
      const list = await prisma.list.findUnique({ where: { id: body.listId }, select: { id: true } });
      if (!list) throw notFound("List");
      const completedOn = body.completed === true ? body.completedOn : undefined;
      const task = await prisma.todo.create({
        data: {
          listId: body.listId,
          title: body.title,
          scope: "DAY",
          date: body.date ? toDbDate(body.date) : null,
          position: body.position ?? (await position(prisma, body.listId, body.date)),
          completedAt: completedOn ? new Date() : null,
          completedOn: completedOn ? toDbDate(completedOn) : null,
        },
      });
      return reply.status(201).send(asListTask(task));
    },
  );

  app.patch(
    "/list-tasks/:id",
    { schema: { params: IdParams, body: UpdateListTaskBody, response: { 200: ListTaskSchema } } },
    async (request) => {
      const { id } = request.params;
      const body = request.body;
      const existing = await prisma.todo.findFirst({ where: { id, listId: { not: null } } });
      if (!existing?.listId) throw notFound("Task");

      const data: Prisma.TodoUpdateInput = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.date !== undefined) {
        data.date = body.date === null ? null : toDbDate(body.date);
        if (body.date !== null) {
          // A picked day is a day, even if the board had it as a week task.
          data.scope = "DAY";
          data.position = await position(prisma, existing.listId, body.date);
        }
      }

      if (body.completed === true && body.completedOn !== undefined) {
        data.completedAt = existing.completedAt ?? new Date();
        data.completedOn = toDbDate(body.completedOn);
      } else if (body.completed === false) {
        data.completedAt = null;
        data.completedOn = null;
      }

      const task = await prisma.todo.update({ where: { id }, data });
      return asListTask(task);
    },
  );

  app.delete("/list-tasks/:id", { schema: { params: IdParams } }, async (request, reply) => {
    const { count } = await prisma.todo.deleteMany({ where: { id: request.params.id, listId: { not: null } } });
    if (count === 0) throw notFound("Task");
    return reply.status(204).send();
  });
};
