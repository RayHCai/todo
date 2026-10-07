/**
 * Stable render keys. A new item starts with a `tmp_…` id; when the server id arrives the
 * item keeps rendering under its first key, so its `layoutId` (and focus) survive the swap.
 */
const aliases = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export const keyOf = (id: string): string => aliases.get(id) ?? id;

export function aliasId(serverId: string, tmpId: string): void {
  aliases.set(serverId, keyOf(tmpId));
}

/** Records the in-flight create for a tmp id, so edits made meanwhile can wait for the real id. */
export function trackCreate(tmpId: string, created: Promise<string>): void {
  pending.set(tmpId, created);
  created.finally(() => window.setTimeout(() => pending.delete(tmpId), 10_000)).catch(() => {});
}

export async function resolveId(id: string): Promise<string> {
  return pending.get(id) ?? id;
}
