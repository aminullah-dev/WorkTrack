# WorkTrack — Product Requirements Document

Version: 1.0 · Status: Approved · Owners: Product · Derives from: `00-master-spec.md`

**Purpose.** This document translates the master specification into testable product requirements for the WorkTrack multi-tenant Workforce Management Platform. It defines the vision, target segments, personas, functional requirements per domain (with priority and acceptance criteria), the enterprise-hardening additions made beyond the original brief, non-functional requirements, and explicit scope boundaries. Where this document and `00-master-spec.md` diverge, the master spec wins.

> **Priority key** — `P0` = must ship in the foundation release (maps to delivery Phase P0/P1), `P1` = required for enterprise sales readiness (Phases P2–P3), `P2` = differentiator (Phase P4). Requirement priority (P0/P1/P2) is orthogonal to delivery phase numbering (P0–P4 in `09-roadmap.md`); the phase column in each table states when the requirement is scheduled to land.

---

## 1. Vision

WorkTrack is the operational system of record for a distributed workforce: every punch, shift, leave day, and payslip flows through one auditable, offline-tolerant platform. It replaces the fragmented stack of biometric terminals, spreadsheets, and disconnected payroll tools with a single tenant-isolated platform that works for a 5-person shop and a 100,000-employee enterprise on the same codebase and the same API.

Product pillars:

1. **Truth over convenience** — server-authoritative computation for anything with money or compliance impact (attendance validity, leave balances, payroll). Clients propose; the server decides.
2. **Field-first** — the Android app is offline-first; a warehouse worker with no signal can punch, apply for leave, and read payslips, and the outbox reconciles later with zero silent data loss.
3. **Enterprise-honest** — audit immutability, RBAC, data residency, and DSR support are foundation features, not retrofits.
4. **One API** — Android, Web Admin, and third-party integrations consume the same versioned REST API (`/v1`); there is no privileged back channel.

## 2. Target segments

| Segment | Size | Buying trigger | Critical capabilities |
|---|---|---|---|
| SMB | 1–200 employees | Replace paper registers / WhatsApp attendance | GPS punch, simple leave, payslip PDF, single branch, self-serve onboarding |
| Mid-market | 200–5,000 | Multi-branch consistency, payroll input accuracy | Multi-branch geofences, shift rosters, approval chains, regularization, holiday calendars |
| Enterprise | 5,000–100,000+ | Compliance, audit, integration with ERP/IdP | RBAC with scoped roles, kiosk mode, statutory payroll hooks, audit export, BigQuery analytics, open API/webhooks, SSO/SCIM (future) |
| Platform operator (internal) | — | Operate thousands of tenants | `SUPER_ADMIN` tooling, per-tenant cost controls, plan management |

Target scale (from master spec §1): 1 → 100,000+ employees per tenant; thousands of tenants.

## 3. Personas (mapped to spec roles)

| Persona | Role code(s) | Primary surface | Top jobs-to-be-done |
|---|---|---|---|
| Platform operator (internal SRE/support) | `SUPER_ADMIN` | Internal tooling / Web Admin | Provision tenants, investigate incidents cross-tenant, enforce plans |
| Company owner / COO | `COMPANY_ADMIN` | Web Admin | Configure company, branches, roles; see company-wide KPIs |
| HR manager | `HR_ADMIN` | Web Admin | Employee lifecycle, leave/attendance policy, regularization decisions, announcements |
| Payroll specialist | `PAYROLL_ADMIN` | Web Admin | Salary structures, payroll runs, payslip publication, statutory outputs |
| Branch/site manager | `BRANCH_MANAGER` | Android + Web Admin | Branch rosters, branch approvals, team attendance analytics |
| Shift supervisor | `TEAM_LEAD` | Android | First-level approvals (leave, regularization, swaps), team attendance visibility |
| Frontline employee | `EMPLOYEE` | Android | Punch in/out, view schedule, apply leave, read payslips, update profile |
| Internal/external auditor | `AUDITOR` | Web Admin | Read-only review, audit-log search and export |
| Kiosk terminal | `KIOSK` | Kiosk app mode | Display rotating TOTP QR for check-in; no human user |

All roles are permission bundles over `resource:action` strings (e.g. `attendance:approve`, `payroll:run`); custom roles are composable from the same permission set. Enforcement is server-side; client-side mirroring is UX only.

### 3.1 Key user journeys

