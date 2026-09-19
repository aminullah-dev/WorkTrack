# WorkTrack — project guide for Claude Code

WorkTrack is a multi-tenant workforce platform for Afghanistan: attendance
(GPS, QR kiosk, face check), shifts, leave, payroll, projects and piece work.
Dari is the default language, with Pashto and English; dates are Solar Hijri
with Afghan month names and the weekend is Friday.

---

## Working method

Work to this standard. It is not a style preference; each rule exists because
skipping it has produced a real, shipped defect.

**Verify against the running system, not the documentation.** Docs and READMEs
are claims. A test run, a CLI query, and the source are evidence. Before
repeating any claim — in code, in a commit message, or to the user — check it.
Say which check you ran.

**Source is not state.** A config file, a migration, an index definition or a
rules file changes nothing until it is applied. If you say something is fixed
*in production*, prove it against production, not against the file you edited.

**A test you have not seen fail proves nothing.** After writing a test, break
the code it covers, confirm it goes red, restore it. If the mutation does not
reproduce the failure, say so plainly instead of implying the fix is proven.

**Never merge, deploy or close on a failing check.** A red build is a finding.
Investigate it before retrying it.

**Before anything destructive or outward-facing, prove it is safe first.** Diff
what is live against what you are about to apply. Confirm a deploy is additive
if you believe it is additive. Confirm a production build points at production.
State the check and its result, then act.

**Report what you did not do.** Name the parts that are unverified, deferred,
blocked, or impossible from where you are. A summary that lists only successes
is not a summary.

**Correct yourself in one sentence.** No apology, no post-mortem, no
re-litigating. State the correction and continue.

**Invent no numbers, names, quotes or capabilities.** This matters most outside
code — in documentation, marketing copy, and status reports. If a figure did not
come from a file, a query or a test run, it does not go in. Never claim
customers, adoption or results that do not exist.

**Check that a thing exists before pointing someone at it.** Open the link, run
the command, hit the endpoint. Do not send anyone to a page, credential or flow
you have not confirmed works.

**Attack your own work.** After a fix, especially a security fix, try to break
it. Assume your own change introduced a regression and go looking for it
specifically.

**Clean up, and own the mess you make.** Stop what you started, delete temporary
credentials, remove duplicated output. If you break something while cleaning up,
catch it and fix it in the same breath rather than leaving it for later.

**Follow the repository's existing conventions over any external standard.**
Where a general guideline and the codebase disagree, surface the conflict
instead of silently picking one.

**Ask only when the answer changes what you would build.** Routine judgement
calls are yours to make — state the assumption and proceed. Reserve a blocking
question for the case where proceeding either way would be unsafe or waste the
work.

---

## Repository layout

- `backend/functions/` — the REST API v1 (TypeScript, Express on Cloud
  Functions v2, Node 22, `us-central1`). One HTTPS function, `api`, plus
  scheduled jobs. Firestore rules are deny-all: every read and write goes
  through this API, which enforces tenant isolation and RBAC.
- `web/` — the manager portal (React + Vite + react-query) and, in
  `web/public/landing/`, the public landing page. The vendor console
  (`web/src/pages/VendorConsole.tsx`) is Linumic's own screen: English, LTR, no
  i18n, and never mounted for a tenant.
- `app/`, `core/*`, `feature/*` — the Android app (Kotlin, Compose, Gradle
  modules listed in `settings.gradle.kts`).
- `ios/` — the iOS app (SwiftUI, XcodeGen from `ios/project.yml`).
- `docs/` — the numbered guides; `docs/13-operations-runbook.md` and
  `docs/18-plans-and-payments.md` are the ones to read before touching
  production.

## Commands

```bash
# backend — from backend/functions
npm run typecheck                 # tsc --noEmit
npm test                          # unit tests only (integration ones self-skip)
npm run test:integration          # emulator + the whole suite
# portal — from web
npm run build                     # THE typecheck: bare tsc misses broken code
npm test
```

Deploys are `firebase deploy --only <targets> --project worktrack-prod`. Indexes
go out before the data that needs them, and an index is not ready when the
deploy returns — queries 500 until it finishes building.

## Conventions that bite if ignored

- **Responses** are `{ data }` (plus `{ meta }` where paged); errors are RFC 7807
  problem+json built from `ApiError` with a code from `ErrorCodes`
  (`lib/errors.ts`). The Android client mirrors those codes — adding one is
  fine, renaming one is not.
- **Tenant data** lives under `companies/{cid}/…` via `tenant(cid, collection)`,
  and `TenantCollection` is a closed union: a new subcollection has to be added
  there. `audit()` never throws and never blocks the operation it records.
- **Validation** is zod through `parseBody` / `parsePayload`; route-level RBAC is
  `requirePermission("resource:action")`, deny-by-default, with `"*"` for
  COMPANY_ADMIN and SUPER_ADMIN.
- **Licences are granted, never self-assigned.** There is no tenant endpoint that
  writes one. The vendor issues them (console or `scripts/set-license.ts`); the
  only self-serve path is paying for a plan, which may raise the plan and extend
  the expiry and nothing else. See `docs/18-plans-and-payments.md`.
- **Plan gating asks for a capability, never for a tier** (`services/plans.ts`,
  `middleware/plan.ts`). `if (plan === "GOLD")` anywhere is a bug. Both
  enforcement switches (`enforceDevices`, `enforcePlan`) default to off, so a
  company is only ever metered deliberately.
- **Tests** are vitest with `fileParallelism: false` (a correctness requirement,
  not a preference). `*.integration.test.ts` files skip themselves unless
  `FIRESTORE_EMULATOR_HOST` is set, and seed a fresh tenant id per test.
- **Portal strings** live in three flat dictionaries in `web/src/i18n/strings.ts`
  (fa/ps/en, Dari default). `keysUsed.test.ts` fails the build if a literal
  `t("key")` is missing from any language. Wrap every rendered number in `num()`
  so Dari and Pashto get ۰–۹, and mark ids, dates and versions `dir="ltr"`.
- **Marketing and store copy** are Dari and Pashto only; English is for the API,
  the code and the app stores.
