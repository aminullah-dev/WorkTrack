import { getAuth } from "firebase-admin/auth";
import { db } from "../lib/firestore";

/**
 * Nightly reset of the public demo tenant.
 *
 * The demo is open to anyone, so it fills up with whatever visitors type. This
 * wipes the tenant and lays the seeded company down again, so the next visitor
 * sees the same clean set of people, shifts, attendance and payslips.
 *
 * The guard below is the important part of this file. This function deletes an
 * entire company, and the only thing standing between it and a real tenant is
 * the project it happens to be deployed in — so it refuses to run anywhere that
 * looks live, and refuses anywhere it has not been explicitly told it belongs.
 */

/** Anything that reads as a live tenant. Matched case-insensitively. */
const LOOKS_LIVE = /prod|production|live/i;

/** The only project this is allowed to touch. */
const DEMO_PROJECT = "worktrack-demo-af";

export class DemoResetRefused extends Error {}

function currentProjectId(): string {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId ||
    ""
  );
}

/**
 * Throws unless we are certainly in the demo project. Deliberately fails closed
 * on an unknown project id: not being able to tell where we are is itself a
 * reason not to delete anything.
 */
export function assertSafeToReset(projectId = currentProjectId()): string {
  if (!projectId) {
    throw new DemoResetRefused("Refusing to reset: the project id is unknown");
  }
  if (LOOKS_LIVE.test(projectId)) {
    throw new DemoResetRefused(`Refusing to reset "${projectId}": it reads as a live project`);
  }
  if (projectId !== DEMO_PROJECT) {
    throw new DemoResetRefused(
      `Refusing to reset "${projectId}": only ${DEMO_PROJECT} may be reset`,
    );
  }
  return projectId;
}

export interface ResetOutcome {
  projectId: string;
  companyDeleted: boolean;
  /** Seeded logins removed and recreated. */
  seedUsersDeleted: number;
  /** Accounts visitors signed up with, which the seed does not own. */
  visitorUsersDeleted: number;
  seeded: boolean;
}

/** Splits a list into batches; deleteUsers accepts at most 1000 at a time. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new RangeError("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const DELETE_BATCH = 1000;

/**
 * Removes every account in the project, seeded and visitor-created alike; the
 * seed recreates its four immediately afterwards.
 *
 * Every uid is collected before anything is deleted. Deleting while paging
 * would shift the page boundaries underneath the cursor and silently skip
 * accounts, which is how a "reset" quietly stops being one.
 */
async function deleteAllAuthUsers(seedUids: string[]): Promise<{ seeded: number; visitors: number }> {
  const auth = getAuth();
  const seedSet = new Set(seedUids);
  const uids: string[] = [];

  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) uids.push(user.uid);
    pageToken = page.pageToken;
  } while (pageToken);

  let seeded = 0;
  let visitors = 0;
  for (const uid of uids) {
    if (seedSet.has(uid)) seeded += 1;
    else visitors += 1;
  }

  for (const batch of chunk(uids, DELETE_BATCH)) {
    const result = await auth.deleteUsers(batch);
    if (result.failureCount > 0) {
      // Reported rather than thrown: a handful of stubborn accounts must not
      // stop the tenant from being reseeded.
      console.warn(
        "DEMO_RESET_AUTH_FAILURES",
        result.errors.slice(0, 5).map((e) => e.error.message).join("; "),
      );
    }
  }

  return { seeded, visitors };
}

export async function resetDemoTenant(): Promise<ResetOutcome> {
  const projectId = assertSafeToReset();

  // Imported lazily and only after the guard has passed, so requiring the seed
  // can never be a side effect of loading this module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const seed = require("../../seed.js") as {
    seedDemoTenant: () => Promise<void>;
    CID: string;
    DEMO_UIDS: string[];
  };

  const companyRef = db.collection("companies").doc(seed.CID);
  // recursiveDelete walks the subcollections too; a plain delete would leave
  // every punch, payslip and ledger entry orphaned but still stored.
  await db.recursiveDelete(companyRef);

  const { seeded, visitors } = await deleteAllAuthUsers(seed.DEMO_UIDS);

  await seed.seedDemoTenant();

  return {
    projectId,
    companyDeleted: true,
    seedUsersDeleted: seeded,
    visitorUsersDeleted: visitors,
    seeded: true,
  };
}
