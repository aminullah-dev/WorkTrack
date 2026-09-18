/*
 * Issues a licence to a company. This is the vendor's tool — the thing that
 * turns a paid invoice into a working, limited installation.
 *
 * Why it is a script and not an endpoint: a licence is granted, never
 * self-assigned. There is deliberately no PUT /v1/devices/license (see
 * routes/devices.ts) — inside a tenant, COMPANY_ADMIN holds "*", so any such
 * endpoint would have let a customer set their own seat count and clear their
 * own expiry. Writing one requires credentials for the Firebase project
 * itself, which only the vendor has.
 *
 * A customer CAN change their own plan by paying for it (services/billing.ts),
 * and that path is narrow on purpose: it may only move the plan and the expiry,
 * and it never lowers a seat count or a cap granted here.
 *
 * Usage (from backend/functions, after `npm run build`):
 *
 *   # Always start here — prints what would change and writes nothing.
 *   GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
 *     --company COMPANY_ID --plan SILVER --seats 25 --expires 2027-03-20
 *
 *   # Apply it
 *   ... --apply
 *
 *   # Read back what a company holds today
 *   GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
 *     --company COMPANY_ID --show
 *
 * Credentials come from Application Default Credentials; run
 * `gcloud auth application-default login` first, or point
 * GOOGLE_APPLICATION_CREDENTIALS at a service-account key. Claude never
 * handles that key.
 *
 * Options:
 *   --company <id>      Required. The company id (visible in the portal's
 *                       Devices page, and printed by --list).
 *   --plan <p>          TRIAL | BRONZE | SILVER | GOLD. Default: keep current.
 *                       (FREE/STANDARD/ENTERPRISE still work; they map to
 *                       BRONZE/SILVER/GOLD.)
 *   --seats <n>         Device seats granted. Default: keep current.
 *   --expires <date>    YYYY-MM-DD (Gregorian), or "never". Default: keep.
 *   --status <s>        ACTIVE | SUSPENDED | EXPIRED. Default: ACTIVE.
 *   --enforce / --no-enforce
 *                       Whether the seat limit actually refuses devices.
 *                       Default on a new licence: --enforce.
 *   --meter / --no-meter
 *                       Whether the PLAN is enforced: the capabilities it
 *                       includes and the headcount it covers. Off on every
 *                       company licensed before the plans existed, which is
 *                       what keeps them working unchanged.
 *   --employees <n>     A headcount cap for this one company, overriding the
 *                       plan's own. "plan" restores the plan's number.
 *   --list              List every company with its licence, then exit.
 *   --show              Print this company's licence, then exit.
 *   --apply             Actually write. Without it, nothing is written.
 */

import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";

interface License {
  plan: string;
  deviceLimit: number;
  status: string;
  expiresAt: string | null;
  enforceDevices: boolean;
  /** Whether the plan's capabilities and headcount are enforced. */
  enforcePlan?: boolean;
  /** A headcount negotiated for this company; null means the plan's own. */
  employeeLimit?: number | null;
}

const DEFAULTS: License = {
  plan: "BRONZE",
  deviceLimit: 5,
  status: "ACTIVE",
  expiresAt: null,
  enforceDevices: false,
};

const PLANS = ["TRIAL", "BRONZE", "SILVER", "GOLD"];
/** What a licence issued before the plans were sold is read as. */
const LEGACY_PLANS: Record<string, string> = {
  FREE: "BRONZE",
  STANDARD: "SILVER",
  ENTERPRISE: "GOLD",
};
const STATUSES = ["ACTIVE", "SUSPENDED", "EXPIRED"];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function describe(l: License): string {
  return [
    `plan=${l.plan}`,
    `seats=${l.deviceLimit}`,
    `status=${l.status}`,
    `expires=${l.expiresAt ?? "never"}`,
    `seatsEnforced=${l.enforceDevices ? "yes" : "no"}`,
    `planEnforced=${l.enforcePlan ? "yes" : "no"}`,
    `employees=${l.employeeLimit ?? "plan"}`,
  ].join("  ");
}

