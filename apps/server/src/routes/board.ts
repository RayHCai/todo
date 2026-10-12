import { BoardQuery, BoardResponse } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { loadBoard } from "../lib/board";

export const boardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/board", { schema: { querystring: BoardQuery, response: { 200: BoardResponse } } }, async (request) =>
    loadBoard(app.prisma, request.query.today),
  );
};