| # | Journey | Persona(s) | Path | Governing FRs |
|---|---|---|---|---|
| J1 | Morning punch-in, no connectivity | EMPLOYEE | Open app → Attendance → punch IN (GPS captured, stored in Room + outbox) → later sync validates geofence server-side | FR-ATT-001/003, FR-PLT-002 |
| J2 | Kiosk check-in at a shared site | EMPLOYEE + KIOSK | Kiosk shows rotating QR → employee scans in app → punch submitted with `kioskToken` → server verifies window/branch | FR-ATT-004 |
| J3 | Fix a missed punch-out | EMPLOYEE → TEAM_LEAD → HR_ADMIN | Attendance history shows PENDING day → raise RegularizationRequest → chain approves → AttendanceDay recomputed | FR-ATT-007, FR-LVE-003 pattern |
| J4 | Apply for leave with half-days | EMPLOYEE → approvers | Leave → balances → apply (startHalf/endHalf) → chain decides → balance moves pending→used → notification | FR-LVE-002/003/004 |
| J5 | Publish next month's roster | BRANCH_MANAGER | Rosters for branch → assign/rotate → PUT batch → employees notified; locked at T-N days | FR-SHF-002/003/006 |
| J6 | Run monthly payroll | PAYROLL_ADMIN → COMPANY_ADMIN | Create run → async calc (Cloud Tasks) → review exceptions → approve (SoD) → payslips + PDFs published | FR-PAY-002/003/004/006 |
| J7 | Investigate a suspicious punch pattern | HR_ADMIN / AUDITOR | Flagged punches (`invalidReason`) → audit log for the employee/device → device revocation if warranted | FR-ATT-005, FR-PLT-001, FR-ORG-005 |
| J8 | Offboard an employee | HR_ADMIN | Checklist completes → `POST /employees/{id}/deactivate` → claims cleared, devices unbound, roster future-cleared, history retained | FR-ORG-003, FR-HRO-004 |

---

## 4. Functional requirements

Conventions: requirement IDs are `FR-<DOMAIN>-NNN`. Acceptance criteria (AC) are the minimum verifiable conditions; they assume the API contracts, entities, and error model of `00-master-spec.md` §4–§5.

### 4.1 Identity & Org (FR-ORG)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-ORG-001 | Tenant isolation: every record belongs to exactly one Company; no API call can read or write another tenant's data. | P0 | P0 | Token claim `cid` must match URL `companyId`; mismatch returns RFC 7807 `403`; verified by cross-tenant test suite. |
| FR-ORG-002 | Org structure: CRUD for Branch, Department (hierarchical via `parentDepartmentId`), Position via `/branches`, `/departments`, `/positions`. | P0 | P0 | Admin can create branch with geo (lat/lng/radiusM) and timezone; department tree renders without cycles (server rejects cyclic parent). |
| FR-ORG-003 | Employee lifecycle: create, update, deactivate (`POST /employees/{id}/deactivate`); statuses ACTIVE, ON_LEAVE, SUSPENDED, EXITED. | P0 | P0 | Deactivation revokes auth (custom claims cleared ≤ 60 s), unbinds devices, removes from future rosters; historical data retained. |
| FR-ORG-004 | RBAC: built-in roles per spec §1.1 plus custom roles as permission bundles; RoleAssignment scoped COMPANY, BRANCH, or DEPARTMENT. | P0 | P0 | A `BRANCH_MANAGER` scoped to branch B1 receives `403` on branch B2 resources; permission checks are deny-by-default. |
| FR-ORG-005 | Device binding: `POST /devices` binds one device per employee (configurable N); `DELETE /devices/{id}` revokes. | P0 | P0 | Punch from an unbound or revoked device is rejected with a machine-readable problem type; Device row stores `integrityVerdict`, `boundAt`, `revokedAt`. |
| FR-ORG-006 | Session bootstrap: `GET /me` returns profile + roles + company in one call. | P0 | P0 | Cold app start needs exactly one API call to render the authenticated shell. |
| FR-ORG-007 | Manager chain: `Employee.managerId` defines the reporting line used as default approval chain seed. | P0 | P0 | Changing a manager re-routes only future approvals; in-flight chains are unaffected. |
| FR-ORG-008 | SSO (OIDC/SAML) and SCIM provisioning for enterprise IdPs. | P2 | P4 | Employee created in IdP appears in WorkTrack ≤ 5 min; deprovisioning revokes access ≤ 5 min. |
| FR-ORG-009 | Custom roles: admins compose roles from `resource:action` permission strings; built-in roles are immutable templates. | P1 | P3 | Custom role creation requires `roles:manage`; deleting a role in use is blocked until reassignment; every role change is audit-logged with before/after permission sets. |
| FR-ORG-010 | Bulk import: CSV import for employees, departments, and shift assignments with dry-run validation. | P1 | P3 | Dry run reports per-row errors without writing; committed import is idempotent on `employeeCode`; import summary is audit-logged. |