async function main(): Promise<void> {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
  if (!projectId) {
    fail("Set GOOGLE_CLOUD_PROJECT to the Firebase project, e.g. worktrack-prod");
  }

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  const db = getFirestore();

  console.log(`\n  project: ${projectId}\n`);

  if (flag("list")) {
    const snap = await db.collection("companies").get();
    if (snap.empty) {
      console.log("  (no companies)\n");
      return;
    }
    for (const doc of snap.docs) {
      const d = doc.data();
      const l: License = { ...DEFAULTS, ...(d.license ?? {}) };
      const name = (d.name as string) ?? "(unnamed)";
      console.log(`  ${doc.id}`);
      console.log(`    ${name}`);
      console.log(`    ${describe(l)}\n`);
    }
    return;
  }

  const cid = arg("company");
  if (!cid) fail("--company <id> is required (or use --list)");

  const ref = db.collection("companies").doc(cid);
  const snap = await ref.get();
  if (!snap.exists) fail(`No company "${cid}" in ${projectId}`);

  const data = snap.data() ?? {};
  const current: License = { ...DEFAULTS, ...(data.license ?? {}) };
  console.log(`  company: ${cid}  (${(data.name as string) ?? "unnamed"})`);
  console.log(`  now:     ${describe(current)}`);

  if (flag("show")) {
    console.log();
    return;
  }

  // Anything not given keeps its current value, so a renewal is one flag.
  const next: License = { ...current };

  const plan = arg("plan");
  if (plan) {
    const named = LEGACY_PLANS[plan.toUpperCase()] ?? plan.toUpperCase();
    if (!PLANS.includes(named)) fail(`--plan must be one of ${PLANS.join(", ")}`);
    next.plan = named;
  }

  const seats = arg("seats");
  if (seats) {
    const n = Number(seats);
    if (!Number.isInteger(n) || n < 1 || n > 100_000) {
      fail("--seats must be a whole number from 1 to 100000");
    }
    next.deviceLimit = n;
  }

  const expires = arg("expires");
  if (expires) {
    if (expires === "never") {
      next.expiresAt = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
      fail('--expires must be YYYY-MM-DD (Gregorian) or "never"');
    } else if (Number.isNaN(Date.parse(`${expires}T00:00:00Z`))) {
      fail(`--expires "${expires}" is not a real date`);
    } else {
      next.expiresAt = expires;
    }
  }

  const status = arg("status");
  if (status) {
    if (!STATUSES.includes(status)) {
      fail(`--status must be one of ${STATUSES.join(", ")}`);
    }
    next.status = status;
  } else if (!data.license) {
    next.status = "ACTIVE";
  }

  if (flag("enforce") && flag("no-enforce")) {
    fail("Pass either --enforce or --no-enforce, not both");
  }
  if (flag("enforce")) next.enforceDevices = true;
  if (flag("no-enforce")) next.enforceDevices = false;

  if (flag("meter") && flag("no-meter")) {
    fail("Pass either --meter or --no-meter, not both");
  }
  if (flag("meter")) next.enforcePlan = true;
  if (flag("no-meter")) next.enforcePlan = false;

  const employees = arg("employees");
  if (employees) {
    if (employees === "plan") {
      next.employeeLimit = null;
    } else {
      const n = Number(employees);
      if (!Number.isInteger(n) || n < 1 || n > 100_000) {
        fail('--employees must be a whole number from 1 to 100000, or "plan"');
      }
      next.employeeLimit = n;
    }
  }

  console.log(`  next:    ${describe(next)}`);

  if (JSON.stringify(next) === JSON.stringify(current)) {
    console.log("\n  Nothing would change.\n");
    return;
  }

  // Seats are what the customer paid for; shrinking them below what is already
  // in use does not un-register anyone, it just refuses the next activation.
  // Say so rather than letting the vendor discover it from a support call.
  if (next.deviceLimit < current.deviceLimit) {
    const devices = await db.collection(`companies/${cid}/devices`).get();
    const active = devices.docs.filter((d) => {
      const v = d.data();
      return (v.status ?? (v.active ? "ACTIVE" : "REVOKED")) === "ACTIVE";
    }).length;
    if (active > next.deviceLimit) {
      console.log(
        `\n  ! ${active} devices are registered but the new licence grants ${next.deviceLimit}.`,
      );
      console.log(
        "    Registered devices keep working; the next new one is refused.",
      );
      console.log("    Revoke the retired devices in the portal to tidy the count.");
    }
  }

  if (!flag("apply")) {
    console.log("\n  Dry run — nothing written. Re-run with --apply.\n");
    return;
  }

  await ref.set({ license: next }, { merge: true });
  console.log("\n  ✓ Licence written.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
