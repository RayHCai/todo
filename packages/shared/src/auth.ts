import { z } from "zod";

export const LoginBody = z.object({
  password: z.string().min(1, "is required").max(1024),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const SessionResponse = z.object({ authenticated: z.boolean() });
export type SessionResponse = z.infer<typeof SessionResponse>;

export const HealthResponse = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof HealthResponse>;