### 4.2 Attendance (FR-ATT)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-ATT-001 | GPS punch: `POST /attendance/punches` with type IN/OUT, method GPS; server validates geofence containment and stores `insideFence`. | P0 | P0 | Punch inside fence → `serverValidated=true`; outside fence → persisted append-only with `insideFence=false` and `invalidReason` set; employee sees the outcome. |
| FR-ATT-002 | Punches are append-only; no client update/delete operations exist. | P0 | P0 | API exposes no PUT/DELETE on punches; corrections happen only via RegularizationRequest. |
| FR-ATT-003 | Offline punch: punch recorded in Room with outbox entry when offline; synced with original `punchedAt` and idempotency key. | P0 | P0 | Airplane-mode punch appears on server after reconnect exactly once (idempotent retry); `punchedAt` reflects capture time, not sync time. |
| FR-ATT-004 | QR kiosk check-in: kiosk (role `KIOSK`) displays rotating TOTP QR (30 s window, HMAC signed, carries `kioskId`); employee app scans and submits `{method:QR, kioskToken}`. | P0 | P1 | Server verifies signature + time window + kiosk branch vs employee branch; replayed or expired token rejected; clock-skew tolerance ±1 window. |
| FR-ATT-005 | Anti-spoofing: device binding + Play Integrity verdict required on punch endpoints; on-device mock-location flag (`isMock`) plus server speed-of-travel plausibility check. | P0 | P0 | Punch with failed integrity verdict or implausible travel (> configurable km/h between consecutive punches) is flagged `serverValidated=false` with `invalidReason`; surfaced to `HR_ADMIN`. |
| FR-ATT-006 | AttendanceDay computation: server-computed projection per employee/date (firstInAt, lastOutAt, workedMinutes, lateMinutes, earlyOutMinutes, overtimeMinutes, status) shift-aware including night shifts (`isNight`). | P0 | P0 | Recompute is deterministic and idempotent (`version` increments); grace windows (`graceInMinutes`/`graceOutMinutes`) applied; night shift spanning midnight attributes to the shift's start date. |
| FR-ATT-007 | Regularization: employee raises RegularizationRequest (requested in/out, reason); multi-level decision via `POST /attendance/regularizations/{id}/decide`; approval triggers AttendanceDay recompute. | P0 | P1 | Status transitions limited to PENDING→APPROVED/REJECTED/CANCELLED; approver chain honored (`approverChainJson`); recompute completes ≤ 60 s after approval. |
| FR-ATT-008 | Attendance history: `GET /attendance/days?from&to&employeeId` and `GET /attendance/punches`, RBAC-scoped (self, team, branch, company). | P0 | P0 | `EMPLOYEE` sees only self; `TEAM_LEAD` sees direct reports; cursor pagination; range capped server-side (≤ 92 days per query). |
| FR-ATT-009 | Face verification punch: embedding match against stored template, threshold server-tunable; raw capture deleted after embedding. | P1 | P1 | `faceScore` persisted on the punch; below-threshold match falls back per policy (reject or flag); no raw photo retained beyond embedding pipeline. |
| FR-ATT-010 | Overtime: computed from `overtimePolicyJson` on Shift; feeds `overtimeMinutes` into AttendanceDay and payroll. | P1 | P2 | OT below policy threshold is 0; OT rounding rule applied consistently; payslip OT equals sum of AttendanceDay OT for the period. |
| FR-ATT-011 | Day-status completeness: AttendanceDay status covers PRESENT, ABSENT, HALF_DAY, LEAVE, HOLIDAY, WEEK_OFF, PENDING; WEEK_OFF derives from roster gaps per policy, LEAVE from approved LeaveRequests, HOLIDAY from the branch calendar. | P0 | P1 | For any employee/date exactly one status is computed; precedence order (HOLIDAY > LEAVE > WEEK_OFF > punch-derived) is documented and test-covered; PENDING only while the day is incomplete. |
| FR-ATT-012 | Punch context: optional `note` and `photoUrl` on a punch (e.g. off-site client visit); photo capture policy per company. | P1 | P1 | Note length capped; photo uploaded via signed URL and linked before punch submission completes; photos excluded from face-verification pipeline. |

### 4.3 Shift Scheduling (FR-SHF)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-SHF-001 | Shift templates: CRUD `/shifts` (start/end, breakMinutes, grace windows, overtime policy, `isNight`). | P0 | P0 | Overlap and validity checks server-side; deactivating a shift does not alter historical ShiftAssignments. |
| FR-SHF-002 | Rosters: `GET/PUT /rosters?branchId&from&to` assigns shifts per employee per date (ShiftAssignment, source ROSTER/ROTATION/MANUAL/SWAP). | P0 | P1 | Bulk PUT is transactional per batch and idempotent; one active assignment per employee per date enforced; conflicts return per-item errors, not batch failure. |
| FR-SHF-003 | Rotation patterns: recurring patterns generate assignments ahead of time via scheduled jobs. | P1 | P1 | Generation window configurable (e.g. 28 days ahead); regeneration never overwrites MANUAL or SWAP assignments. |
| FR-SHF-004 | Shift swaps: `POST /shift-swaps` (targeted or open), `POST /shift-swaps/{id}/decide` by approver. | P1 | P1 | Approved swap atomically re-points both ShiftAssignments with source=SWAP; declined/expired swaps leave the roster untouched. |
| FR-SHF-005 | Open-shift claiming: unassigned roster slots are claimable by eligible employees, subject to approval. | P1 | P1 | Eligibility = same branch + position match + no conflicting assignment; first approved claim wins; losers are notified. |
| FR-SHF-006 | Roster locks: Cloud Scheduler locks rosters N days before the period; later changes require elevated permission. | P1 | P1 | Post-lock edits require `roster:override` permission and produce an AuditLog entry. |

