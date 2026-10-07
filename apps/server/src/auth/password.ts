import { createHmac } from "node:crypto";
import argon2 from "argon2";

export interface PasswordVerifier {
  /** Constant-time check of a submitted password against the boot-time argon2id hash. */
  verify(candidate: string): Promise<boolean>;
  /** HMAC of the current password, stored on each session so a password change revokes them. */
  readonly fingerprint: string;
}

export function passwordFingerprint(cookieSecret: string, password: string): string {
  return createHmac("sha256", cookieSecret).update(password).digest("hex");
}

/**
 * Hashes the shared password once at boot and keeps only the hash in memory. Login uses
 * `argon2.verify`, which re-hashes the input with the stored salt; hashing it again and
 * comparing strings would never match because each hash gets a fresh random salt.
 */
export async function createPasswordVerifier(password: string, cookieSecret: string): Promise<PasswordVerifier> {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  return {
    fingerprint: passwordFingerprint(cookieSecret, password),
    async verify(candidate) {
      try {
        return await argon2.verify(hash, candidate);
      } catch {
        return false;
      }
    },
  };
}
