import type { ErrorBody, ErrorCode } from "@todo/shared";
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);

export const unauthenticated = (message = "Not authenticated") => new AppError(401, "UNAUTHENTICATED", message);

export const rateLimited = (message = "Too many attempts, try again later") =>
  new AppError(429, "RATE_LIMITED", message);

function body(code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

/** Maps every thrown error to the `{ error: { code, message, details? } }` envelope. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(body(error.code, error.message, error.details));
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const issues = error.validation.map((issue) => ({
        path: issue.instancePath.replace(/^\//, "").replaceAll("/", "."),
        message: issue.message ?? "is invalid",
      }));
      const message = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
      return reply.status(400).send(body("VALIDATION_ERROR", message, { in: error.validationContext, issues }));
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, issues: error.cause.issues }, "response failed schema");
      return reply.status(500).send(body("INTERNAL", "Internal server error"));
    }

    // Fastify's own client errors: malformed JSON, body too large, wrong content type, …
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.status(status).send(body("VALIDATION_ERROR", error.message));
    }

    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send(body("INTERNAL", "Internal server error"));
  });
}
