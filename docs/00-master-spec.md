# WorkTrack — Master Specification (Source of Truth)

> This document is the canonical reference for the WorkTrack platform. Every other design
> document, the Android codebase, the backend, and the web admin design derive from it.
> When a conflict arises between documents, this file wins; update it first.

Version: 1.0 · Status: Approved · Owners: Platform Architecture

---

## 1. Product definition

WorkTrack is a multi-tenant Workforce Management Platform (HRMS) covering:

| Domain | Capabilities |
|---|---|
| Identity & Org | Multi-company (tenant), multi-branch, departments, positions, employee lifecycle, RBAC |
| Attendance | GPS + geofence punch, QR kiosk check-in, face verification, shift-aware computation, overtime, regularization |
| Shift Scheduling | Shift templates, rosters, rotations, swap requests, open-shift claiming |
| Leave | Leave types, policies, accrual engine, balances, multi-level approvals, holiday calendars |
| Payroll | Salary structures, earning/deduction components, payroll runs, payslips, statutory rule hooks |
| HR Operations | Onboarding/offboarding checklists, documents, announcements, org directory |
| Analytics | Attendance/leave/payroll KPIs, trends, AI insights (absenteeism risk, overtime anomaly, attrition signals) |
| Platform | Audit logs, notifications, offline-first sync, device binding, enterprise security |

Target scale: 1 → 100,000+ employees per tenant; thousands of tenants.

### 1.1 Actors and roles

Built-in roles (extensible via custom roles with permission sets):

- `SUPER_ADMIN` — platform operator (cross-tenant, internal only)
- `COMPANY_ADMIN` — full control of one company
- `HR_ADMIN` — HR ops, employees, leave/attendance policy, payroll input
- `PAYROLL_ADMIN` — payroll runs, payslips, salary data
- `BRANCH_MANAGER` — scoped to branch(es): rosters, approvals, team analytics
- `TEAM_LEAD` — first-level approvals, team attendance visibility
- `EMPLOYEE` — self-service: punch, leave, payslips, profile
- `AUDITOR` — read-only + audit log access
- `KIOSK` — device role for QR kiosk terminals

Permissions are strings `resource:action` (e.g. `attendance:approve`, `payroll:run`).
Roles are permission bundles; enforcement is server-side, mirrored client-side for UX only.

---

## 2. Technology stack

| Layer | Choice |
|---|---|
| Android | Kotlin 2.x, Jetpack Compose + Material 3, MVVM + Clean Architecture, Hilt, Room, WorkManager, DataStore, Navigation-Compose, ML Kit (QR + face), Play Integrity |
| Backend | Firebase Authentication (identity), Cloud Functions (Node 20, TypeScript, Express) exposing a versioned REST API, Firestore (system of record), Cloud Tasks (payroll jobs), Pub/Sub (fan-out), BigQuery export (analytics) |
| Web Admin | React 18 + TypeScript SPA (design in `06-web-admin-design.md`; implementation is roadmap Phase 4) |
| Infra | Firebase Hosting (admin SPA), Cloud Scheduler (accruals, roster locks), Cloud Storage (documents, face templates) |

### 2.1 Tenancy model

- Firestore layout: `companies/{companyId}/…` sub-collections per aggregate (see §4).
- Firebase Auth custom claims: `{ cid: companyId, r: [roleCodes], b: [branchIds], eid: employeeId }`.
- Every REST route resolves tenant from the verified ID token — never from the URL alone; URL companyId must match claim.

---

## 3. Architecture overview

```
┌────────────┐   REST v1 (OIDC bearer)   ┌─────────────────────────┐
│  Android    │ ─────────────────────────▶│ Cloud Functions (API)   │
│ offline-1st │ ◀───────── sync ──────────│  Express + middleware   │
└────────────┘                            │  authn → tenant → rbac  │
┌────────────┐                            └───────────┬─────────────┘
│  Web Admin  │ ──────────── same API ───────────────▶│
└────────────┘                              ┌─────────▼─────────┐
                                            │     Firestore      │
                                            │  (system of record)│
                                            └─────────┬─────────┘
                       Cloud Scheduler ──▶ jobs       │ triggers
                       Cloud Tasks ──▶ payroll        ▼
                                            Pub/Sub → BigQuery export → dashboards/AI
```

Principles:

1. **Server-authoritative writes** for anything with money/compliance impact (attendance validity, leave balances, payroll). Clients propose; the server decides.
2. **Offline-first Android**: Room is the local source of truth; an outbox queue with idempotency keys pushes mutations; a delta-cursor pull applies server state.
3. **Append-only events** where possible (attendance punches, audit logs) — no conflict resolution needed.
4. **Versioned API** (`/v1`), additive evolution, explicit deprecation windows.

---

## 4. Canonical data model

Logical model in 3NF; maps to Room tables (client) and Firestore collections (server).
IDs are ULIDs (sortable, offline-generatable). All rows carry `companyId`, `createdAt`,
`updatedAt`, `syncStatus` (client-only), soft-delete `deletedAt`.

### 4.1 Org & identity

- **Company**(id, name, legalName, timezone, currency, status, plan, settingsJson)
- **Branch**(id, companyId, name, code, address, lat, lng, radiusM, timezone, status)
- **Department**(id, companyId, branchId?, name, code, parentDepartmentId?)
- **Position**(id, companyId, title, code, level, departmentId?)
- **Employee**(id, companyId, employeeCode, firstName, lastName, email, phone, avatarUrl, branchId, departmentId, positionId, managerId?, employmentType[FULL_TIME|PART_TIME|CONTRACT|INTERN], joinDate, exitDate?, status[ACTIVE|ON_LEAVE|SUSPENDED|EXITED], authUid)
- **RoleAssignment**(id, companyId, employeeId, roleCode, scopeType[COMPANY|BRANCH|DEPARTMENT], scopeId?)
- **Device**(id, companyId, employeeId, platform, model, appVersion, fcmToken, integrityVerdict, boundAt, revokedAt?)

### 4.2 Attendance & scheduling

- **Geofence**(id, companyId, branchId, name, lat, lng, radiusM, active)
- **Shift**(id, companyId, name, code, startTime, endTime, breakMinutes, graceInMinutes, graceOutMinutes, overtimePolicyJson, isNight, active)
- **ShiftAssignment**(id, companyId, employeeId, shiftId, date, branchId, source[ROSTER|ROTATION|MANUAL|SWAP], status)
- **ShiftSwapRequest**(id, companyId, requesterId, targetEmployeeId?, assignmentId, status, decidedBy?, decidedAt?)
- **AttendancePunch**(id, companyId, employeeId, punchedAt, type[IN|OUT], method[GPS|QR|FACE|MANUAL|KIOSK], lat?, lng?, accuracyM?, geofenceId?, insideFence, deviceId, kioskId?, faceScore?, photoUrl?, note?, serverValidated, invalidReason?) — **append-only**
- **AttendanceDay**(id, companyId, employeeId, date, shiftId?, firstInAt?, lastOutAt?, workedMinutes, breakMinutes, lateMinutes, earlyOutMinutes, overtimeMinutes, status[PRESENT|ABSENT|HALF_DAY|LEAVE|HOLIDAY|WEEK_OFF|PENDING], computedAt, version) — server-computed projection
- **RegularizationRequest**(id, companyId, employeeId, date, requestedInAt?, requestedOutAt?, reason, status[PENDING|APPROVED|REJECTED|CANCELLED], approverChainJson, decidedBy?, decidedAt?)

### 4.3 Leave

- **LeaveType**(id, companyId, name, code, colorHex, isPaid, requiresAttachment, active)
- **LeavePolicy**(id, companyId, leaveTypeId, accrualRule[NONE|MONTHLY|YEARLY|ANNIVERSARY], accrualDays, maxBalance, maxCarryover, minNoticedays, maxConsecutiveDays, appliesTo Json)
- **LeaveBalance**(id, companyId, employeeId, leaveTypeId, periodYear, entitledDays, accruedDays, usedDays, carriedOverDays, pendingDays, version)
- **LeaveRequest**(id, companyId, employeeId, leaveTypeId, startDate, endDate, startHalf, endHalf, days, reason, attachmentUrl?, status[DRAFT|PENDING|APPROVED|REJECTED|CANCELLED], approvalChainJson, currentApproverId?, decidedAt?)
- **HolidayCalendar**(id, companyId, name, year, branchIds Json) / **Holiday**(id, calendarId, date, name, isOptional)

### 4.4 Payroll

