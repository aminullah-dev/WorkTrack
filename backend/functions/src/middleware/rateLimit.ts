import { createHash } from "node:crypto";
import type { Request } from "express";
import { ApiError } from "../lib/errors";
import { db } from "../lib/firestore";

/**
 * Fixed-window rate limiting backed by Firestore.
 *
 * Company signup is unauthenticated and writes about a dozen documents plus a
 * Firebase Auth user per call, so an unthrottled endpoint is both a data-
 * pollution and a billing problem. There is no shared process memory to count
 * in — Cloud Functions scales to many instances — so the counter has to live in
 * Firestore, and it has to be incremented inside a transaction or two
 * simultaneous requests both read the same count and both pass.
 *
 * Counters live in a top-level `rateLimits` collection. Client SDKs cannot
 * reach it (backend/firestore.rules denies everything), and `expiresAt` is
 * shaped for a Firestore TTL policy so old windows delete themselves.
 */

export interface RateLimitRule {
  /** Namespace, so two limiters can never share a counter. */
  bucket: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

interface WindowDoc {
  count: number;
  windowStart: number;
  expiresAt: Date;
}

/** Keys can be email addresses or IPs; hashing keeps them out of the store. */
function counterId(bucket: string, key: string): string {
  const digest = createHash("sha256").update(`${bucket}:${key}`).digest("hex");
  return `${bucket}_${digest.slice(0, 32)}`;
}

export async function consumeRateLimit(
  rule: RateLimitRule,
  key: string,
  now: number = Date.now(),
): Promise<RateLimitResult> {
  const ref = db.collection("rateLimits").doc(counterId(rule.bucket, key));

  // Every caller of a given rule contends on one document, so under a burst the
  // transaction can exhaust its retries. An abuse control that cannot count has
  // to refuse rather than wave the request through, and turning that into a
  // clean 429 is better than the 500 an escaping error would produce.
  try {
    return await runWindow(ref, rule, now);
  } catch (err) {
    console.warn(`Rate limit counter unavailable for ${rule.bucket}; failing closed`, err);
    return { allowed: false, retryAfterSeconds: 60 };
  }
}

function runWindow(
  ref: FirebaseFirestore.DocumentReference,
  rule: RateLimitRule,
  now: number,
): Promise<RateLimitResult> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.data() as WindowDoc | undefined;

    const inWindow = current !== undefined && now - current.windowStart < rule.windowMs;
    const windowStart = inWindow ? current.windowStart : now;
    const used = inWindow ? current.count : 0;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((windowStart + rule.windowMs - now) / 1000),
    );

    // Already over the limit: refuse without writing, so a flood of blocked
    // requests does not itself turn into a flood of Firestore writes.
    if (used >= rule.limit) {
      return { allowed: false, retryAfterSeconds };
    }

    tx.set(ref, {
      count: used + 1,
      windowStart,
      expiresAt: new Date(windowStart + rule.windowMs),
    });
    return { allowed: true, retryAfterSeconds };
  });
}

/**
 * Best-effort client address.
 *
 * X-Forwarded-For is caller-supplied and can be spoofed, so this is a way to
 * spread honest traffic across counters — NOT a security boundary. The limits
 * that actually bound abuse are the per-email one (an attacker targeting a
 * specific victim cannot vary it) and the global one (nothing can bypass it).
 */
export function clientAddress(req: Request): string {
  const forwarded = req.header("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

/** Applies a rule and throws 429 with Retry-After when it is exhausted. */
export async function enforceRateLimit(
  rule: RateLimitRule,
  key: string,
  detail: string,
): Promise<void> {
  const { allowed, retryAfterSeconds } = await consumeRateLimit(rule, key);
  if (allowed) return;
  throw ApiError.rateLimited(detail, retryAfterSeconds);
}
