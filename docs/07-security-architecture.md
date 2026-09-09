# WorkTrack — Security Architecture

Version: 1.0 · Status: Approved · Derives from: `00-master-spec.md` (§2.1, §5, §7) · Companions: `05-android-architecture.md`, `06-web-admin-design.md`, `08-sync-strategy.md`

**Purpose.** This document is the platform security specification for WorkTrack: the threat model, identity and custom-claims design on Firebase Auth, the deny-by-default authorization chain and full permission catalog, the Firestore security-rules strategy, the attendance anti-fraud stack (device binding, Play Integrity, kiosk TOTP, face verification) with its biometric privacy posture, data protection and compliance controls (PII classification, GDPR, SOC 2 mapping), and the secure development lifecycle. Every control here is normative for backend, Android, and web implementations; exceptions require a documented risk acceptance signed by the security owner.

---

## 1. Security objectives and trust boundaries

Objectives, in priority order: (1) **tenant isolation** — no data or action ever crosses a `companyId` boundary; (2) **payroll and attendance integrity** — money-bearing records cannot be forged, replayed, or silently altered; (3) **PII/biometric confidentiality**; (4) **accountability** — every privileged mutation is attributable and immutable in audit.

Trust boundaries: mobile devices and browsers are **untrusted** (they propose, never decide — master spec §3); Cloud Functions API is the sole trusted policy-enforcement point; Firestore is reachable by clients only through security rules that treat the API as the writer of record (§5); kiosk devices are semi-trusted terminals holding a device-scoped `KIOSK` identity and no employee data.

## 2. Threat model (STRIDE)

| # | Threat | STRIDE | Vector | Impact | Mitigations (normative) |
|---|---|---|---|---|---|
| T1 | Spoofed GPS punch | Spoofing | Mock-location app, rooted device, GPS simulator fakes an in-fence punch | Wage fraud | Play Integrity verdict on punch (§6.2); `isMock` flag captured per fix (§6.3); server geofence re-validation from raw lat/lng; speed-of-travel plausibility (§6.4); punches flagged not silently dropped → exceptions queue |
| T2 | Face photo/video replay | Spoofing | Photo of an employee shown to camera for face punch | Buddy punching | On-device liveness (ML Kit) before embedding; server-side match threshold tunable (§6.6); face punch bound to bound device + integrity token; anomaly review queue |
| T3 | Token theft | Spoofing / Elevation | Stolen Firebase ID/refresh token from device backup, malware, or network | Account takeover | Short-lived ID tokens (≤ 1 h); refresh token bound to Firebase installation; tokens stored only in Keystore-backed EncryptedSharedPreferences (§7.2); TLS 1.2+ everywhere; punch endpoints additionally require bound `deviceId` + integrity token, so a bare token cannot punch (§6.1); revocation flow (§3.4) |
| T4 | Tenant isolation breach | Info disclosure / Tampering | Crafted `companyId` in URL/body differing from token; IDOR on ULIDs | Cross-company data leak | Tenant resolved **only** from verified claims; URL/body `companyId` must equal `cid` or 403 (master spec §2.1); every Firestore access path is `companies/{cid}/…` derived from claims; no cross-tenant queries exist in the API; ULIDs are non-guessable but never relied on as secrets |
| T5 | Privilege escalation | Elevation | Client-forged role list; role changed via unprotected endpoint; stale claims after demotion | Unauthorized admin actions | Roles live in custom claims set only by backend admin SDK on `RoleAssignment` change (§3.3); deny-by-default RBAC middleware (§4); claims revocation + `auth_time`/`iat` check against `claimsUpdatedAt` for sensitive scopes; role management itself requires `role:assign` and is audited |
| T6 | Kiosk token replay | Spoofing / Replay | Screenshot/relay of kiosk QR used later or from elsewhere | Remote buddy punching | TOTP QR: 30 s window, HMAC-signed over (kioskId, timeStep) with per-kiosk secret (§6.5); server accepts current ±1 step once — **single-use enforcement** via consumed-token cache keyed (kioskId, timeStep, employeeId); kiosk branch must match employee branch; kiosk secret rotation |
| T7 | Insider payroll fraud | Tampering / Repudiation | PAYROLL_ADMIN inflates a salary, edits a closed run, or approves own run | Financial loss | Segregation of duties: `payroll:approve` requires approver ≠ `startedBy` (server-enforced); runs immutable after `lockedAt`; salary changes require `salary:write` + audit with before/after; approve step requires recent re-authentication; variance alerts in review step (doc 06 §3.6); immutable audit log (§7.5) |
| T8 | Punch record tampering | Tampering | Client edits/deletes a synced punch to erase lateness | Attendance fraud | Punches are append-only at every layer: no update/delete API, Room exposes no update DAO, Firestore rules deny all client writes (§5); `AttendanceDay` is a server-computed projection clients cannot write |
| T9 | Sync replay / duplicate mutation | Tampering | Replayed `POST /sync/push` batch or duplicated outbox delivery | Double leave requests, duplicate punches | ULID `Idempotency-Key` per op, honored on all POSTs (master spec §5); idempotency store returns the original result for replays (doc 08 §4.2) |
| T10 | Audit log erasure | Repudiation | Compromised admin deletes audit trail | Untraceable fraud | `auditLogs` append-only: no update/delete in API or rules; BigQuery export as second copy (§7.5); AUDITOR role reads independently of COMPANY_ADMIN |
| T11 | PII exfiltration via logs/exports | Info disclosure | PII in application logs, over-broad exports | Privacy breach, GDPR exposure | Structured log redaction (§7.4); export endpoints permission-gated and audited; PII classification drives field-level handling (§7.3) |
| T12 | Denial of service on API | DoS | Credential-stuffing bursts, sync-push floods | Availability loss | Per-identity and per-IP rate limits at the API layer; sync batch caps + backpressure signals (doc 08 §4.4); Firebase Auth built-in abuse protection; Cloud Functions autoscaling with per-tenant quota guards |

