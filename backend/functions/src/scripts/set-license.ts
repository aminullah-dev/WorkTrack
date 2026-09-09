/*
 * Issues a licence to a company. This is the vendor's tool — the thing that
 * turns a paid invoice into a working, limited installation.
 *
 * Why it is a script and not an endpoint: the licence is what the customer
 * buys, so it must not be something they can grant themselves. There is
 * deliberately no PUT /v1/devices/license (see routes/devices.ts) — inside a
 * tenant, COMPANY_ADMIN holds "*", so any such endpoint would have let a
 * customer set their own seat count and clear their own expiry. Writing a
 * licence requires credentials for the Firebase project itself, which only the
 * vendor has.
 *
 * Usage (from backend/functions, after `npm run build`):
 *
 *   # Always start here — prints what would change and writes nothing.
 *   GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
 *     --company COMPANY_ID --plan STANDARD --seats 25 --expires 2027-03-20
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
 *   --plan <p>          FREE | STANDARD | ENTERPRISE. Default: keep current.
 *   --seats <n>         Device seats granted. Default: keep current.
 *   --expires <date>    YYYY-MM-DD (Gregorian), or "never". Default: keep.
 *   --status <s>        ACTIVE | SUSPENDED | EXPIRED. Default: ACTIVE.
 *   --enforce / --no-enforce
 *                       Whether the seat limit actually refuses devices.
 *                       Default on a new licence: --enforce.
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
}

const DEFAULTS: License = {
  plan: "FREE",
  deviceLimit: 5,
  status: "ACTIVE",
  expiresAt: null,
  enforceDevices: false,
};

const PLANS = ["FREE", "STANDARD", "ENTERPRISE"];
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
    `enforced=${l.enforceDevices ? "yes" : "no"}`,
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
    if (!PLANS.includes(plan)) fail(`--plan must be one of ${PLANS.join(", ")}`);
    next.plan = plan;
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
