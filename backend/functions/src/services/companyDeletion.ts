import { FieldPath } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { ApiError, ErrorCodes } from "../lib/errors";
import { audit, db, nowTimestamp, tenant } from "../lib/firestore";
import type { TenantCollection } from "../lib/firestore";

/**
 * Closing a company account.
 *
 * Deleting a tenant destroys its payroll history, its attendance record and
 * every employee file in it. That is not something to do on one click from a
 * frustrated administrator, and in most places those records must be retained
 * for years — so this schedules the deletion rather than performing it:
 *
 *   1. An administrator requests closure and types the company name to confirm.
 *   2. The account is suspended immediately, so it is obvious something changed
 *      and nobody keeps filing attendance into a tenant that is on its way out.
 *   3. Nothing is destroyed for a grace period, during which any administrator
 *      can cancel and get everything back untouched.
 *   4. Only after that does a scheduled job purge it, and only then is anything
 *      irreversible.
 */

/** How long a scheduled deletion can still be undone. */
export const GRACE_DAYS = 30;

export type DeletionStatus = "NONE" | "SCHEDULED";

export interface CompanyDeletion {
  status: DeletionStatus;
  requestedAt: string | null;
  requestedBy: string | null;
  /** Date from which the purge may run, YYYY-MM-DD. */
  purgeAfter: string | null;
  reason: string | null;
}

export const NOT_SCHEDULED: CompanyDeletion = {
  status: "NONE",
  requestedAt: null,
  requestedBy: null,
  purgeAfter: null,
  reason: null,
};

export const deletionRequestSchema = z.object({
  /** The company's own name, typed back. Guards against a misclick. */
  confirmName: z.string().min(1),
  reason: z.string().max(500).nullish(),
});

