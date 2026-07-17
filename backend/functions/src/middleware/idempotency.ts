import { nowTimestamp, tenant } from "../lib/firestore";

/**
 * At-most-once guard for non-idempotent POSTs. Returns the stored response for
 * a replayed key, or null when the key is fresh (caller then executes and
 * records). Keys are tenant-scoped and expire via TTL policy on `expiresAt`.
 */
export async function checkIdempotency(
  cid: string,
  key: string,
): Promise<unknown | null> {
  const doc = await tenant(cid, "idempotencyKeys").doc(key).get();
  return doc.exists ? (doc.data()?.response ?? null) : null;
}

export async function recordIdempotency(
  cid: string,
  key: string,
  response: unknown,
): Promise<void> {
  const now = nowTimestamp();
  await tenant(cid, "idempotencyKeys")
    .doc(key)
    .set({
      response,
      createdAt: now,
      // Firestore TTL field: configure the policy on `expiresAt` in the console/IaC.
      expiresAt: new Date(now.toDate().getTime() + 24 * 60 * 60 * 1000),
    });
}
