import { existsSync } from "node:fs";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  APP_PASSWORD: z.string().min(8, "must be at least 8 characters"),
  COOKIE_SECRET: z.string().min(32, "must be at least 32 characters (32+ random bytes, base64)"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Email reminders. Scheduled sends need RESEND_API_KEY and REMINDER_EMAIL_TO; the manual
  // POST /api/reminders route additionally needs REMINDER_SECRET.
  RESEND_API_KEY: z.string().min(1).optional(),
  REMINDER_EMAIL_TO: z.email().optional(),
  // Resend's shared test sender; it can only deliver to the Resend account's own address.
  REMINDER_EMAIL_FROM: z.string().min(1).default("Todo <onboarding@resend.dev>"),
  REMINDER_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
  REMINDER_TIMEZONE: z
    .string()
    .refine(isTimeZone, "must be an IANA time zone like America/Chicago")
    .default("America/Chicago"),
});

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export type Env = z.infer<typeof EnvSchema>;

/** Parses the environment, throwing a readable error that names every bad variable. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return result.data;
}

/** Loads `.env` from the working directory if present. Real environment variables win. */
export function loadDotEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