- **SalaryComponent**(id, companyId, name, code, type[EARNING|DEDUCTION|EMPLOYER_COST], calc[FIXED|PERCENT_OF_BASIC|PERCENT_OF_GROSS|FORMULA], value, formula?, taxable, statutoryCode?, active)
- **SalaryStructure**(id, companyId, name, componentIds Json)
- **EmployeeSalary**(id, companyId, employeeId, structureId, basicAmount, currency, effectiveFrom, effectiveTo?, revisionReason)
- **PayrollRun**(id, companyId, periodYear, periodMonth, branchIds Json, status[DRAFT|CALCULATING|REVIEW|APPROVED|PAID|CLOSED], startedBy, approvedBy?, totalsJson, lockedAt?)
- **Payslip**(id, companyId, runId, employeeId, periodYear, periodMonth, currency, gross, totalDeductions, net, workedDays, paidLeaveDays, lopDays, overtimeMinutes, status, pdfUrl?)
- **PayslipLine**(id, payslipId, componentCode, componentName, type, amount, meta Json)

### 4.5 Platform

- **Announcement**(id, companyId, title, body, audienceJson, publishAt, expiresAt?, createdBy, priority)
- **EmployeeDocument**(id, companyId, employeeId, kind, name, storagePath, mimeType, sizeBytes, expiresAt?, verifiedBy?)
- **AuditLog**(id, companyId, actorId, actorRole, action, resourceType, resourceId, beforeJson?, afterJson?, ip?, userAgent?, at) — **append-only, immutable**
- **NotificationMessage**(id, companyId, employeeId, kind, title, body, dataJson, readAt?, sentAt)
- **OutboxEntry** (client-only)(id, opType, resourceType, resourceId, payloadJson, idempotencyKey, attempts, lastError?, state[PENDING|IN_FLIGHT|DONE|FAILED], queuedAt)
- **SyncCursor** (client-only)(resourceType, cursor, lastSyncedAt)

### 4.6 Firestore mapping

`companies/{cid}` doc + sub-collections: `branches`, `departments`, `positions`, `employees`,
`roleAssignments`, `devices`, `geofences`, `shifts`, `shiftAssignments`, `punches`,
`attendanceDays`, `regularizations`, `leaveTypes`, `leavePolicies`, `leaveBalances`,
`leaveRequests`, `holidayCalendars`, `salaryComponents`, `salaryStructures`,
`employeeSalaries`, `payrollRuns`, `payslips`, `announcements`, `documents`, `auditLogs`,
`notifications`. Composite indexes on `(employeeId, date)`, `(status, updatedAt)`, `(updatedAt)`.

---

## 5. REST API v1 (summary)

Base: `https://api.worktrack.app/v1` · Auth: `Authorization: Bearer <Firebase ID token>` ·
Idempotency: `Idempotency-Key` header honored on all POSTs · Errors: RFC 7807 problem+json ·
Pagination: cursor-based `?cursor&limit` · Envelope: `{ "data": …, "meta": { cursor } }`.

| Area | Endpoints |
|---|---|
| Session | `GET /me` (profile + roles + company), `POST /devices` (bind), `DELETE /devices/{id}` |
| Org | CRUD `/branches`, `/departments`, `/positions`, `/employees`; `POST /employees/{id}/deactivate` |
| Attendance | `POST /attendance/punches` (validate + persist), `GET /attendance/punches`, `GET /attendance/days?from&to&employeeId`, `POST /attendance/regularizations`, `POST /attendance/regularizations/{id}/decide` |
| Shifts | CRUD `/shifts`; `GET/PUT /rosters?branchId&from&to`; `POST /shift-swaps`, `POST /shift-swaps/{id}/decide` |
| Leave | `GET /leave/types`, `GET /leave/balances?employeeId`, `POST /leave/requests`, `GET /leave/requests`, `POST /leave/requests/{id}/decide`, `POST /leave/requests/{id}/cancel` |
| Payroll | `GET /payroll/runs`, `POST /payroll/runs` (async calc via Cloud Tasks), `POST /payroll/runs/{id}/approve`, `GET /payslips?employeeId&year`, `GET /payslips/{id}` |
| Comms | `GET/POST /announcements`, `GET /notifications`, `POST /notifications/{id}/read` |
| Analytics | `GET /analytics/kpis?scope&period`, `GET /analytics/insights` |
| Audit | `GET /audit-logs?resourceType&from&to` |
| Sync | `POST /sync/push` (batched outbox ops), `GET /sync/pull?types&cursor` (delta) |