Residual risks are tracked in the risk register with owners and review dates; T2 liveness bypass by sophisticated 3D masks is accepted-with-monitoring at P1 (compensating control: exceptions queue + device binding).

## 3. Identity

### 3.1 Authentication flows

- **Android**: Firebase Auth (email/password; SSO providers per tenant plan). SDK manages refresh; the app never touches raw refresh tokens. Post-auth, the session is not usable until device binding (`POST /devices`) succeeds (doc 05 §5.1).
- **Web Admin**: Firebase Auth Web SDK; console rejects sessions holding no admin role (doc 06 §2). Payroll approval and role management require **recent authentication** (re-auth if `auth_time` older than 15 min).
- **Kiosk**: provisioned by an admin; a device-scoped account holding only the `KIOSK` role and a kiosk registration; it can render QR tokens and nothing else — no employee reads, no punch submission (employees' apps submit punches).
- Password policy delegated to Firebase with enforced minimums (length ≥ 12, breach-list screening); email verification required before first API access; MFA (TOTP) available and mandatory for `COMPANY_ADMIN`/`PAYROLL_ADMIN` on Enterprise plan tenants.

### 3.2 Custom claims

Exactly as master spec §2.1:

```json
{ "cid": "01J8…COMPANY", "r": ["BRANCH_MANAGER", "EMPLOYEE"], "b": ["01J8…BR1", "01J8…BR2"], "eid": "01J8…EMP" }
```

- `cid` — tenant id; single company per credential (multi-company users hold separate credentials; the web company switcher re-authenticates).
- `r` — role codes (master spec §1.1), resolved to permission sets **server-side per request** so permission-set edits to custom roles apply without re-minting tokens.
- `b` — branch scope ids for branch-scoped roles; empty for company-wide roles.
- `eid` — employee id, binding the auth identity to the `Employee` row (`authUid` back-reference verified at claim-mint time).

Claims are minted exclusively by backend admin-SDK code paths triggered by `RoleAssignment` writes; no client input ever reaches claim values. Total claims payload kept < 1000 bytes (Firebase limit); large branch scopes (> ~30 branches) overflow to a server-side scope document referenced during tenant-context load, and `b` carries a sentinel `"*many"`.

### 3.3 Claim propagation on role change

1. Role mutation (`role:assign`) writes `RoleAssignment` and audit log in one transaction.
2. Firestore trigger recomputes the subject's claims, calls `setCustomUserClaims`, and stamps `claimsUpdatedAt` on the employee's auth metadata doc.
3. Old ID tokens (≤ 1 h) may still carry stale claims. Handling: **downgrade-sensitive** areas (payroll, role management, employee PII bulk read, audit export) compare token `iat` against `claimsUpdatedAt` and force refresh (401 `type: token-stale`) when older; ordinary endpoints tolerate the ≤ 1 h window because server-side permission resolution already reflects removed *permissions* for custom roles.
4. Demotion or exit additionally calls `revokeRefreshTokens(uid)`, capping staleness to the current ID token's remaining lifetime; `POST /employees/{id}/deactivate` does this plus device revocation.
5. Clients react to 401 `token-stale` with a silent `getIdToken(true)` and one retry.

### 3.4 Session and device revocation

- **Device revocation**: `DELETE /devices/{id}` sets `revokedAt`; punch and sync endpoints reject revoked `deviceId`s regardless of token validity; FCM token is invalidated. Surfaced in web (employee profile → Devices) and Android settings.
- **Session revocation**: `revokeRefreshTokens` on password reset, suspected compromise, exit, and admin "sign out everywhere". Middleware checks `auth_time` against revocation time on sensitive scopes.
- **Offboarding** (`status=EXITED`): disable Firebase user, revoke refresh tokens, revoke all devices, clear FCM tokens; audit entry `employee:deactivate` records the cascade.

## 4. Authorization

### 4.1 Middleware chain (deny-by-default)

Every `/v1` route passes the full chain (master spec §7); a route missing an explicit permission declaration fails closed at startup (route-table lint).

```
verifyToken            → validate Firebase ID token signature/expiry/audience; extract claims
tenantContext          → resolve cid; assert URL companyId (if present) === cid; load company status (suspended tenant → 403); hydrate role→permission sets; resolve overflow branch scope
requirePermission(p)   → assert p ∈ resolved permissions, else 403 problem+json `permission-denied` (no existence leaks: scope-mismatched resource reads return 404)
scopeNarrowing         → inject mandatory filters from claims (branch scope, self scope) into the handler's query context (§4.3)
handler                → business logic; every privileged mutation writes AuditLog in the same transaction
```

### 4.2 Permission catalog

Permissions are `resource:action` strings (master spec §1.1). The catalog below is exhaustive for API v1; roles are bundles of these (built-in bundles listed in §4.4).

| API area (master spec §5) | Endpoint(s) | Permission |
|---|---|---|
| Session | `GET /me` | *(any authenticated tenant member)* |
| Session | `POST /devices` | `device:bind` |
| Session | `DELETE /devices/{id}` | `device:revoke` (self) / `device:manage` (others) |
| Org | `GET /branches`, `/departments`, `/positions` | `org:read` |
| Org | create/update/delete branches, departments, positions | `org:write` |
| Org | `GET /employees`, `GET /employees/{id}` | `employee:read` (self always permitted for own record) |
| Org | `POST/PUT /employees` | `employee:create` / `employee:write` |
| Org | `POST /employees/{id}/deactivate` | `employee:deactivate` |
| Attendance | `POST /attendance/punches` | `attendance:punch` (self only, ever) |
| Attendance | `GET /attendance/punches`, `GET /attendance/days` | `attendance:read-self` / `attendance:read` (others) |
| Attendance | `POST /attendance/regularizations` | `attendance:regularize` (self) |
| Attendance | `POST /attendance/regularizations/{id}/decide` | `attendance:approve` |
| Shifts | `GET /shifts` | `shift:read` |
| Shifts | shift CRUD | `shift:write` |
| Shifts | `GET /rosters` | `roster:read` |
| Shifts | `PUT /rosters` | `roster:write` |
| Shifts | `POST /shift-swaps` | `shift-swap:request` (self) |
| Shifts | `POST /shift-swaps/{id}/decide` | `shift-swap:decide` |
| Leave | `GET /leave/types` | `leave:read-types` (all members) |
| Leave | `GET /leave/balances` | `leave:read-balance-self` / `leave:read-balance` (others) |
| Leave | `POST /leave/requests`, `POST /leave/requests/{id}/cancel` | `leave:request` (self) |
| Leave | `GET /leave/requests` | `leave:read-self` / `leave:read` (others) |
| Leave | `POST /leave/requests/{id}/decide` | `leave:approve` |
| Payroll | `GET /payroll/runs` | `payroll:read` |
| Payroll | `POST /payroll/runs` | `payroll:run` |
| Payroll | `POST /payroll/runs/{id}/approve` | `payroll:approve` (approver ≠ starter, enforced in handler) |
| Payroll | `GET /payslips?employeeId&year`, `GET /payslips/{id}` | `payroll:read-self` (own) / `payroll:read` (others) |
| Payroll | salary structures/components/employee salaries | `salary:read` / `salary:write` |
| Comms | `GET /announcements`, `GET /notifications`, `POST /notifications/{id}/read` | *(any member; audience-filtered)* |
| Comms | `POST /announcements` | `announcement:publish` |
| Analytics | `GET /analytics/kpis`, `GET /analytics/insights` | `analytics:read` (scope-narrowed) |
| Audit | `GET /audit-logs` | `audit:read` |
| Sync | `POST /sync/push`, `GET /sync/pull` | *(any member; every batched op re-checked against the op's own permission — sync grants nothing by itself, doc 08 §4)* |
| Documents | employee document read/upload/verify | `document:read-self` / `document:read` / `document:write` / `document:verify` |
| Roles | role & assignment management | `role:read` / `role:assign` |

### 4.3 Scope narrowing

Holding a permission is necessary, not sufficient; the effective scope is intersected with claims:

- **Branch scope**: for sessions whose granting role has `scopeType=BRANCH`, `tenantContext` injects `branchId ∈ b` as a mandatory filter on every list/read and validates it on every mutation target (e.g. a `BRANCH_MANAGER` with `roster:write` can `PUT /rosters` only for `branchId ∈ b`; `leave:approve` only where the requester's `branchId ∈ b`).
- **Self scope**: `*-self` permissions resolve the target to `eid`; a request naming another employeeId under a self-only permission is 403.
- **Department scope** (`scopeType=DEPARTMENT`) narrows analogously for TEAM_LEAD.
- Narrowing is implemented as query-context injection, not handler discipline: handlers physically cannot issue an unscoped Firestore query because the tenant-context repository prefixes `companies/{cid}` and appends scope filters centrally.

### 4.4 Built-in role bundles (summary)

`EMPLOYEE`: all `*-self` + `attendance:punch`, `leave:request`, `shift-swap:request`, `device:bind/revoke(self)`, `org:read`, `shift:read`, `leave:read-types`. `TEAM_LEAD`: EMPLOYEE + dept-scoped `attendance:read`, `leave:read`, `leave:approve`, `attendance:approve`, `analytics:read`. `BRANCH_MANAGER`: TEAM_LEAD at branch scope + `roster:read/write`, `shift-swap:decide`, `employee:read`, `announcement:publish` (branch audience). `HR_ADMIN`: company-scoped org/employee/attendance/leave/document/announcement full set + `payroll:read` (no `payroll:approve`, no `salary:write` unless granted). `PAYROLL_ADMIN`: `payroll:*`, `salary:*`, `employee:read`, `attendance:read`, `leave:read`, `audit:read` (payroll resources). `COMPANY_ADMIN`: everything except cross-tenant. `AUDITOR`: every `*:read` + `audit:read`, zero write permissions. `KIOSK`: none (kiosk token flow only). `SUPER_ADMIN`: internal ops plane, out of tenant catalog.

## 5. Firestore security rules strategy

Principle (master spec §7): **the API is the only writer**; rules are defense-in-depth, not the primary policy engine.

- **No client writes, anywhere**: `allow write: if false` on every collection under `companies/{cid}`. All mutations flow through Cloud Functions using the Admin SDK (which bypasses rules); therefore any rule-permitted client write path would be a bug — there are none. This covers T8 (punch tampering) and keeps balances/attendanceDays/payslips server-authoritative.
- **Reads, deny-by-default with narrow self-service allowances** for SDK-based reads that exist today (FCM-driven badge counts; future listeners): a client may read only documents belonging to its own employee — `notifications` where `resource.data.employeeId == token.eid`, `announcements` where the audience matches, own `employees/{eid}` profile doc. Every allowance also asserts `request.auth.token.cid == cid` (path tenant match). All other collections — `punches`, `attendanceDays`, `leaveBalances`, `leaveRequests`, `payrollRuns`, `payslips`, `employeeSalaries`, `auditLogs`, `devices`, `roleAssignments`, everything in §4.6 of the master spec — are `read: if false` to clients; the app reads them through `/v1` + sync, never through the SDK.
- **Rules mirror claims, never documents**: rules reference only `request.auth.token` (cid/eid) — no `get()` lookups, keeping rules O(1), non-bypassable via doc tampering, and cheap.
- **Storage rules** (Cloud Storage): payslip PDFs and documents are served via short-lived signed URLs minted by the API after a permission check; face-template objects have no client-readable path at all.
- Rules are code-reviewed like API code, covered by the Firestore rules emulator test suite (allow/deny matrix per collection × persona), and deployed atomically with functions.

Normative shape (excerpt — the checked-in `firestore.rules` is generated from this pattern):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Global default: nothing is readable or writable.
    match /{document=**} { allow read, write: if false; }

    match /companies/{cid} {
      function sameTenant() { return request.auth != null && request.auth.token.cid == cid; }
      function isSelf(eid)  { return sameTenant() && request.auth.token.eid == eid; }

      // Narrow self-service read allowances only; zero client writes anywhere.
      match /employees/{eid}        { allow read: if isSelf(eid); }
      match /notifications/{nid}    { allow read: if sameTenant()
                                        && resource.data.employeeId == request.auth.token.eid; }
      match /announcements/{aid}    { allow read: if sameTenant(); } // audience refined server-side
      // punches, attendanceDays, leaveBalances, leaveRequests, payrollRuns, payslips,
      // employeeSalaries, auditLogs, devices, roleAssignments, …: no match block ⇒ denied.
    }
  }
}
```

## 6. Attendance anti-fraud stack

Layered: each control is independently bypassable in theory; the stack plus review queues makes systematic fraud uneconomical. Signals **flag** (`serverValidated=false`, `invalidReason`) rather than drop — no silent data loss, and honest edge cases (poor GPS) stay recoverable via regularization.

### 6.1 Device binding

- One active `Device` per employee per platform (policy-tunable). `POST /devices` records platform, model, appVersion, FCM token, first integrity verdict; server issues the `deviceId` the client must present on every punch and sync push.
- Punch endpoints reject: unknown `deviceId`, revoked device, or `deviceId` bound to a different `eid` (mismatch is a high-severity audit event → T3, T6).
- Re-binding a new device auto-revokes the old one after a cool-down and notifies the employee (out-of-band fraud signal).

### 6.2 Play Integrity

- Standard-request tokens with server-issued nonces (doc 05 §7.2). Server decodes verdicts and applies tenant-tunable policy: `MEETS_DEVICE_INTEGRITY` required by default for punch acceptance; `MEETS_BASIC_INTEGRITY`-only → accept-but-flag; `MEETS_NO_INTEGRITY` / unlicensed → reject punch persistence as valid, record with `invalidReason=INTEGRITY_FAILED`.
- Verdict cached per device ≤ 15 min to bound API quota; latest verdict stored on `Device.integrityVerdict`.
- Unavailability (no Play services, API outage) degrades to accept-and-flag with `INTEGRITY_UNAVAILABLE` — availability failure must not lock out honest workforces (T1 residual accepted, exceptions queue compensates).

### 6.3 Mock-location detection

`isMock` per GPS fix travels with the punch payload. Server treats client flags as advisory (a compromised client lies): `isMock=true` → `invalidReason=MOCK_LOCATION`; absence of the flag proves nothing, hence §6.4.

### 6.4 Speed-of-travel plausibility

For each accepted GPS punch, server computes great-circle distance / elapsed time against the employee's previous located punch. Implied speed > threshold (default 900 km/h hard-fail; 150 km/h soft-flag, tunable) → `invalidReason=IMPLAUSIBLE_TRAVEL`. Accuracy radii are added to distance tolerance to avoid false positives; hard-fails still persist (append-only) but never auto-validate.

### 6.5 Kiosk TOTP QR

Per master spec §5: kiosk displays a rotating QR encoding `{kioskId, timeStep, sig}` where `sig = HMAC-SHA256(kioskSecret, kioskId ‖ timeStep)`; 30 s step. Employee app scans and submits `POST /attendance/punches {method: QR, kioskToken}`. Server verification, in order: kiosk exists/active → HMAC valid → timeStep ∈ {now−1, now, now+1} → **single-use**: `(kioskId, timeStep, employeeId)` unseen (consumed-token cache, TTL 120 s) → kiosk branch == employee branch → device binding + integrity as for GPS. Kiosk secrets: 256-bit, per kiosk, stored in Secret Manager, rotated 90 d or on suspicion; kiosk clock drift monitored via its token-refresh calls (drift > 1 step alerts ops). Screenshot relay within the 30 s window from a colleague *at the same branch* remains the residual (T6); single-use-per-employee plus device binding bounds it to self-punching in person-adjacent time, and face method (P1) closes it where required.

### 6.6 Face verification (P1)

- Enrollment: consented capture → on-device quality/liveness gate → embedding computed → embedding uploaded over TLS to Cloud Storage (CMEK-optional path per master spec §7); **raw capture deleted immediately after embedding extraction, on device and never stored server-side**.
- Verification punch: on-device liveness (ML Kit) → embedding → server compares against enrolled template; match threshold is **server-tunable per tenant** (`faceScore` recorded on the punch); below-threshold → `invalidReason=FACE_MISMATCH`, flagged not dropped.
- Thresholds calibrated against false-accept ≤ 0.1% at operating point; drift review quarterly.

### 6.7 Biometric privacy

- **Embeddings only** — no raw face images at rest anywhere (master spec §7). Embeddings are classified Restricted-Biometric (§7.3), encrypted at rest, access limited to the verification service path; not exportable via any API.
- **Consent**: explicit, per-employee, recorded (who/when/policy-version) before enrollment; refusal must leave a working alternative punch method (GPS/QR) — tenants enable face as optional or must document a lawful basis.
- **Deletion**: embedding deleted on consent withdrawal, employee exit (with retention respecting local law), and tenant offboarding; deletion is audited and propagates to backups per §7.6 crypto-shredding.
- **Regional law**: biometric features are tenant-configurable per jurisdiction. GDPR: biometric data = special category (Art. 9) — explicit consent + DPIA required, DPIA template shipped to tenants. US: Illinois BIPA-style statutes require written release, retention schedule, and prohibition on sale — the platform's written-consent flow and deletion schedule are designed to satisfy BIPA as the strictest baseline. Tenants operating where consent cannot be freely given in employment contexts (several EU DPAs' position) are steered to non-biometric methods; the platform never makes face the sole punch method.

## 7. Data protection

### 7.1 Encryption

- **Transit**: TLS 1.2+ (TLS 1.3 preferred) for all client↔API, API↔Firestore/Storage paths; HSTS on hosting; certificate pinning is deliberately **not** used on Android (operational risk > benefit given Play Integrity + token binding), documented as a risk decision.
- **At rest**: Google-managed encryption for Firestore/Storage/BigQuery by default; CMEK option for face-template bucket and document vault on Enterprise plan (master spec §7).

### 7.2 Client-side secret storage (Android)

- Firebase session persisted by the SDK; every WorkTrack-managed secret — cached ID token metadata, `deviceId`, kiosk provisioning secret (kiosk build), FCM token — lives in **EncryptedSharedPreferences backed by an Android Keystore AES-256 master key** (`MasterKey`, StrongBox where available). Nothing security-bearing in plain SharedPreferences, files, or Room.
- Room holds business data only; no tokens. Database-level encryption (SQLCipher) is not applied by default (device FDE + no-secrets-in-Room); tenants may require it via managed-config flag.
- `android:allowBackup="false"` for security-bearing stores (backup rules exclude EncryptedSharedPreferences files); screenshots blocked (`FLAG_SECURE`) on payslip and face-enrollment screens.

### 7.3 PII classification

| Class | Fields (canonical model, master spec §4) | Handling |
|---|---|---|
| Restricted-Biometric | face embeddings, `faceScore` context | §6.7: CMEK-optional, no API export, consent-gated, crypto-shred on deletion |
| Restricted-Financial | `EmployeeSalary.*`, `Payslip*`, `PayrollRun.totalsJson`, bank details (P2) | `salary:*`/`payroll:*` permissions only; masked in UI until reveal-click (audited); never in logs, analytics events, or push payload bodies |
| Confidential-PII | name, email, phone, `avatarUrl`, address, documents, `lat/lng` on punches, leave reasons/attachments | Encrypted at rest; log-redacted (§7.4); export audited; push notifications carry IDs + generic titles, never field values |
| Internal | org structure, shifts, rosters, policies, announcements | Tenant-scoped standard handling |
| Public | none — no WorkTrack data is public | — |

### 7.4 Log redaction

- Structured JSON logs only; a central serializer applies a field-level **allowlist** — unknown fields are dropped, classified fields (email, phone, names, lat/lng, salary amounts, token strings) are redacted to type-tagged placeholders or salted hashes (correlatable, not reversible).
- Request logs record route template + IDs, never bodies for classified routes (`/payroll/*`, `/employees/*`, punch payloads). Correlation id (`traceId`) links logs ↔ audit ↔ problem responses.
- Log retention 30 d (app logs) / 400 d (security events); log access itself is IAM-restricted and audited (SOC 2 CC7).

### 7.5 Audit log immutability

- `AuditLog` is append-only (master spec §4.5): API exposes only `GET /audit-logs`; no update/delete handler exists; Firestore rules deny client writes wholesale (§5); the writer path is a dedicated service module invoked in-transaction with privileged mutations.
- Continuous export to BigQuery (append-only dataset, table-level immutability via IAM — the functions service account holds insert-only) provides the tamper-evident second copy; daily row-count/hash reconciliation between Firestore and BigQuery alerts on divergence (covers T10).
- Entries carry `beforeJson/afterJson` with classified fields redacted per §7.3 at write time — the audit trail itself must not become a PII amplifier.

### 7.6 GDPR

- **Roles**: tenant = controller, WorkTrack = processor; DPA + subprocessor list published; regional data residency per Firebase multi-region selection at tenant provisioning.
- **DSRs (Data Subject Requests)**: master spec §7 — API-backed workflows for access/export (machine-readable JSON of all rows keyed by `employeeId`), rectification (profile fields), erasure, and restriction. Erasure of an exited employee: identity fields overwritten with tombstone values; financial/attendance records required for statutory retention are **pseudonymized** (employeeId retained, direct identifiers severed) until their retention clock expires, then deleted.
- **Retention**: per-class schedule (payroll records per local statute, default 7 y; punches/attendance 3 y; audit 7 y; notifications 90 d; face embeddings: employment duration only). Cloud Scheduler retention jobs enforce; deletions audited.
- **Crypto-shredding**: exports, backups, and the document vault are encrypted under per-tenant (Enterprise: per-employee for biometrics) data keys; destroying the key renders residual copies unreadable, satisfying erasure across backups without backup rewrites.
- Breach handling: processor notification to controllers without undue delay (target ≤ 48 h) with scope, records affected, remediation.

### 7.7 SOC 2 control mapping

| Control (TSC) | WorkTrack implementation |
|---|---|
| CC6.1 Logical access | Firebase Auth + custom claims; deny-by-default RBAC (§4); MFA for admin roles |
| CC6.2/6.3 Provisioning & least privilege | RoleAssignment workflow with `role:assign` gate; scope narrowing; quarterly access review report generated from RoleAssignments + audit |
| CC6.6 Boundary protection | TLS everywhere; Firestore rules deny-by-default (§5); no public data plane |
| CC6.7 Data in transmission/removal | §7.1; signed-URL, expiring media access; crypto-shredding (§7.6) |
| CC6.8 Unauthorized software | Play Integrity on punch path (§6.2); dependency scanning (§8) |
| CC7.1/7.2 Monitoring & anomaly detection | Security event log; integrity/mock/speed flags into exceptions queue; sync-health telemetry (doc 08 §8) |
| CC7.3/7.4 Incident response | On-call runbooks, severity matrix, breach comms (§7.6); post-incident review with control updates |
| CC8.1 Change management | PR review gates, CI checks, staged rollout, rules+functions atomic deploy (§8) |
| A1.2 Availability | Multi-region Firebase, autoscaling functions, backpressure (T12); RTO/RPO stated in ops runbook |
| C1.1/C1.2 Confidentiality | PII classification (§7.3) + retention/disposal schedule (§7.6) |
| PI1 Processing integrity | Idempotency keys, server-authoritative computation, payroll segregation of duties, append-only punches, reconciliation jobs |

## 8. Secure SDLC

- **Dependency scanning**: Renovate for automated update PRs; `osv-scanner` (Gradle + npm) in CI, build-blocking on high/critical CVEs with an exception register; Android lint security checks; npm lockfile linting (`lockfile-lint`) against registry tampering.
- **Secrets management**: no secrets in the repo — CI secret scanning (gitleaks) blocks pushes; server secrets (kiosk HMAC keys, service credentials) in GCP Secret Manager with least-privilege service accounts and 90-day rotation; Android signing keys in Play App Signing; `.env`-style local config git-ignored with checked-in redacted examples.
- **Code review gates**: every change via PR; two-reviewer rule for security-sensitive paths (`functions/src/middleware/**`, `firestore.rules`, auth/claims code, payroll engine, crypto/storage utilities — enforced via CODEOWNERS); Firestore rules changes require the emulator allow/deny matrix suite to pass; SAST (Semgrep with the OWASP + custom tenant-isolation rulepack: flags any Firestore query not built through the tenant-scoped repository) on every PR.
- **Testing**: security unit tests are release-blocking — middleware chain (401/403 matrices per role × endpoint from the §4.2 catalog), rules emulator suite, idempotency replay, kiosk token replay/expiry, speed-of-travel cases.
- **Pen-test cadence**: external penetration test annually and before each major phase launch (P1 kiosk/face, P2 payroll, P3 web admin); scope includes tenant-isolation (T4) and payroll segregation (T7) scenarios; findings tracked to closure with 30/60/90-day SLAs by severity. Internal red-team exercise on the punch anti-fraud stack semi-annually.
- **Release hygiene**: staged rollout (internal → 10% → 100%) with crash + security-event monitoring; server deploys are versioned and one-step revertible; `/v1` deprecations follow the master spec's explicit deprecation windows.

## 9. Security monitoring and incident response

### 9.1 Security event taxonomy

High-signal events emitted to the security log (distinct stream from app logs, 400-day retention, §7.4):

| Event | Source | Default response |
|---|---|---|
| `auth.token_stale_forced_refresh`, `auth.revoked_token_use` | Middleware | Repeated revoked-token use from one IP → block + alert |
| `authz.permission_denied` (with route, permission, role set) | RBAC middleware | > 20/min per identity → alert (probing) |
| `tenant.claim_url_mismatch` | tenantContext | Always alert — should be near zero in legitimate traffic (T4 canary) |
| `device.binding_mismatch`, `device.revoked_use` | Punch/sync handlers | Alert + auto-flag subsequent punches from that identity |
| `fraud.integrity_failed`, `fraud.mock_location`, `fraud.implausible_travel`, `fraud.kiosk_replay`, `fraud.face_mismatch` | Anti-fraud stack (§6) | Feed exceptions queue; tenant-level rate anomaly → security review |
| `payroll.sod_violation_attempt` (approve own run), `payroll.locked_run_mutation` | Payroll handlers | Always alert; audited regardless of outcome |
| `audit.divergence` (Firestore↔BigQuery reconciliation) | Daily job | Page on-call (possible T10) |
| `rules.denied_client_write` | Firestore rules metrics | Any nonzero rate investigated — indicates a client bug or probing |

### 9.2 Incident response

- Severity matrix: SEV1 = confirmed cross-tenant access, payroll integrity compromise, or biometric data exposure; SEV2 = single-account takeover, audit divergence; SEV3 = contained fraud attempt, scanner findings in production. SEV1/2 page the on-call immediately; SEV1 additionally invokes the breach-notification clock (§7.6).
- Containment tooling (pre-built, tested quarterly): per-tenant API freeze switch, global punch-endpoint flag-only mode, bulk refresh-token revocation for a tenant, kiosk secret emergency rotation, signed-URL TTL kill-down.
- Every SEV1/2 concludes with a blameless post-incident review within 5 business days; action items land in the risk register (§2) with owners; controls in this document are updated in the same PR as the fix where applicable.