/** Date `days` after `fromIso`, as YYYY-MM-DD. */
export function addDays(fromIso: string, days: number): string {
  const t = new Date(`${fromIso}T00:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Whether a purge may run. Deliberately strict: anything other than a scheduled
 * request whose grace period has fully elapsed is refused, so a malformed or
 * half-written record can never be read as permission to delete.
 */
export function isDueForPurge(deletion: CompanyDeletion, todayIso: string): boolean {
  if (deletion.status !== "SCHEDULED") return false;
  if (!deletion.purgeAfter) return false;
  return todayIso >= deletion.purgeAfter;
}

export async function getDeletion(cid: string): Promise<CompanyDeletion> {
  const snap = await db.collection("companies").doc(cid).get();
  const d = snap.data()?.deletion as Partial<CompanyDeletion> | undefined;
  if (!d || d.status !== "SCHEDULED") return NOT_SCHEDULED;
  return {
    status: "SCHEDULED",
    requestedAt: d.requestedAt ?? null,
    requestedBy: d.requestedBy ?? null,
    purgeAfter: d.purgeAfter ?? null,
    reason: d.reason ?? null,
  };
}

export async function requestDeletion(
  cid: string,
  actorId: string,
  actorRole: string,
  input: z.infer<typeof deletionRequestSchema>,
  todayIso: string,
): Promise<CompanyDeletion> {
  const ref = db.collection("companies").doc(cid);
  const snap = await ref.get();
  if (!snap.exists) throw ApiError.notFound("Company not found");

  const name = (snap.data()?.name as string | undefined) ?? "";
  // Compared loosely on whitespace only — an administrator retyping their own
  // company name should not be defeated by a stray space.
  if (input.confirmName.trim() !== name.trim()) {
    throw new ApiError(
      400,
      ErrorCodes.VALIDATION_FAILED,
      "Type the company name exactly to confirm closing the account",
      { confirmName: "Does not match the company name" },
    );
  }

  const deletion: CompanyDeletion = {
    status: "SCHEDULED",
    requestedAt: new Date().toISOString(),
    requestedBy: actorId,
    purgeAfter: addDays(todayIso, GRACE_DAYS),
    reason: input.reason ?? null,
  };

  await ref.set(
    { deletion, status: "SUSPENDED", updatedAt: nowTimestamp() },
    { merge: true },
  );

  await audit(cid, {
    actorId,
    actorRole,
    action: "company.deletion.request",
    resourceType: "companies",
    resourceId: cid,
    after: { purgeAfter: deletion.purgeAfter, reason: deletion.reason },
  });

  return deletion;
}

export async function cancelDeletion(
  cid: string,
  actorId: string,
  actorRole: string,
): Promise<CompanyDeletion> {
  const ref = db.collection("companies").doc(cid);
  const current = await getDeletion(cid);
  if (current.status !== "SCHEDULED") {
    throw ApiError.business("INVALID_STATE", "This account is not scheduled for closure");
  }

  await ref.set(
    { deletion: NOT_SCHEDULED, status: "ACTIVE", updatedAt: nowTimestamp() },
    { merge: true },
  );

  await audit(cid, {
    actorId,
    actorRole,
    action: "company.deletion.cancel",
    resourceType: "companies",
    resourceId: cid,
    before: { purgeAfter: current.purgeAfter },
  });

  return NOT_SCHEDULED;
}

export interface PurgeResult {
  companyId: string;
  authUsersDeleted: number;
  purged: boolean;
}

/**
 * Destroys the tenant. Refuses unless a scheduled request has actually come due,
 * so neither a stray call nor a bug in a caller can delete a live company.
 */
/**
 * Every document id in a tenant collection, paged to exhaustion.
 *
 * A single capped `.get()` would leave the overflow behind, and because the
 * purge then destroys the tree, the ids of the accounts it missed would be
 * unrecoverable — orphaned logins with valid claims and no record of them.
 * Paging by document name is stable here: nothing writes to the tenant during
 * a purge, and the read happens before anything is deleted.
 */
export async function allDocIds(
  cid: string,
  collection: TenantCollection,
  keep: (data: FirebaseFirestore.DocumentData) => boolean = () => true,
): Promise<string[]> {
  const PAGE = 1000;
  const ids: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    let q = tenant(cid, collection).orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor !== null) q = q.startAfter(cursor);
    const snap: FirebaseFirestore.QuerySnapshot = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) if (keep(doc.data())) ids.push(doc.id);
    if (snap.size < PAGE) break;
    cursor = snap.docs[snap.docs.length - 1].id;
  }
  return ids;
}

export async function purgeCompany(cid: string, todayIso: string): Promise<PurgeResult> {
  const deletion = await getDeletion(cid);
  if (!isDueForPurge(deletion, todayIso)) {
    throw ApiError.business(
      "INVALID_STATE",
      "This account is not due for purge; nothing was deleted",
    );
  }

  // Collect the logins BEFORE the tree goes, or there is no way left to find
  // them: an auth user carries the company only in its custom claims, and
  // listing every user of the project to filter them is not workable at size.
  const auth = getAuth();
  const [employees, devices] = await Promise.all([
    allDocIds(cid, "employees"),
    allDocIds(cid, "devices", (d) => d.type === "KIOSK"),
  ]);
  // Kiosk accounts are real logins too, keyed by the device id.
  const uids = [...employees, ...devices];

  let authUsersDeleted = 0;
  for (let i = 0; i < uids.length; i += 1000) {
    const batch = uids.slice(i, i + 1000);
    const result = await auth.deleteUsers(batch);
    authUsersDeleted += batch.length - result.failureCount;
    if (result.failureCount > 0) {
      console.warn(
        "COMPANY_PURGE_AUTH_FAILURES",
        cid,
        result.errors.slice(0, 5).map((e) => e.error.message).join("; "),
      );
    }
  }

  // recursiveDelete walks the subcollections, which a plain delete would orphan.
  await db.recursiveDelete(db.collection("companies").doc(cid));

  console.warn("COMPANY_PURGED", JSON.stringify({ companyId: cid, authUsersDeleted }));
  return { companyId: cid, authUsersDeleted, purged: true };
}

/** Companies whose grace period has elapsed. */
export async function companiesDueForPurge(todayIso: string): Promise<string[]> {
  const snap = await db
    .collection("companies")
    .where("deletion.status", "==", "SCHEDULED")
    .limit(500)
    .get();
  return snap.docs
    .filter((d) => {
      const del = d.data().deletion as Partial<CompanyDeletion> | undefined;
      return isDueForPurge({ ...NOT_SCHEDULED, ...del, status: "SCHEDULED" }, todayIso);
    })
    .map((d) => d.id);
}
