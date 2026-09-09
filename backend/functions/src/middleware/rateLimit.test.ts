import { describe, it, expect, beforeEach } from "vitest";
import { consumeRateLimit, type RateLimitRule } from "./rateLimit";

/**
 * The counter has to be correct under concurrency: Cloud Functions runs many
 * instances, so a read-then-write across two round trips would let simultaneous
 * requests both see the same count and both pass.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const HOUR = 60 * 60 * 1000;
let key = "";
let seq = 0;

function rule(limit: number, bucket = "test"): RateLimitRule {
  return { bucket, limit, windowMs: HOUR };
}

describe.skipIf(!EMULATOR)("rate limit", () => {
  beforeEach(() => {
    key = `k_${Date.now()}_${seq++}`;
  });

  it("allows up to the limit and refuses after it", async () => {
    const r = rule(3);
    const now = Date.now();

    for (let i = 0; i < 3; i++) {
      expect((await consumeRateLimit(r, key, now)).allowed, `call ${i + 1}`).toBe(true);
    }
    expect((await consumeRateLimit(r, key, now)).allowed).toBe(false);
  });

  it("reports how long the caller has to wait", async () => {
    const r = rule(1);
    const now = Date.now();
    await consumeRateLimit(r, key, now);

    const blocked = await consumeRateLimit(r, key, now + 10 * 60 * 1000);

    // Fifty minutes left of the hour, give or take the second it was called in.
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(49 * 60);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(50 * 60);
  });

  it("allows again once the window has passed", async () => {
    const r = rule(1);
    const now = Date.now();
    await consumeRateLimit(r, key, now);

    expect((await consumeRateLimit(r, key, now + HOUR + 1)).allowed).toBe(true);
  });

  it("counts each key separately", async () => {
    const r = rule(1);
    const now = Date.now();
    await consumeRateLimit(r, key, now);

    expect((await consumeRateLimit(r, `${key}_other`, now)).allowed).toBe(true);
  });

  it("does not let two buckets share a counter", async () => {
    const now = Date.now();
    await consumeRateLimit(rule(1, "bucket-a"), key, now);

    expect((await consumeRateLimit(rule(1, "bucket-b"), key, now)).allowed).toBe(true);
  });

  it("lets only one of two simultaneous callers take the last slot", async () => {
    const r = rule(1);
    const now = Date.now();

    const results = await Promise.all([
      consumeRateLimit(r, key, now),
      consumeRateLimit(r, key, now),
    ]);

    expect(results.filter((x) => x.allowed)).toHaveLength(1);
  });

  it("never allows more than the limit under a burst", async () => {
    // Twenty callers contending on one counter is where a transaction can run
    // out of retries. The guarantee that matters is that the limit is never
    // exceeded — a contended caller is refused, never waved through.
    const r = rule(5);
    const now = Date.now();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(r, key, now)),
    );

    const allowed = results.filter((x) => x.allowed).length;
    expect(allowed).toBeLessThanOrEqual(5);
    expect(allowed).toBeGreaterThan(0);
  }, 30_000);
});