### 4.4 Leave (FR-LVE)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-LVE-001 | Leave catalog: LeaveType (paid flag, attachment requirement) + LeavePolicy (accrual NONE/MONTHLY/YEARLY/ANNIVERSARY, maxBalance, maxCarryover, minNoticedays, maxConsecutiveDays, appliesTo). | P0 | P0 | Policy resolution is deterministic for any employee via `appliesTo` matching; exactly one policy applies per type per employee. |
| FR-LVE-002 | Apply for leave: `POST /leave/requests` with half-day support (startHalf/endHalf); computed `days` excludes holidays and week-offs. | P0 | P0 | Overlapping-request rejection; insufficient balance rejection (unless policy allows negative); attachment enforced when `requiresAttachment`. |
| FR-LVE-003 | Multi-level approval: `approvalChainJson` derived from manager chain and policy; `POST /leave/requests/{id}/decide` advances the chain; `.../cancel` by requester. | P0 | P0 | Only `currentApproverId` (or scoped admin) can decide; each hop notifies the next approver; full decision history retained. |
| FR-LVE-004 | Balances: LeaveBalance per employee/type/periodYear (entitled, accrued, used, carriedOver, pending) maintained server-side with optimistic `version`. | P0 | P0 | Applying moves days to `pendingDays`; approval moves pending→used; rejection/cancellation returns pending; balances never computed client-side. |
| FR-LVE-005 | Accrual engine: Cloud Scheduler applies accrual rules; year-end carryover honors `maxCarryover`. | P0 | P1 | Accrual job is idempotent per (employee, type, period); re-runs produce no double credit; audit entry per adjustment batch. |
| FR-LVE-006 | Holiday calendars: HolidayCalendar per year with branch mapping (`branchIds`); Holiday supports `isOptional`. | P0 | P1 | Attendance status HOLIDAY derived from the employee's branch calendar; leave-day computation skips holidays; optional-holiday elections capped per policy. |
| FR-LVE-007 | Leave visibility: `GET /leave/requests` and `GET /leave/balances?employeeId` RBAC-scoped; approvers see team calendars. | P0 | P0 | `TEAM_LEAD` sees direct reports' approved leave in schedule views; employees see own balances in ≤ 1 API call. |
| FR-LVE-008 | Optional-holiday election: employees elect from `isOptional` holidays up to a per-policy cap; elections feed attendance status. | P1 | P1 | Election window enforced; cap enforced per periodYear; elected day computes as HOLIDAY for that employee only. |
| FR-LVE-009 | Offline leave application: leave requests composed offline enter the outbox and sync with balance validation deferred to the server. | P0 | P0 | Offline-created request shows `syncStatus=PENDING`; server rejection (e.g. insufficient balance) surfaces as an actionable notification, and the request moves to a correctable failed state — never silently dropped. |

