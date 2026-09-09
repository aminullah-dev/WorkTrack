import { Timestamp } from "firebase-admin/firestore";
import { ApiError, ErrorCodes } from "../lib/errors";
import { db, nowTimestamp, tenant } from "../lib/firestore";

/**
 * At-most-once execution for non-idempotent POSTs.
 *
 * This used to be a read, then the caller's work, then a write. Two requests
 * carrying the same Idempotency-Key could both read "no such key", both run the
 * work and both record it — which is exactly the case the header exists to
 * prevent, and the offline Android client retries aggressively enough to hit
 * it: a punch could be recorded twice, a payroll run computed twice.
 *
 * Now the key is *claimed* in a transaction before the work starts, so only one
 * request can ever hold it. The claim carries a lease: if the request that held
 * it died before finishing, a later attempt takes the claim over rather than
 * being blocked on it forever.
 *
 * Keys are tenant-scoped and expire via a TTL policy on `expiresAt`.
 */

/** How long a claim is honoured before another attempt may take it over. */
const CLAIM_LEASE_MS = 60_000;

const KEY_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredKey {
  status: "PENDING" | "COMPLETED";
  response?: unknown;
  claimedAt: Timestamp;
}

type Claim =
  | { kind: "claimed" }
  | { kind: "replay"; response: unknown }
  | { kind: "in_flight" };

export interface IdempotentOutcome<T> {
  result: T;
  /** True when the stored response of an earlier identical request was returned. */
  replayed: boolean;
}

/**
 * Runs `work` at most once per (company, key).
 *
 * Without a key the work simply runs — the header is opt-in, and the Android
 * client sends it for every queued mutation.
 */
export async function withIdempotency<T>(
  cid: string,
  key: string | undefined,
  work: () => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  if (!key) {
    return { result: await work(), replayed: false };
  }

  const ref = tenant(cid, "idempotencyKeys").doc(key);
  const claim = await claimKey(ref);

  if (claim.kind === "replay") {
    return { result: claim.response as T, replayed: true };
  }
  if (claim.kind === "in_flight") {
    throw new ApiError(
      409,
      ErrorCodes.IDEMPOTENCY_REPLAY,
      "A request with this Idempotency-Key is already in progress",
    );
  }

  let result: T;
  try {
    result = await work();
  } catch (err) {
    // The work did not happen, so the key must not stay claimed — otherwise a
    // client correcting and retrying the same request would be locked out of
    // its own key for the whole lease.
    await ref.delete().catch(() => undefined);
    throw err;
  }

  // The work HAS happened by this point. If recording the response fails, say
  // so and still return it: turning a completed punch into an error because a
  // bookkeeping write failed would be worse than the claim going stale.
  await ref
    .set({
      status: "COMPLETED",
      response: result,
      claimedAt: nowTimestamp(),
      expiresAt: new Date(Date.now() + KEY_TTL_MS),
    })
    .catch((err: unknown) => {
      console.warn(`Could not record idempotency key ${key} for ${cid}`, err);
    });

  return { result, replayed: false };
}

/** Takes the key in a transaction, so exactly one caller can hold it. */
async function claimKey(ref: FirebaseFirestore.DocumentReference): Promise<Claim> {
  const nowMs = Date.now();
  const fresh = {
    status: "PENDING" as const,
    claimedAt: nowTimestamp(),
    expiresAt: new Date(nowMs + KEY_TTL_MS),
  };

  return db.runTransaction<Claim>(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, fresh);
      return { kind: "claimed" };
    }

    const stored = snap.data() as StoredKey;
    if (stored.status === "COMPLETED") {
      return { kind: "replay", response: stored.response ?? null };
    }

    // Still PENDING. Either a sibling request is mid-flight, or the one that
    // claimed it died and left the key held.
    const heldFor = nowMs - (stored.claimedAt?.toMillis() ?? 0);
    if (heldFor < CLAIM_LEASE_MS) {
      return { kind: "in_flight" };
    }
    tx.set(ref, fresh);
    return { kind: "claimed" };
  });
}
