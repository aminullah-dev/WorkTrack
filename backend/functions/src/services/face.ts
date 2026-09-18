import { FieldValue } from "firebase-admin/firestore";
import { ApiError, ErrorCodes } from "../lib/errors";
import { audit, nowTimestamp, tenant } from "../lib/firestore";
import { compareEmbeddings, FACE_MATCH_THRESHOLD, type FaceMatch } from "../lib/face-math";

/**
 * On-device face recognition support.
 *
 * The Android app computes a face embedding locally with an on-device model
 * (MobileFaceNet, 192-d) and sends ONLY the numeric vector — never the photo —
 * for enrollment and verification. Identity matching is cosine similarity
 * between the check-in embedding and the employee's enrolled embedding, so no
 * biometric image ever leaves the device or is stored on the server.
 *
 * Pure math and the request schema live in ../lib/face-math (unit-tested).
 */

export { embeddingSchema, FACE_MATCH_THRESHOLD, type FaceMatch } from "../lib/face-math";

/**
 * Enrolls an employee's face.
 *
 * Enrollment is once-only on purpose: silently overwriting an existing
 * embedding would let anyone holding an unlocked phone re-enroll their own
 * face onto the account and check in as its owner indefinitely. Replacing an
 * enrollment requires an admin reset (DELETE /employees/:id/face), which is
 * permission-checked and audited.
 */
export async function enrollFace(
  cid: string,
  employeeId: string,
  embedding: number[],
): Promise<void> {
  const ref = tenant(cid, "employees").doc(employeeId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw ApiError.notFound("Employee not found");
  }
  if (Array.isArray((snap.data() as { faceEmbedding?: unknown }).faceEmbedding)) {
    throw ApiError.business(
      ErrorCodes.FACE_ALREADY_ENROLLED,
      "A face is already enrolled; ask an administrator to reset it first",
    );
  }

  await ref.update({
    faceEmbedding: embedding,
    faceEnrolledAt: nowTimestamp(),
  });

  // Identity-changing operation: always audited (never log the embedding).
  await audit(cid, {
    actorId: employeeId,
    actorRole: "EMPLOYEE",
    action: "employees.face.enroll",
    resourceType: "employees",
    resourceId: employeeId,
    after: { faceEnrolled: true, dimensions: embedding.length },
  });
}

export async function clearFace(cid: string, employeeId: string): Promise<void> {
  await tenant(cid, "employees").doc(employeeId).update({
    faceEmbedding: FieldValue.delete(),
    faceEnrolledAt: FieldValue.delete(),
  });
}

export async function getEnrolledEmbedding(
  cid: string,
  employeeId: string,
): Promise<number[] | null> {
  const snap = await tenant(cid, "employees").doc(employeeId).get();
  const v = (snap.data() as { faceEmbedding?: unknown } | undefined)?.faceEmbedding;
  return Array.isArray(v) && v.every((n) => typeof n === "number") ? (v as number[]) : null;
}

export interface FaceVerifyResult extends FaceMatch {
  enrolled: boolean;
}

/** Compares a candidate embedding against the employee's enrolled one. */
export async function verifyFace(
  cid: string,
  employeeId: string,
  candidate: number[],
): Promise<FaceVerifyResult> {
  const stored = await getEnrolledEmbedding(cid, employeeId);
  if (!stored) {
    return { match: false, similarity: 0, threshold: FACE_MATCH_THRESHOLD, enrolled: false };
  }
  return { ...compareEmbeddings(stored, candidate), enrolled: true };
}
