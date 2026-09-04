import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  compareEmbeddings,
  embeddingSchema,
  FACE_MATCH_THRESHOLD,
} from "./face-math";

// A deterministic pseudo-embedding generator so tests don't depend on a model.
function vec(seed: number, dim = 128): number[] {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < dim; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out.push((x / 0x7fffffff) * 2 - 1);
  }
  return out;
}

/** Nudge a vector slightly so it stays highly similar (same "person"). */
function jitter(v: number[], amount: number): number[] {
  return v.map((n, i) => n + (i % 2 === 0 ? amount : -amount) * 0.5);
}

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    const v = vec(1);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 6);
  });

  it("is -1 for exactly opposite vectors", () => {
    const v = vec(2);
    expect(cosineSimilarity(v, v.map((n) => -n))).toBeCloseTo(-1, 6);
  });

  it("is ~0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0, 0], [0, 1, 0, 0])).toBeCloseTo(0, 6);
  });

  it("returns -1 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(-1);
  });

  it("returns -1 for a zero vector (no direction)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(-1);
  });
});

describe("compareEmbeddings", () => {
  it("matches the same face (identical embedding)", () => {
    const v = vec(7);
    const r = compareEmbeddings(v, v);
    expect(r.match).toBe(true);
    expect(r.similarity).toBe(1);
    expect(r.threshold).toBe(FACE_MATCH_THRESHOLD);
  });

  it("matches a lightly jittered capture of the same face", () => {
    const enrolled = vec(9);
    const r = compareEmbeddings(enrolled, jitter(enrolled, 0.02));
    expect(r.match).toBe(true);
    expect(r.similarity).toBeGreaterThanOrEqual(FACE_MATCH_THRESHOLD);
  });

  it("rejects a different person", () => {
    const r = compareEmbeddings(vec(11), vec(999));
    expect(r.match).toBe(false);
    expect(r.similarity).toBeLessThan(FACE_MATCH_THRESHOLD);
  });

  it("rounds similarity to 3 decimals", () => {
    const r = compareEmbeddings(vec(3), vec(3));
    expect(Number.isInteger(r.similarity * 1000)).toBe(true);
  });
});

describe("embeddingSchema", () => {
  it("accepts a 128-d numeric embedding", () => {
    expect(embeddingSchema.safeParse({ embedding: vec(1, 128) }).success).toBe(true);
  });

  it("rejects an embedding that is too short", () => {
    expect(embeddingSchema.safeParse({ embedding: [1, 2, 3] }).success).toBe(false);
  });

  it("rejects non-finite values", () => {
    const bad = vec(1, 128);
    bad[0] = Number.POSITIVE_INFINITY;
    expect(embeddingSchema.safeParse({ embedding: bad }).success).toBe(false);
  });

  it("rejects a non-array embedding", () => {
    expect(embeddingSchema.safeParse({ embedding: "nope" }).success).toBe(false);
  });
});