### 4.5 Payroll (FR-PAY)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-PAY-001 | Salary configuration: SalaryComponent (EARNING/DEDUCTION/EMPLOYER_COST; FIXED/PERCENT_OF_BASIC/PERCENT_OF_GROSS/FORMULA), SalaryStructure, EmployeeSalary with effective dating. | P0 | P2 | Overlapping EmployeeSalary effective ranges rejected; formula components validated at save time; every revision stores `revisionReason`. |
| FR-PAY-002 | Payroll run: `POST /payroll/runs` starts async calculation via Cloud Tasks; states DRAFT→CALCULATING→REVIEW→APPROVED→PAID→CLOSED. | P0 | P2 | Run over 100k employees completes ≤ 30 min; progress observable; failed employee calculations quarantined without failing the run; recalculation allowed until APPROVED. |
| FR-PAY-003 | Attendance/leave integration: workedDays, paidLeaveDays, lopDays, overtimeMinutes on Payslip derive from AttendanceDay and LeaveRequest projections for the period. | P0 | P2 | Payslip figures reconcile exactly with attendance data at run time; period locked (`lockedAt`) after approval — later regularizations route to the next run as arrears. |
| FR-PAY-004 | Payslips: PayslipLine per component; PDF rendered to Cloud Storage (`pdfUrl`); employee access via `GET /payslips?employeeId&year` and `GET /payslips/{id}`. | P0 | P2 | Employee sees only own payslips; payslip visible only after run APPROVED; PDF downloadable offline once cached. |
| FR-PAY-005 | Statutory rule hooks: SalaryComponent `statutoryCode` binds to pluggable per-jurisdiction statutory packs (e.g. PF/ESI/TDS-style rules) evaluated during calculation. | P1 | P2 | Statutory pack versioned; run records the pack version used; changing a pack never mutates historical payslips. |
| FR-PAY-006 | Approval & segregation of duties: `POST /payroll/runs/{id}/approve` requires `payroll:approve`; initiator (`startedBy`) cannot self-approve when SoD is enabled. | P0 | P2 | Approval writes `approvedBy` + AuditLog with totals snapshot (`totalsJson`); CLOSED runs are immutable. |
| FR-PAY-007 | Bank/export outputs: approved runs export payment register (CSV/SEPA-style) and GL summary. | P1 | P2 | Export totals equal run `totalsJson`; exports are audit-logged. |
| FR-PAY-008 | Arrears handling: attendance corrections approved after a run is locked (`lockedAt`) are carried as arrears lines into the next run, never retro-mutating issued payslips. | P0 | P2 | Post-lock regularization creates an arrears delta traceable to the source date; next run's payslip shows the arrears PayslipLine with `meta` referencing the origin period; issued payslips are immutable. |

### 4.6 HR Operations (FR-HRO)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-HRO-001 | Announcements: `GET/POST /announcements` with audience targeting (`audienceJson`), scheduling (`publishAt`), expiry, priority. | P0 | P0 | Only matching audience receives the announcement + push; expired items disappear from feeds; priority affects ordering and notification channel. |
| FR-HRO-002 | Notifications: `GET /notifications`, `POST /notifications/{id}/read`; FCM push for approvals, decisions, roster changes, payslip publication. | P0 | P0 | Every state transition that requires human action generates a NotificationMessage; read state syncs across devices. |
| FR-HRO-003 | Document vault: EmployeeDocument (kind, storagePath, expiry, verifiedBy) with signed-URL access. | P1 | P2 | Upload capped by type/size; expiring documents (visas, certifications) trigger reminders at T-30/T-7; access is RBAC-scoped and audit-logged. |
| FR-HRO-004 | Onboarding/offboarding checklists: templated task lists per position/branch tracked to completion. | P1 | P2 | Offboarding completion is a precondition for EXITED status; each task records completer + timestamp. |
| FR-HRO-005 | Org directory: searchable directory (name, position, department, branch) respecting field-level privacy settings. | P1 | P3 | Phone/email visibility configurable per company; search p95 < 500 ms at 100k employees. |

### 4.7 Analytics (FR-ANA)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-ANA-001 | KPIs: `GET /analytics/kpis?scope&period` — headcount, attendance %, late %, absenteeism, OT hours, leave utilization, payroll cost; scope respects RBAC. | P0 | P3 | KPI freshness ≤ 24 h (BigQuery-backed) or real-time where Firestore counters exist; `BRANCH_MANAGER` scope limited to assigned branches. |
| FR-ANA-002 | BigQuery pipeline: Firestore → BigQuery export feeds dashboards and AI; analytics queries never scan Firestore at company scale. | P0 | P3 | No analytics endpoint issues unbounded Firestore collection scans; BigQuery datasets are tenant-partitioned. |
| FR-ANA-003 | AI insights: `GET /analytics/insights` — absenteeism risk, overtime anomaly, attrition signals, with model explanation and confidence. | P2 | P4 | Insights are advisory and human-reviewable; per-tenant opt-out; no automated adverse action is taken from a model output. |
| FR-ANA-004 | Exports: KPI and audit exports to CSV; scheduled email digests for admins. | P1 | P3 | Export generation is async with notification on completion; exports are audit-logged. |

### 4.8 Platform (FR-PLT)

