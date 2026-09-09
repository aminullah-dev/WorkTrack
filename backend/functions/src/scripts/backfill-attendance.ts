/*
 * Rebuilds attendanceDays projections from the raw punch stream.
 *
 * Why this exists: recomputeAttendanceDay needs a composite index on
 * (employeeId ASC, punchedAt ASC) that was missing, so for every punch the
 * projection write failed after the punch itself had been stored. Punches
 * accumulated while the attendance board stayed empty. The index is in place
 * now and each new punch rebuilds its own day, but historical days were never
 * computed and nothing will touch them again on its own.
 *
 * The rebuild calls the same recomputeAttendanceDay the API uses, so a
 * backfilled day is identical to one written by a live punch — there is no
 * second implementation of the attendance maths to drift.
 *
 * Safe to re-run: recomputing a day derives it entirely from the punches, so
 * running twice produces the same document.
 *
 * Usage (from backend/functions, after `npm run build`):
 *
 *   # See what would change — writes nothing. Always start here.
 *   GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/backfill-attendance.js
 *
 *   # Apply it
 *   GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/backfill-attendance.js --apply
 *
 * Credentials come from Application Default Credentials; run
 * `gcloud auth application-default login` first, or point
 * GOOGLE_APPLICATION_CREDENTIALS at a service-account key.
 *
 * Options:
 *   --apply              Write. Without it the script only reports.
 *   --company=<id>       Restrict to one tenant (default: every company).
 *   --from=YYYY-MM-DD    Only days on or after this company-local date.
 *   --to=YYYY-MM-DD      Only days on or before this company-local date.
 *   --all                Also recompute days that already exist. The default
 *                        touches only missing ones, which is the damage here.
 *   --concurrency=<n>    Parallel day rebuilds (default 5).
 */

import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { db, tenant } from "../lib/firestore";
import { localDateOf, recomputeAttendanceDay } from "../services/attendance";
import { getSettings } from "../services/settings";

interface Options {
  apply: boolean;
  company: string | null;
  from: string | null;
  to: string | null;
  all: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const value = (name: string): string | null => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const isoOrNull = (name: string): string | null => {
    const v = value(name);
    if (v !== null && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new Error(`--${name} must be YYYY-MM-DD, got "${v}"`);
    }
    return v;
  };
  const concurrency = Number.parseInt(value("concurrency") ?? "5", 10);
  if (!Number.isFinite(concurrency) || concurrency < 1 || concurrency > 50) {
    throw new Error("--concurrency must be between 1 and 50");
  }
  return {
    apply: argv.includes("--apply"),
    company: value("company"),
    from: isoOrNull("from"),
    to: isoOrNull("to"),
    all: argv.includes("--all"),
    concurrency,
  };
}

/** One (employee, company-local date) pair that has at least one punch. */
interface DayKey {
  employeeId: string;
  date: string;
}

/**
 * Every day that has punches, read straight from the punch stream.
 *
 * Paginated by document id: punch ids are ULIDs, so they are unique and
 * time-ordered, and ordering by them needs no composite index. Only the two
 * fields the grouping needs are fetched.
 */
async function daysWithPunches(cid: string, timezone: string): Promise<DayKey[]> {
  const seen = new Set<string>();
  const out: DayKey[] = [];
  const PAGE = 500;
  let cursor: string | null = null;
  let scanned = 0;

  for (;;) {
    let query = tenant(cid, "punches")
      .select("employeeId", "punchedAt")
      .orderBy(FieldPath.documentId())
      .limit(PAGE);
    if (cursor) {
      query = query.startAfter(cursor);
    }
    const snap = await query.get();
    if (snap.empty) {
      break;
    }
    for (const doc of snap.docs) {
      const data = doc.data() as { employeeId?: string; punchedAt?: Timestamp };
      scanned++;
      if (!data.employeeId || !data.punchedAt) {
        console.warn(`  ! skipping malformed punch ${doc.id}`);
        continue;
      }
      const date = localDateOf(data.punchedAt.toDate(), timezone);
      const key = `${data.employeeId}|${date}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ employeeId: data.employeeId, date });
      }
    }
    cursor = snap.docs[snap.docs.length - 1].id;
    if (snap.size < PAGE) {
      break;
    }
  }

  console.log(`  scanned ${scanned} punches → ${out.length} distinct days`);
  return out;
}

/** Which of [days] have no attendanceDays document yet. */
async function missingOnly(cid: string, days: DayKey[]): Promise<DayKey[]> {
  const missing: DayKey[] = [];
  const CHUNK = 200; // getAll takes a bounded number of refs at a time
  for (let i = 0; i < days.length; i += CHUNK) {
    const slice = days.slice(i, i + CHUNK);
    const refs = slice.map((d) =>
      tenant(cid, "attendanceDays").doc(`${d.employeeId}_${d.date}`),
    );
    const snaps = await db.getAll(...refs);
    snaps.forEach((snap, idx) => {
      if (!snap.exists) {
        missing.push(slice[idx]);
      }
    });
  }
  return missing;
}

/** Runs [work] over [items] with at most [limit] in flight. */
async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) {
        return;
      }
      await work(items[index]);
    }
  });
  await Promise.all(runners);
}

async function backfillCompany(cid: string, options: Options): Promise<number> {
  const settings = await getSettings(cid);
  const timezone = settings.profile.timezone;
  console.log(`\n=== ${cid}  (timezone ${timezone})`);

  let days = await daysWithPunches(cid, timezone);

  if (options.from) {
    days = days.filter((d) => d.date >= options.from!);
  }
  if (options.to) {
    days = days.filter((d) => d.date <= options.to!);
  }
  if (options.from || options.to) {
    console.log(`  ${days.length} within the requested date range`);
  }

  const targets = options.all ? days : await missingOnly(cid, days);
  if (!options.all) {
    console.log(`  ${targets.length} missing a projection`);
  }
  if (targets.length === 0) {
    console.log("  nothing to do");
    return 0;
  }

  // Oldest first, so a partial run leaves a contiguous repaired history.
  targets.sort((a, b) => a.date.localeCompare(b.date));

  if (!options.apply) {
    for (const d of targets.slice(0, 10)) {
      console.log(`  would rebuild ${d.date}  ${d.employeeId}`);
    }
    if (targets.length > 10) {
      console.log(`  … and ${targets.length - 10} more`);
    }
    return 0;
  }

  let done = 0;
  let failed = 0;
  await pool(targets, options.concurrency, async (d) => {
    try {
      await recomputeAttendanceDay(cid, d.employeeId, d.date, timezone);
      done++;
      if (done % 50 === 0) {
        console.log(`  rebuilt ${done}/${targets.length}`);
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ ${d.date} ${d.employeeId}: ${(e as Error).message}`);
    }
  });
  console.log(`  rebuilt ${done}, failed ${failed}`);
  return failed;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const project =
    process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? "(default)";

  console.log(`Attendance backfill — project ${project}`);
  console.log(options.apply ? "MODE: APPLY (writes)" : "MODE: dry run (no writes)");
  if (options.all) {
    console.log("Recomputing existing days as well as missing ones.");
  }

  const companyIds = options.company
    ? [options.company]
    : (await db.collection("companies").select().get()).docs.map((d) => d.id);

  if (companyIds.length === 0) {
    console.log("No companies found — check the project and credentials.");
    return;
  }

  let failed = 0;
  for (const cid of companyIds) {
    failed += await backfillCompany(cid, options);
  }

  if (!options.apply) {
    console.log("\nDry run only. Re-run with --apply to write.");
  }
  if (failed > 0) {
    console.error(`\n${failed} day(s) failed to rebuild.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
