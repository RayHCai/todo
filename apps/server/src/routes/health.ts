import { HealthResponse } from "@todo/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/health", { schema: { response: { 200: HealthResponse } } }, async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    return { ok: true as const };
  });
};
