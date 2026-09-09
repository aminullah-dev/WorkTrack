import { z } from "zod";

/**
 * Pure face-embedding math — no Firebase imports, so it is unit-testable in
 * isolation. Embeddings are the on-device face vectors (MobileFaceNet=192,
 * FaceNet=128); identity matching is cosine similarity.
 */

/**
 * Cosine-similarity threshold above which two embeddings are treated as the
 * same person. Tune against real enrollment captures before a wide rollout.
 */
export const FACE_MATCH_THRESHOLD = 0.6;

// Accepted embedding sizes, kept flexible so the model can change without a
// schema migration.
export const MIN_EMBEDDING_DIM = 64;
export const MAX_EMBEDDING_DIM = 1024;

/** Request body carrying an on-device face embedding (enroll & verify). */
export const embeddingSchema = z.object({
  embedding: z.array(z.number().finite()).min(MIN_EMBEDDING_DIM).max(MAX_EMBEDDING_DIM),
});

/** Cosine similarity of two equal-length vectors, in [-1, 1]; -1 if invalid. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return -1;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface FaceMatch {
  match: boolean;
  similarity: number;
  threshold: number;
}

/** Pure match decision for a stored/candidate embedding pair. */
export function compareEmbeddings(stored: number[], candidate: number[]): FaceMatch {
  const similarity = cosineSimilarity(stored, candidate);
  return {
    match: similarity >= FACE_MATCH_THRESHOLD,
    similarity: Math.round(similarity * 1000) / 1000,
    threshold: FACE_MATCH_THRESHOLD,
  };
}