| ID | Requirement | Priority | Phase | Acceptance criteria |
|---|---|---|---|---|
| FR-PLT-001 | Audit log: append-only, immutable AuditLog for every privileged mutation (actor, action, resource, before/after, ip, userAgent); queryable via `GET /audit-logs?resourceType&from&to`. | P0 | P0 | No API mutates or deletes audit entries; `AUDITOR` role can read all; retention configurable ≥ 7 years for payroll-affecting actions. |
| FR-PLT-002 | Offline-first sync: `POST /sync/push` (batched outbox ops with idempotency keys), `GET /sync/pull?types&cursor` (delta). | P0 | P0 | 72 h fully-offline operation for employee flows; rejected ops surface as actionable notifications — never silent loss; push is idempotent under retry. |
| FR-PLT-003 | Idempotency: `Idempotency-Key` header honored on all POSTs; duplicate submission returns the original result. | P0 | P0 | Same key + same payload → identical response, no double effect; same key + different payload → `409` problem. |
| FR-PLT-004 | API platform: versioned `/v1`, additive evolution, explicit deprecation windows; RFC 7807 errors; cursor pagination with `{data, meta:{cursor}}` envelope. | P0 | P0 | Breaking change requires new version; deprecation announced ≥ 180 days ahead; every list endpoint paginates. |
| FR-PLT-005 | Webhooks & open API: tenant-configurable webhooks (HMAC-signed, retried) for employee/attendance/leave/payroll events; public OpenAPI spec + API keys for server-to-server integrations. | P2 | P4 | Webhook delivery ≥ 3 retries with backoff + DLQ; secrets rotatable; API-key scopes reuse `resource:action` permissions. |
| FR-PLT-006 | Rate limiting & abuse protection: per-token and per-tenant limits with `429` + `Retry-After`. | P0 | P0 | Sync endpoints have higher burst allowance; limits never drop punch data (client outbox retries); limits documented per endpoint class. |
| FR-PLT-007 | GDPR/DSR: data subject access export and erasure endpoints; retention policies per data class; erasure preserves financial/statutory records via pseudonymization. | P1 | P3 | DSR export delivered ≤ 30 days (target ≤ 72 h automated); erasure pseudonymizes PII while retaining payroll/audit integrity; every DSR is audit-logged. |
| FR-PLT-008 | Data residency: tenant data pinned to a declared region (Firestore/Storage/BigQuery location) at tenant creation. | P1 | P3 | Region immutable post-creation (migration = support process); backups and exports remain in-region. |

---

## 5. Gaps identified in the original brief & added enterprise features

The original brief ("attendance + payroll app with GPS punch") omitted capabilities that are mandatory for mid-market and enterprise deployment. This section records each gap, the resolution now embedded in the spec and requirements above, and where it lands.

| # | Gap in original brief | Resolution in WorkTrack | Where |
|---|---|---|---|
| 1 | No correction path for missed/invalid punches | Attendance **regularization** workflow with multi-level approval and recompute (RegularizationRequest) | FR-ATT-007, Phase P1 |
| 2 | Single-approver assumption | **Approval chains** (`approvalChainJson`) for leave, regularization, swaps; chain derived from manager line + policy | FR-LVE-003, FR-ATT-007 |
| 3 | No holiday awareness | **Holiday calendars** per branch/year with optional holidays; drives attendance status and leave-day math | FR-LVE-006 |
| 4 | Punch spoofing unaddressed | **Device binding + Play Integrity**, mock-location detection, server speed-of-travel plausibility | FR-ORG-005, FR-ATT-005 |
| 5 | No shared-terminal story | **Kiosk TOTP QR** flow: `KIOSK` role, rotating HMAC-signed 30 s tokens, branch cross-check | FR-ATT-004 |
| 6 | Payroll treated as simple arithmetic | **Statutory rule hooks** (`statutoryCode` + versioned jurisdiction packs), segregation of duties, arrears routing | FR-PAY-005/006, FR-PAY-003 |
| 7 | No tamper-evidence for HR/payroll actions | **Audit immutability**: append-only AuditLog with before/after snapshots on every privileged mutation | FR-PLT-001 |
| 8 | No regional compliance posture | **Data residency** pinning per tenant | FR-PLT-008 |
| 9 | GDPR ignored | **DSR endpoints** (export/erasure with pseudonymization of statutory records) | FR-PLT-007 |
| 10 | Closed system | **Webhooks + open API** (OpenAPI, HMAC-signed events, scoped API keys) | FR-PLT-005, Phase P4 |
| 11 | Password-only auth for enterprises | **SSO (OIDC/SAML) + SCIM** provisioning (future) | FR-ORG-008, Phase P4 |
| 12 | No abuse controls | **Rate limiting** per token/tenant with sync-friendly semantics | FR-PLT-006 |
| 13 | Implicit single-timezone assumption | **Multi-timezone handling**: Company and Branch carry IANA timezones; night shifts and day attribution are shift-timezone-aware; all storage in UTC instants + local date keys | FR-ATT-006, NFR-I18N |
| 14 | No accessibility commitment | **WCAG 2.1 AA** target across Android (TalkBack) and Web Admin | NFR-ACC |
| 15 | English-only assumption | **Localization incl. RTL** (externalized strings, ICU plurals, locale-aware dates/numbers/currency) | NFR-I18N |

---

