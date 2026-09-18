import { describe, it, expect, beforeEach } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { db, tenant } from "../lib/firestore";
import { withIdempotency } from "./idempotency";

/**
 * The old implementation read the key, ran the caller's work, then wrote the
 * key. Two requests carrying the same Idempotency-Key both read "not found",
 * both ran the work and both recorded it — the precise duplicate the header
 * exists to prevent, and one the offline Android client's retries can reach.
 *
 * Skipped unless a Firestore emulator is running.
 */

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let cid = "";
let key = "";
let seq = 0;

function counter() {
  const state = { runs: 0 };
  return {
    state,
    work: async () => {
      state.runs += 1;
      // Long enough for a sibling request to arrive mid-flight.
      await new Promise((r) => setTimeout(r, 150));
      return { punchId: `p${state.runs}` };
    },
  };
}

describe.skipIf(!EMULATOR)("idempotency", () => {
  beforeEach(async () => {
    seq += 1;
    cid = `idem_${Date.now()}_${seq}`;
    key = `key_${seq}`;
    await db.collection("companies").doc(cid).set({ name: "Idem" });
  });

  it("runs the work and returns its result", async () => {
    const { state, work } = counter();

    const outcome = await withIdempotency(cid, key, work);

    expect(outcome.result).toEqual({ punchId: "p1" });
    expect(outcome.replayed).toBe(false);
    expect(state.runs).toBe(1);
  });

  it("replays the stored response instead of running the work again", async () => {
    const { state, work } = counter();
    await withIdempotency(cid, key, work);

    const replay = await withIdempotency(cid, key, work);

    expect(replay.replayed).toBe(true);
    expect(replay.result).toEqual({ punchId: "p1" });
    expect(state.runs).toBe(1);
  });

  it("runs the work exactly once for two simultaneous requests", async () => {
    const { state, work } = counter();

    const results = await Promise.allSettled([
      withIdempotency(cid, key, work),
      withIdempotency(cid, key, work),
    ]);

    // The guarantee is that the punch happens once. The request that loses the
    // claim either replays the winner's response or is refused with 409 — what
    // it must never do is execute a second time.
    expect(state.runs).toBe(1);
    for (const r of results) {
      if (r.status === "fulfilled") {
        expect(r.value.result).toEqual({ punchId: "p1" });
      } else {
        expect(r.reason).toMatchObject({ status: 409, code: "IDEMPOTENCY_REPLAY" });
      }
    }
  });

  it("holds to one execution across a burst", async () => {
    const { state, work } = counter();

    // Eight callers contending on one claim document; transactions retry hard,
    // which is slow but must never produce a second execution.
    await Promise.allSettled(
      Array.from({ length: 8 }, () => withIdempotency(cid, key, work)),
    );

    expect(state.runs).toBe(1);
  }, 30_000);

  it("releases the key when the work fails, so a corrected retry can proceed", async () => {
    await expect(
      withIdempotency(cid, key, async () => {
        throw new Error("geofence rejected");
      }),
    ).rejects.toThrow("geofence rejected");

    // The operation never happened, so the client must not be locked out of
    // its own key for the whole lease.
    const { state, work } = counter();
    const retry = await withIdempotency(cid, key, work);

    expect(retry.replayed).toBe(false);
    expect(state.runs).toBe(1);
    expect((await tenant(cid, "idempotencyKeys").doc(key).get()).data()?.status).toBe("COMPLETED");
  });

  it("takes over a claim whose holder died", async () => {
    // A request that crashed mid-flight leaves the key PENDING. Without a lease
    // that key would be unusable forever.
    await tenant(cid, "idempotencyKeys").doc(key).set({
      status: "PENDING",
      claimedAt: Timestamp.fromMillis(Date.now() - 5 * 60 * 1000),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const { state, work } = counter();
    const outcome = await withIdempotency(cid, key, work);

    expect(outcome.replayed).toBe(false);
    expect(state.runs).toBe(1);
  });

  it("runs every time when no key is supplied", async () => {
    const { state, work } = counter();

    await withIdempotency(cid, undefined, work);
    await withIdempotency(cid, undefined, work);

    expect(state.runs).toBe(2);
  });
});
