/*
 * Grants (or revokes) vendor access — Linumic staff, not any customer.
 *
 * A vendor account can read every company and write any licence, so the claim
 * that marks one must be unobtainable through the product. It is: no signup,
 * invite or employee route writes custom claims at all, and this script needs
 * credentials for the Firebase project itself.
 *
 * The account must already exist. Create it in the Firebase console — Claude
 * does not create accounts or handle passwords — then run this against it.
 *
 * Usage (from backend/functions, after `npm run build`):
 *
 *   # Always start here: prints what would change, writes nothing.
 *   GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/grant-vendor.js \
 *     --email you@linumic.com
 *
 *   # Grant
 *   ... --email you@linumic.com --apply
 *
 *   # Take it away
 *   ... --email someone@linumic.com --revoke --apply
 *
 *   # Who has it
 *   ... --list
 *
 * Credentials come from Application Default Credentials; run
 * `gcloud auth application-default login` first.
 *
 * After a grant the person must sign out and back in: custom claims reach the
 * client in a fresh ID token, not the one already in their browser.
 */

import { getAuth } from "firebase-admin/auth";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";

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

async function main(): Promise<void> {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
  if (!projectId) {
    fail("Set GOOGLE_CLOUD_PROJECT to the Firebase project, e.g. worktrack-prod");
  }
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  const auth = getAuth();

  console.log(`\n  project: ${projectId}\n`);

  if (flag("list")) {
    // Small staff list; one page is plenty and paging every user of the project
    // to find them would be wasteful.
    const page = await auth.listUsers(1000);
    const staff = page.users.filter((u) => u.customClaims?.vendor === true);
    if (!staff.length) {
      console.log("  Nobody has vendor access.\n");
      return;
    }
    for (const u of staff) {
      console.log(`  ${u.email ?? u.uid}`);
      console.log(`    uid ${u.uid}   email verified: ${u.emailVerified ? "yes" : "NO"}\n`);
    }
    return;
  }

  const email = arg("email");
  if (!email) fail("--email is required (or use --list)");

  const user = await auth.getUserByEmail(email).catch(() => null);
  if (!user) {
    fail(
      `No account for ${email} in ${projectId}.\n` +
        "    Create it in the Firebase console first — Authentication → Users → Add user.",
    );
  }

  const claims = user.customClaims ?? {};
  const revoking = flag("revoke");

  // A vendor identity must carry no tenant claims. One that did could act on a
  // company through the ordinary routes while also holding cross-tenant
  // authority — and middleware/vendor.ts refuses such a token anyway, so
  // granting it here would produce an account that simply does not work.
  if (!revoking && (claims.cid || claims.eid)) {
    fail(
      `${email} is an employee of company ${claims.cid}.\n` +
        "    A vendor account must not belong to any customer. Use a separate\n" +
        "    address for staff access.",
    );
  }

  if (!revoking && !user.emailVerified) {
    console.log(
      `  ! ${email} has not verified its address. The claim can be set now, but\n` +
        "    the console will refuse the token until it is verified.\n",
    );
  }

  const has = claims.vendor === true;
  console.log(`  account: ${email}`);
  console.log(`  now:     vendor access ${has ? "GRANTED" : "not granted"}`);
  console.log(`  next:    vendor access ${revoking ? "not granted" : "GRANTED"}`);

  if (has === !revoking) {
    console.log("\n  Nothing would change.\n");
    return;
  }

  if (!flag("apply")) {
    console.log("\n  Dry run — nothing written. Re-run with --apply.\n");
    return;
  }

  const next = { ...claims };
  if (revoking) delete next.vendor;
  else next.vendor = true;
  await auth.setCustomUserClaims(user.uid, next);

  // Existing ID tokens keep working for up to an hour; revoking must bite now.
  if (revoking) {
    await auth.revokeRefreshTokens(user.uid);
    console.log("\n  ✓ Vendor access removed, and existing sessions revoked.\n");
  } else {
    console.log("\n  ✓ Vendor access granted. Sign out and back in to pick it up.\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