## 6. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-AVL-001 | Availability | API availability SLO **99.9%** monthly (measured at the load balancer, excluding client networks); punch write path targets 99.95%. Error budget policy gates risky releases. |
| NFR-LAT-001 | Latency | p95 budgets: `POST /attendance/punches` ≤ 400 ms; `GET /me` ≤ 300 ms; list endpoints ≤ 600 ms; `POST /sync/push` (50-op batch) ≤ 1.5 s; `GET /sync/pull` page ≤ 800 ms. Measured server-side per region. |
| NFR-OFF-001 | Offline | Android supports **≥ 72 h fully offline** for employee flows (punch, leave apply, payslip read of cached data); outbox capacity ≥ 5,000 ops; sync catch-up after 72 h offline completes ≤ 5 min on 4G. |
| NFR-SCL-001 | Scale | 100,000+ employees per tenant; thousands of tenants; ≥ 500 punch writes/s sustained per tenant at shift boundaries; payroll run for 100k employees ≤ 30 min; roster generation 100k × 28 days ≤ 15 min. |
| NFR-SEC-001 | Security | Per master spec §7: Firebase Auth short-lived tokens + custom claims; deny-by-default middleware chain; no direct client Firestore access to server-authoritative collections; TLS 1.2+; at-rest encryption; tokens in EncryptedSharedPreferences/Keystore; no PII in logs; face data stored as embeddings only, raw capture deleted; CMEK option for face templates. |
| NFR-CMP-001 | Compliance | GDPR (DSR, retention), SOC 2 control mapping per `07-security-architecture.md`; payroll-affecting audit retention ≥ 7 years; statutory pack versioning for payroll reproducibility. |
| NFR-ACC-001 | Accessibility | **WCAG 2.1 AA**: full TalkBack/keyboard navigation, ≥ 4.5:1 contrast, touch targets ≥ 48 dp, no information conveyed by color alone; Web Admin passes axe-core CI gate with zero critical violations. |
| NFR-I18N-001 | Localization | All strings externalized; ICU plural/gender support; **RTL layouts** first-class (Arabic/Hebrew/Farsi); locale-aware date/number/currency formatting; per-company currency and per-branch IANA timezone; DST-safe attendance math. |
| NFR-OBS-001 | Observability | Structured logs with trace IDs (no PII), RED metrics per endpoint, alerting on SLO burn rate; every async job (accruals, payroll, roster) emits success/failure metrics and is idempotently re-runnable. |
| NFR-CST-001 | Cost | Per-tenant cost attribution (reads/writes/storage/egress) exportable; Firestore read amplification bounded by projections (AttendanceDay) and BigQuery offload for analytics. |

## 7. Out of scope (v1 platform)

- Time-clock **hardware** manufacturing or on-prem biometric terminal integrations (kiosk mode on standard Android tablets covers shared terminals).
- **Tax filing/remittance** to authorities — WorkTrack computes via statutory packs and exports registers; filing is the customer's or partner's responsibility.
- **Benefits administration**, recruitment/ATS, performance management, LMS.
- **iOS app** (API is client-agnostic; iOS is a candidate after Phase P4).
- **Payments execution** (bank integration beyond export files).
- On-prem/self-hosted deployment; WorkTrack is cloud-only on the Firebase/GCP stack.
- Real-time chat/messaging (announcements + notifications only).

## 8. Assumptions

1. Every employee-facing user has an Android device (personal or company-issued) or access to a kiosk tablet; Web Admin covers desk personas.
2. Firebase Authentication is the sole identity provider until SSO/SCIM (FR-ORG-008) ships; email/phone uniqueness is per tenant.
3. Tenants accept Google-managed encryption at rest; CMEK is offered for face-template storage only in v1.
4. Statutory packs are developed per launch jurisdiction; a tenant in an unsupported jurisdiction runs payroll with generic components and disclaims statutory accuracy.
5. Firestore, Cloud Functions, Cloud Tasks, Pub/Sub, Cloud Scheduler, BigQuery, and Cloud Storage remain the platform stack (see ADR-001, ADR-008 in `02-system-architecture.md`); multi-cloud portability is a non-goal.
6. Clock integrity: server time is authoritative for validation windows (kiosk TOTP, token expiry); client `punchedAt` is trusted only within configured skew bounds and flagged otherwise.
7. Phase numbering and P0 scope follow `00-master-spec.md` §8 and `09-roadmap.md`; this PRD does not reorder phases.

## 9. Success metrics

| Metric | Definition | Target |
|---|---|---|
| Punch success rate | Punches accepted as `serverValidated=true` / total punch attempts (excluding legitimate policy rejections) | ≥ 99% |
| Sync integrity | Outbox ops resolved (DONE or user-actioned FAILED) without support intervention | 100% — silent loss is a sev-1 |
| Regularization resolution time | Median PENDING→decided for RegularizationRequest | ≤ 24 h |
| Leave decision time | Median PENDING→decided for LeaveRequest | ≤ 48 h |
| Payroll accuracy | Payslips requiring post-approval correction per run | ≤ 0.5% |
| Payroll run duration | 100k-employee run, POST → REVIEW-ready | ≤ 30 min |
| Self-service adoption | Monthly active employees / provisioned employees per tenant | ≥ 80% by month 3 |
| Admin efficiency | HR minutes per employee per month spent on attendance corrections | ↓ 50% vs pre-WorkTrack baseline |
| Support load | Tickets per 1,000 employees per month | ≤ 5 after month 2 |

