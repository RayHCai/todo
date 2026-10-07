import { z } from "zod";

export const ErrorCode = z.enum(["VALIDATION_ERROR", "UNAUTHENTICATED", "NOT_FOUND", "RATE_LIMITED", "INTERNAL"]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;