QR kiosk flow: kiosk displays rotating TOTP QR (`kioskId`, 30s window, HMAC signed);
employee app scans → `POST /attendance/punches {method:QR, kioskToken}` → server verifies
signature + window + kiosk branch vs employee branch.

---

## 6. Android application

### 6.1 Module graph

```
app
 ├── feature:auth        feature:dashboard   feature:attendance
 ├── feature:leave       feature:payslips    feature:profile
 │        (feature:* → core:domain, core:designsystem, core:common)
 ├── core:data ──▶ core:database, core:network, core:datastore, core:domain, core:model
 ├── core:sync ──▶ core:data (workers, outbox processor, scheduling)
 ├── core:domain ──▶ core:model, core:common     (use cases + repository contracts)
 ├── core:database / core:network / core:datastore ──▶ core:model, core:common
 └── core:designsystem (M3 theme + components)   core:common (Result, dispatchers, time)
```

Build logic lives in `build-logic/` convention plugins:
`worktrack.android.application`, `worktrack.android.library`,
`worktrack.android.library.compose`, `worktrack.android.feature`, `worktrack.android.hilt`,
`worktrack.android.room`.

### 6.2 Navigation

Root: `AuthGraph` (Login → ForgotPassword → DeviceBinding) → `MainGraph`.
Main scaffold: bottom bar with **Dashboard**, **Attendance**, **Leave**, **Profile**;
nested destinations: attendance history, punch flow (GPS/QR), leave apply/detail,
approvals inbox (role-gated), payslip list/detail, announcements, settings.
Deep links: `worktrack://leave/requests/{id}`, `worktrack://payslips/{id}`, `worktrack://approvals`.

### 6.3 Offline & sync (client contract)

1. All reads come from Room (`Flow`-based DAOs → repositories → use cases → UI state).
2. Mutations write Room optimistically (+`syncStatus=PENDING`) and enqueue an `OutboxEntry` with a ULID `idempotencyKey`.
3. `SyncWorker` (WorkManager, network-constrained, exponential backoff, unique work) drains the outbox FIFO-per-resource, then delta-pulls per resource cursor.
4. Server responses reconcile local rows (`syncStatus=SYNCED`, server fields win).
5. Punches are append-only: no update/delete ops exist client-side.
6. Conflict policy: server-authoritative; rejected ops surface as actionable notifications, never silent data loss.

---

## 7. Security requirements (summary)

- Firebase Auth + short-lived ID tokens; refresh handled by SDK; custom claims for tenant/RBAC.
- Server middleware chain: verify token → load tenant context → RBAC permission check → handler; deny-by-default.
- Firestore security rules: **no direct client access** to server-authoritative collections (all writes via API); rules act as second line of defense.
- Device binding + Play Integrity verdict required for punch endpoints; mock-location detection on-device (`isMock`) + server plausibility checks (speed-of-travel).
- Data: TLS 1.2+, at-rest encryption (Google-managed), tokens in EncryptedSharedPreferences/Keystore, no PII in logs, structured audit log for every privileged mutation.
- Face templates: stored as embeddings (not photos) in Cloud Storage with CMEK option; verification threshold server-tunable; raw capture deleted after embedding.
- Compliance posture: GDPR (DSR endpoints, retention policies), SOC 2 controls mapped in `07-security-architecture.md`.

---

## 8. Delivery phases

- **P0 (this repo, implemented)**: Android foundation — build-logic, core modules (common/model/database/network/datastore/domain/data/sync/designsystem), features (auth, dashboard, attendance, leave, payslips, profile), backend API core (auth/tenant/RBAC middleware, attendance punch + validation, leave requests + decisions, sync push/pull, payslip read), Firestore rules, full design docs.
- **P1**: Shift rosters UI, regularization, approvals inbox, face verification, kiosk app mode.
- **P2**: Payroll calculation engine + runs UI, statutory packs, document vault.
- **P3**: Web Admin SPA, analytics dashboards, BigQuery pipeline.
- **P4**: AI insights, attrition/absence prediction, anomaly detection, open APIs + webhooks.

Details in `09-roadmap.md`.
