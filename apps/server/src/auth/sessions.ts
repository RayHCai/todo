import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, Session } from "@prisma/client";

const MS_PER_DAY = 86_400_000;
/** Sliding expiry is written at most this often per session, to limit DB writes. */
export const SESSION_BUMP_INTERVAL_MS = 60 * 60 * 1000;

/** Sessions are stored by SHA-256 of the cookie token, so a DB leak doesn't leak live tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionStore {
  readonly ttlMs: number;
  create(now?: Date): Promise<{ token: string; session: Session }>;
  /** Returns the live session for a token (sliding its expiry when due), or `null`. */
  validate(token: string, now?: Date): Promise<{ session: Session; bumped: boolean } | null>;
  revoke(token: string): Promise<void>;
  purgeExpired(now?: Date): Promise<number>;
  /** Deletes sessions created under a different `APP_PASSWORD`. */
  purgeOtherPasswords(): Promise<number>;
}

export function createSessionStore(options: {
  prisma: PrismaClient;
  ttlDays: number;
  passwordFingerprint: string;
}): SessionStore {
  const { prisma, passwordFingerprint } = options;
  const ttlMs = options.ttlDays * MS_PER_DAY;

  return {
    ttlMs,

    async create(now = new Date()) {
      const token = randomBytes(32).toString("base64url");
      const session = await prisma.session.create({
        data: {
          tokenHash: hashToken(token),
          passwordFingerprint,
          createdAt: now,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      });
      return { token, session };
    },

    async validate(token, now = new Date()) {
      const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!session || session.expiresAt <= now || session.passwordFingerprint !== passwordFingerprint) {
        return null;
      }
      if (now.getTime() - session.lastSeenAt.getTime() <= SESSION_BUMP_INTERVAL_MS) {
        return { session, bumped: false };
      }
      const expiresAt = new Date(now.getTime() + ttlMs);
      await prisma.session.updateMany({
        where: { id: session.id },
        data: { lastSeenAt: now, expiresAt },
      });
      return { session: { ...session, lastSeenAt: now, expiresAt }, bumped: true };
    },

    async revoke(token) {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    },

    async purgeExpired(now = new Date()) {
      const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
      return count;
    },

    async purgeOtherPasswords() {
      const { count } = await prisma.session.deleteMany({
        where: { passwordFingerprint: { not: passwordFingerprint } },
      });
      return count;
    },
  };
}