## 10. Appendix — Requirement traceability (FR → API → entities)

| FR | Primary endpoints (`/v1`) | Primary entities |
|---|---|---|
| FR-ORG-001 | all (middleware) | Company |
| FR-ORG-002 | `/branches`, `/departments`, `/positions` | Branch, Department, Position |
| FR-ORG-003 | `/employees`, `POST /employees/{id}/deactivate` | Employee |
| FR-ORG-004 | all (middleware) | RoleAssignment |
| FR-ORG-005 | `POST /devices`, `DELETE /devices/{id}` | Device |
| FR-ORG-006 | `GET /me` | Employee, RoleAssignment, Company |
| FR-ORG-007 | `/employees` | Employee (`managerId`) |
| FR-ORG-008 | SSO/SCIM (P4 surface) | Employee, RoleAssignment |
| FR-ORG-009 | role admin (P3 surface) | RoleAssignment |
| FR-ORG-010 | bulk import (P3 surface) | Employee, Department, ShiftAssignment |
| FR-ATT-001/002/003/005/012 | `POST /attendance/punches`, `GET /attendance/punches` | AttendancePunch, Geofence, Device |
| FR-ATT-004 | `POST /attendance/punches` (`method:QR, kioskToken`) | AttendancePunch, Device (`KIOSK`) |
| FR-ATT-006/011 | `GET /attendance/days` | AttendanceDay, Shift, HolidayCalendar |
| FR-ATT-007 | `POST /attendance/regularizations`, `…/{id}/decide` | RegularizationRequest, AttendanceDay |
| FR-ATT-008 | `GET /attendance/days`, `GET /attendance/punches` | AttendanceDay, AttendancePunch |
| FR-ATT-009 | `POST /attendance/punches` (`method:FACE`) | AttendancePunch (`faceScore`) |
| FR-ATT-010 | `GET /attendance/days` | Shift (`overtimePolicyJson`), AttendanceDay |
| FR-SHF-001 | `/shifts` | Shift |
| FR-SHF-002/003 | `GET/PUT /rosters` | ShiftAssignment |
| FR-SHF-004/005 | `POST /shift-swaps`, `…/{id}/decide` | ShiftSwapRequest, ShiftAssignment |
| FR-SHF-006 | roster lock jobs | ShiftAssignment, AuditLog |
| FR-LVE-001 | `GET /leave/types` | LeaveType, LeavePolicy |
| FR-LVE-002/003/009 | `POST /leave/requests`, `…/{id}/decide`, `…/{id}/cancel` | LeaveRequest |
| FR-LVE-004/005 | `GET /leave/balances` | LeaveBalance |
| FR-LVE-006/008 | leave computation, attendance status | HolidayCalendar, Holiday |
| FR-PAY-001 | payroll config (P2 surfaces) | SalaryComponent, SalaryStructure, EmployeeSalary |
| FR-PAY-002/006 | `GET/POST /payroll/runs`, `…/{id}/approve` | PayrollRun |
| FR-PAY-003/008 | run calculation | Payslip, AttendanceDay, LeaveRequest |
| FR-PAY-004 | `GET /payslips`, `GET /payslips/{id}` | Payslip, PayslipLine |
| FR-PAY-005 | run calculation | SalaryComponent (`statutoryCode`) |
| FR-HRO-001 | `GET/POST /announcements` | Announcement |
| FR-HRO-002 | `GET /notifications`, `POST /notifications/{id}/read` | NotificationMessage, Device (`fcmToken`) |
| FR-HRO-003 | document endpoints (P2) | EmployeeDocument |
| FR-HRO-004 | checklist endpoints (P2) | Employee, EmployeeDocument |
| FR-HRO-005 | directory search (P3) | Employee, Position, Department, Branch |
| FR-ANA-001/002/004 | `GET /analytics/kpis` | BigQuery datasets (see `02-system-architecture.md`) |
| FR-ANA-003 | `GET /analytics/insights` | BigQuery feature tables |
| FR-PLT-001 | `GET /audit-logs` | AuditLog |
| FR-PLT-002/003 | `POST /sync/push`, `GET /sync/pull` | OutboxEntry, SyncCursor (client) |
| FR-PLT-004/006 | all (cross-cutting: versioning, envelope, rate limits) | — |
| FR-PLT-005 | webhooks/open API (P4) | — |
| FR-PLT-007 | DSR endpoints (P3) | Employee, EmployeeDocument, AuditLog |
| FR-PLT-008 | tenant provisioning (P3) | Company |
