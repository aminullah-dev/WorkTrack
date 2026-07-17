# WorkTrack — Web Admin Console Design

Version: 1.0 · Status: Approved · Derives from: `00-master-spec.md` (§1.1, §2, §5, §8 Phase P3) · Companion: `07-security-architecture.md`

**Purpose.** This document specifies the WorkTrack Web Admin Console: a React 18 + TypeScript single-page application served from Firebase Hosting that consumes the same versioned REST API (`https://api.worktrack.app/v1`) as the Android app. It defines the information architecture and role-based navigation for admin personas, screen-by-screen functional specs, and the frontend engineering standards — state management, RBAC-driven UI gating, large-table virtualization, optimistic update policy, accessibility, and internationalization. Implementation is roadmap Phase P3; this design is final and binding for that phase.

---

## 1. Platform and stack

| Concern | Decision |
|---|---|
| Framework | React 18 + TypeScript (strict), Vite build, SPA with client-side routing (React Router) |
| Hosting | Firebase Hosting; `/**` rewrite to `index.html`; immutable hashed assets; API is **not** proxied — the SPA calls `https://api.worktrack.app/v1` directly with CORS |
| Identity | Firebase Auth Web SDK (same tenant claims `{ cid, r, b, eid }` as Android); ID token attached as `Authorization: Bearer` by a fetch wrapper that refreshes via the SDK before expiry |
| Server state | TanStack Query v5 (see §5) |
| URL state | Route params + search params as the single source of truth for filters, pagination cursors, selected entities, wizard steps |
| Client state | Minimal: a small Zustand store for session context (claims, permission set, feature flags) and UI chrome (sidebar collapsed, density); everything else is server or URL state |
| Design system | WorkTrack Web DS: token-compatible with the Android M3 theme (same color roles, type ramp, spacing scale); components built on Radix primitives for accessibility |
| Errors | RFC 7807 `problem+json` parsed centrally; `type` mapped to user-facing messages and remediation hints |
| Testing | Vitest + React Testing Library (components), MSW fake API (integration), Playwright (E2E per persona), axe-core in CI |

The SPA is **online-only** (admin workflows are connectivity-assumed); TanStack Query caching provides resilience to transient failures, but there is no outbox/offline mode — that is an Android-only contract (master spec §6.3).

## 2. Personas and information architecture

Admin console personas (master spec §1.1): `COMPANY_ADMIN`, `HR_ADMIN`, `PAYROLL_ADMIN`, `BRANCH_MANAGER`, `AUDITOR`. (`SUPER_ADMIN` uses an internal ops console outside this document; `EMPLOYEE`/`TEAM_LEAD`/`KIOSK` do not sign in here — the console rejects sessions holding none of the admin roles.)

### 2.1 Sidebar navigation tree

```
Dashboard
Org
 ├── Branches
 ├── Departments
 └── Positions
Employees
 ├── Directory
 └── Onboarding (P2: checklists)
Attendance
 ├── Live Board
 ├── Exceptions Queue
 └── Regularizations
Rosters
 ├── Planner
 └── Swap Requests
Leave
 ├── Approvals
 ├── Requests
 └── Balances
Payroll
 ├── Runs
 ├── Payslips
 └── Salary Structures
Announcements
Documents
Audit
Settings
 ├── Company Profile
 ├── Branches & Geofences
 ├── Shifts
 ├── Leave Policies
 ├── Salary Components
 ├── Holiday Calendars
 └── Roles & Permissions
```

### 2.2 Role → navigation visibility matrix

Visibility mirrors the server permission catalog (`07-security-architecture.md` §4); the sidebar renders only sections for which the session holds at least one required permission. ✔ = full, ◐ = scoped/partial, — = hidden.

| Section | COMPANY_ADMIN | HR_ADMIN | PAYROLL_ADMIN | BRANCH_MANAGER | AUDITOR |
|---|---|---|---|---|---|
| Dashboard | ✔ | ✔ | ✔ (payroll KPIs) | ◐ own branches | ✔ read-only |
| Org | ✔ | ✔ | — | ◐ read own branches | ✔ read-only |
| Employees | ✔ | ✔ | ◐ read + salary tab | ◐ own branches, no salary | ✔ read-only, no salary |
| Attendance | ✔ | ✔ | ◐ read (payroll inputs) | ◐ own branches | ✔ read-only |
| Rosters | ✔ | ✔ | — | ◐ own branches (primary user) | ✔ read-only |
| Leave | ✔ | ✔ | ◐ read (LOP inputs) | ◐ own branches | ✔ read-only |
| Payroll | ✔ | ◐ inputs only, no approve | ✔ | — | ✔ read-only |
| Announcements | ✔ | ✔ | — | ◐ own-branch audience | ✔ read-only |
| Documents | ✔ | ✔ | — | ◐ own branches | ✔ read-only |
| Audit | ✔ | ◐ own actions area | ◐ payroll resources | — | ✔ (primary user) |
| Settings | ✔ | ◐ leave policies, holidays | ◐ salary components | — | ✔ read-only |

`BRANCH_MANAGER` scoping: every list/query the console issues for a branch-scoped session carries `branchId` filters constrained to the `b` claim; the server re-enforces regardless (scope narrowing, `07-security-architecture.md` §4.3). `AUDITOR` sees read-only variants of every screen: all mutating controls are removed (not merely disabled), and export actions are audit-logged.

### 2.3 Global chrome

- **Top bar**: company switcher (only for users holding roles in multiple companies — re-authenticates to swap `cid` claims), global search (employees by name/code — `GET /employees?q=`), notification bell (`GET /notifications`), session menu.
- **Breadcrumbs** on every screen below the top level; entity IDs in breadcrumbs are copyable ULIDs.
- **Environment banner** on non-production origins.

## 3. Screen specifications

Every screen defines the four canonical states. Unless overridden below: **Loading** = skeleton matching final layout (no spinners for > 300 ms content, no layout shift); **Empty** = illustration + one-line explanation + primary CTA (hidden if the user lacks the CTA permission); **Error** = inline problem card with `problem+json` title, correlation id, and Retry (refetch); table row-level failures never blank the whole screen.

### 3.1 Analytics dashboard (`/dashboard`)

- **Purpose**: at-a-glance workforce health for the persona's scope; entry point to exceptions needing action.
- **Data**: `GET /analytics/kpis?scope&period`, `GET /analytics/insights`, pending counts from `GET /leave/requests?status=PENDING&limit=1` (meta count) and attendance exceptions.
- **Components**: KPI stat row (headcount, present today, absent, on leave, late %, pending approvals, payroll days-to-cutoff); trend charts (attendance % 30d, overtime minutes by branch, leave consumption vs accrual); AI insights panel (absenteeism risk, overtime anomaly, attrition signals — each card links to the filtered underlying list and carries a "why am I seeing this" explainer); action queue (top 5 approvals inline-decidable).
- **Primary actions**: period selector (URL param `?period=`), scope selector (company/branch — gated by role), drill-through to filtered screens.
- **States**: per-widget loading/error isolation (one failed widget shows a compact retry card, the rest render); empty insights = "No anomalies detected for this period".

### 3.2 Employee directory (`/employees`) + profile (`/employees/:employeeId`)

- **Purpose**: find, inspect, and manage the employee lifecycle.
- **Directory**: virtualized table (§6) over `GET /employees` (cursor pagination, server filters: branch, department, position, status, employmentType, `q`). Columns: code, name+avatar, branch, department, position, status chip, joinDate. Toolbar: filters (all in URL), column chooser, CSV export (server-side job for > 10k rows), "Add employee" (`employee:create`). Row click → profile. Bulk select → assign shift, move branch (each a confirmed batch mutation with per-row result report).
- **Profile tabs**: Overview (identity, org placement, manager chain), Attendance (embedded `GET /attendance/days?employeeId&from&to` month grid), Leave (balances `GET /leave/balances?employeeId` + request history), Payroll (visible only with `payroll:read` — `EmployeeSalary` history + payslips), Documents (`EmployeeDocument` list, upload/verify), Devices (bound devices, revoke via `DELETE /devices/{id}`), Roles (RoleAssignments — `role:assign` only).
- **Primary actions**: edit profile, deactivate (`POST /employees/{id}/deactivate` with exit-date dialog and downstream-impact summary: open approvals, roster slots, payroll inclusion), reset device binding.
- **States**: directory empty = onboarding CTA "Import employees" ; profile 404 = "Employee not found in {company}" with back-to-directory.

### 3.3 Roster planner (`/rosters/planner?branchId&week`)

- **Purpose**: build and publish weekly shift rosters per branch (primary `BRANCH_MANAGER` surface).
- **Data**: `GET /rosters?branchId&from&to` (roster grid), `GET /shifts` (palette), employee list for the branch.
- **Components**: week grid — rows = employees (virtualized), columns = 7 days; cell = `ShiftAssignment` chip (shift code + color, `source` glyph for ROSTER/ROTATION/MANUAL/SWAP); left panel shift palette; drag-and-drop assign/move/copy (keyboard equivalent: cell focus + palette picker, §7); conflict badges computed client-side and re-validated server-side (double assignment, leave overlap, night-shift rest-period rule); coverage footer per day (assigned vs required headcount); copy-last-week; unpublished-changes tray.
- **Primary actions**: edit cells (buffered locally), **Publish** = single `PUT /rosters?branchId&from&to` with the week's assignment set and `Idempotency-Key`; discard draft. Publish is blocked while hard conflicts exist.
- **States**: unpublished-draft banner with count; publish partial failure → per-cell error markers and the response's problem detail; week with no roster = "Start from shift rotation" / "Copy previous week" CTAs; roster locked (Cloud Scheduler lock, master spec §2) = read-only banner with lock timestamp.

### 3.4 Attendance monitoring (`/attendance/live`, `/attendance/exceptions`)

- **Live Board**: near-real-time presence for the selected scope. Data: `GET /attendance/days?from=today&to=today` + recent `GET /attendance/punches`, polled every 60 s (TanStack Query `refetchInterval`; no websockets in P3). Components: status summary chips (present/absent/late/on-leave/not-yet-in vs shift), virtualized employee grid with last punch time/method/insideFence flag, branch/shift filters, punch-detail drawer (map snippet with punch point vs geofence circle, method, device, `serverValidated`, `invalidReason`). Read-only; `attendance:read` scope-filtered.
- **Exceptions Queue**: actionable list of invalid or suspicious records: punches with `serverValidated=false` or `invalidReason` set (out-of-fence, integrity failure, mock location, speed-of-travel — `07-security-architecture.md` §6), missing OUT punches, `AttendanceDay.status=PENDING`. Grouped by exception type; each row: employee, timestamp, evidence panel, actions **Approve as valid** / **Reject** / **Request regularization** (each `attendance:approve`, each writes an audit log). Bulk approve limited to same exception type ≤ 50 rows.
- **Regularizations** (`/attendance/regularizations`): pending `RegularizationRequest` list → detail with requested vs recorded times diff → `POST /attendance/regularizations/{id}/decide`.
- **States**: live board outside working hours = subdued "No active shifts right now"; exception queue empty = positive empty state ("No exceptions — everything checks out"); poll failure = stale-data banner with last-updated timestamp, board keeps rendering cached data.

### 3.5 Leave approvals (`/leave/approvals`)

- **Purpose**: decide pending leave requests at company/branch scope (multi-level chains).
- **Data**: `GET /leave/requests?status=PENDING` (+ scope filters); decision via `POST /leave/requests/{id}/decide`.
- **Components**: queue list (requester, type chip with `colorHex`, dates + day count incl. half-day glyphs, waiting-since, chain position "step 2 of 3"); detail drawer: reason, attachment viewer (`requiresAttachment` types), requester's balance snapshot (`LeaveBalance` incl. `pendingDays`), team-coverage calendar for the request window (who else is off), policy verdict panel (notice period, max consecutive, balance sufficiency — server-computed, surfaced verbatim); approve/reject with mandatory comment on reject.
- **Primary actions**: decide single; bulk approve (only requests with green policy verdicts, ≤ 25); reassign approver (`COMPANY_ADMIN`/`HR_ADMIN`).
- **States**: decision conflict (already decided elsewhere / on mobile) → 409 handled by removing the row with an info toast, never double-applying; empty = "Queue clear".

### 3.6 Payroll run wizard (`/payroll/runs/new`, resumable at `/payroll/runs/:runId`)

Five steps mapped to `PayrollRun.status` (`DRAFT → CALCULATING → REVIEW → APPROVED → PAID|CLOSED`); the wizard is resumable — reopening a run routes to the step implied by its status. Step state lives in the URL (`?step=`) and the run resource, never in component memory.

| Step | Name | Contents | Exit criteria |
|---|---|---|---|
| 1 | **Scope** | Period (year/month), branch multi-select (`branchIds`), included-employee preview count with exclusions list (joined mid-period, exited, missing `EmployeeSalary`) | `POST /payroll/runs` creates DRAFT |
| 2 | **Inputs** | Readiness checklist: attendance days finalized (no `PENDING` in period), leave/LOP applied, overtime totals, unapproved regularizations blocking; per-item drill-through links; ad-hoc input adjustments (bonus/deduction rows) | All blocking checks green or explicitly waived (`payroll:run`, waiver audited) |
| 3 | **Calculate** | Triggers async calculation (Cloud Tasks, master spec §5); progress panel polls run status while `CALCULATING` (N of M payslips); cancel returns to DRAFT | Server sets REVIEW |
| 4 | **Review** | Totals vs previous period (gross/net/deductions variance % with configurable alert threshold), per-employee payslip table (virtualized) with drill-in to `PayslipLine`s, anomaly flags (net < 0, > X% swing, missing components), recalculate-subset action | Reviewer marks reviewed |
| 5 | **Approve** | Summary card, mandatory re-authentication (recent Firebase sign-in), typed confirmation of period, `POST /payroll/runs/{id}/approve`; post-approve: payslip publication + PDF generation status, mark PAID | Run APPROVED; wizard becomes read-only record |

- **RBAC**: steps 1–4 require `payroll:run`; step 5 requires `payroll:approve`, and the approver must differ from `startedBy` (segregation of duties, enforced server-side — `07-security-architecture.md` §2). HR_ADMIN sees steps 1–2 contribution views only.
- **States**: CALCULATING failure → step 3 shows the job's problem detail with "Retry calculation"; a run locked (`lockedAt`) renders the whole wizard read-only with the lock reason.

### 3.7 Audit log explorer (`/audit`)

- **Purpose**: forensic, filterable view of the append-only `AuditLog` (primary `AUDITOR` surface).
- **Data**: `GET /audit-logs?resourceType&from&to` (+ actor, action, resourceId filters), cursor pagination.
- **Components**: filter bar (all URL-backed: time range with presets, actor picker, action, resourceType, resourceId); virtualized result table (at, actor + role, action, resource link, ip); detail drawer with **before/after JSON diff** viewer (side-by-side, changed keys highlighted, PII fields render redacted per classification — `07-security-architecture.md` §7.3); export to CSV (audited); saved filter sets (local).
- **States**: over-broad query (> 30 days, no filter) prompts narrowing before fetch; empty = "No audit events match"; explorer is strictly read-only for every role — there is no mutating action on this screen by design.

### 3.8 Company settings (`/settings/*`)

- **Company Profile**: name, legalName, timezone, currency (currency change requires typed confirmation and is blocked while any non-CLOSED payroll run exists), plan display.
- **Branches & Geofences**: branch CRUD (`/branches`); per-branch geofence editor — interactive map with draggable center pin and radius handle bound to `lat/lng/radiusM` (min radius 50 m, warning under 100 m for GPS accuracy), address search, multiple `Geofence` rows per branch with active toggles; changes affect punch validation immediately — the save dialog states this and links affected shift population count.
- **Shifts**: `Shift` CRUD; start/end with overnight (`isNight`) handling, break/grace minutes, `overtimePolicyJson` edited through a structured form (threshold, multiplier, rounding) — never raw JSON; deactivation blocked while future `ShiftAssignment`s reference the shift (offer bulk-reassign).
- **Leave Policies**: `LeaveType` CRUD (color, paid, attachment-required) and `LeavePolicy` per type (accrualRule NONE/MONTHLY/YEARLY/ANNIVERSARY, accrualDays, maxBalance, maxCarryover, minNoticeDays, maxConsecutiveDays, appliesTo audience builder); simulation panel: "for employee X, next accrual on date Y grants Z days"; policy edits apply prospectively — banner clarifies no retroactive rebalancing without an explicit HR tool.
- **Salary Components**: `SalaryComponent` CRUD (EARNING/DEDUCTION/EMPLOYER_COST; calc FIXED/PERCENT_OF_BASIC/PERCENT_OF_GROSS/FORMULA with a validated formula editor — known variables, live preview against a sample salary), `taxable`, `statutoryCode`; `SalaryStructure` composer (ordered component list, preview payslip); components used by any non-CLOSED run are edit-locked.
- **Holiday Calendars**: per-year calendars, branch mapping (`branchIds`), optional-holiday flags; import national presets.
- **Roles & Permissions**: role catalog (built-in read-only + custom roles), permission-set editor grouped by resource, `RoleAssignment` management with scopeType COMPANY/BRANCH/DEPARTMENT; every change here is highlighted as audited and takes effect on next token refresh (`07-security-architecture.md` §3.3).

All settings mutations are confirmed (destructive ones with typed confirmation), audited, and follow the pessimistic write policy (§5.3).

### 3.9 Announcements (`/announcements`)

- **Purpose**: publish and manage company/branch communications (`Announcement` entity).
- **Data**: `GET /announcements` (list incl. scheduled/expired with status filter), `POST /announcements` (`announcement:publish`).
- **Components**: list table (title, audience summary, priority, publishAt, expiresAt, createdBy, delivery state); composer drawer — title, rich-text-lite body (bold/lists/links only), audience builder producing `audienceJson` (company-wide / branches / departments / employment types, with live recipient-count preview), `publishAt` scheduler, optional `expiresAt`, priority (NORMAL/HIGH — HIGH triggers push notification, stated in the composer).
- **Primary actions**: publish now, schedule, edit-before-publish (published announcements are immutable — corrections publish a follow-up), expire early.
- **States**: recipient count of zero blocks publish with audience-fix hint; scheduled items show countdown; `BRANCH_MANAGER` composer locks audience to own branches.

### 3.10 Documents (`/documents`, and per-employee tab in §3.2)

- **Purpose**: manage `EmployeeDocument` records (contracts, IDs, certificates) with verification workflow.
- **Data**: document list per employee (or company-wide expiring-documents view), upload via API-issued signed URL, verify action setting `verifiedBy`.
- **Components**: expiring-soon dashboard strip (documents with `expiresAt` within 90/30/7 days, filterable by kind/branch); per-employee document table (kind, name, size, mime icon, expiry chip, verified badge with verifier); upload dropzone (type/size validation client-side, virus-scan status from server before the row becomes downloadable); in-browser preview for PDF/images via short-lived signed URLs — never long-lived public links.
- **Primary actions**: upload (`document:write`), verify (`document:verify`, requires viewing the document first — the verify button unlocks after preview open), replace (versioned; prior version retained per retention policy), delete (typed confirmation, audited).
- **States**: quarantined upload (scan pending/failed) shows a non-downloadable row with status; empty per-employee = checklist of expected kinds from the onboarding template (P2).

## 3.11 Cross-screen interaction standards

- **Drawers over full navigations** for detail/inspect flows (exception detail, leave detail, audit entry) — the underlying list keeps its scroll and filter state; the drawer's open state and subject id live in the URL so it survives refresh and is shareable.
- **Confirmation tiers**: (1) plain confirm dialog for reversible actions; (2) consequence-summary dialog (shows affected counts) for cascading actions; (3) typed confirmation (entity name or period) for destructive/financial actions — deactivate employee, approve payroll run, change currency, delete document.
- **Date handling controls**: every date-range filter offers presets (today, this week, this month, last month, custom); custom ranges over 92 days on heavy endpoints (attendance days, audit) require explicit "run large query" acknowledgment.
- **Toasts** confirm completed mutations with an undo affordance only where a true inverse operation exists (never for payroll/roster publish); all toasts are announced via the polite live region (§6).

## 4. Routing and URL state

- Route tree mirrors §2.1; every screen's *complete* view state — filters, search text (debounced), cursor, sort, selected row id, wizard step, drawer open — is encoded in search params via a typed `useUrlState` hook (schema-validated, defaults elided). Guarantees: deep-linkable, refresh-safe, back/forward-correct, shareable between admins ("look at this exception").
- Route guards: `RequireRole` / `RequirePermission` wrappers redirect unauthorized entries to Dashboard with a toast; guard config is generated from the same permission catalog constants the sidebar uses.

## 5. Server-state management

### 5.1 TanStack Query conventions

- **Query keys** are structured tuples: `['employees', cid, filters]`, `['leave', 'requests', cid, filters]`, `['payroll', 'runs', cid, runId]`. `cid` in every key makes company switch a cache-namespace switch (plus `queryClient.clear()` on switch for defense in depth).
- **Cursor pagination** via `useInfiniteQuery`; `meta.cursor` from the API envelope is the page param.
- **Freshness tiers**: live board `staleTime: 0` + 60 s `refetchInterval`; queues/lists 30 s; reference data (shifts, leave types, components) 15 min; analytics 5 min. `refetchOnWindowFocus` on for queues, off for wizards.
- **Mutations** invalidate the narrowest sufficient keys; decision mutations also update the detail record from the response body to avoid a refetch flash.
- 401 → single token refresh retry then sign-out; 403 → permission-drift handler (refetch `GET /me`, recompute gating, toast "Your access changed"); 429/5xx → capped exponential backoff, max 3 (never for mutations without an idempotency key — the fetch wrapper attaches `Idempotency-Key` (ULID) to every POST per master spec §5, so mutation retries are safe).

### 5.2 RBAC-driven UI gating

- `GET /me` returns profile + roles + permission strings; a `can(permission, scope?)` helper backs a `<Can permission="payroll:approve">` component and hook.
- Policy: controls the user can never use are **removed**; controls unavailable due to state (locked run, hard conflicts) are **disabled with a reason tooltip**. Gating is UX only — the server is authoritative (master spec §1.1) — so every mutating call still handles 403 gracefully.

### 5.3 Optimistic updates policy

| Class | Policy | Examples |
|---|---|---|
| Local-feel toggles, low blast radius | Optimistic (`onMutate` cache patch, rollback `onError` with toast) | notification read, saved filters, sidebar prefs, announcement draft edits |
| Queue decisions | **Pessimistic-fast**: row enters "deciding…" state, removed only on 2xx; 409 removes with "already decided" info | leave decide, regularization decide, exception approve |
| Money / compliance / structural | **Strictly pessimistic**: blocking confirm, spinner on the action only, no cache mutation until 2xx | payroll anything, salary edits, roster publish, geofence/policy changes, deactivation, role changes |

Rationale: admins act on other people's records with financial consequence; a rolled-back "approved" that the admin already believed is worse than 400 ms of latency.

### 5.4 Virtualization for 100k-employee tenants

- All unbounded tables (directory, live board, payslip review, audit) use TanStack Virtual with fixed row height (48 px default / 40 px dense); windowed rendering keeps DOM < 100 rows regardless of dataset.
- Data windowing: `useInfiniteQuery` pages of 200; scroll position prefetches the next page at 75% depth; total counts come from `meta` when the API can provide them cheaply, else "10,000+" style indeterminate counts.
- Never client-side filter/sort over the full population: filters and sorts are server parameters (URL-backed). Client-side operations are permitted only within an already-scoped page (e.g. roster week grid for one branch).
- Roster grid virtualizes rows (employees) and keeps 7 day-columns static; drag interactions use overlay positioning to stay virtualization-safe.

## 6. Accessibility (WCAG 2.1 AA)

- **Keyboard**: every interaction reachable without a pointer — including roster drag-and-drop (cell focus, Enter opens shift picker, arrow-key move mode with live announcements) and map geofence editing (numeric lat/lng/radius inputs always present beside the map).
- **Structure**: landmarks (`nav`, `main`, `header`), one `h1` per screen, skip-to-content link, focus management on route change (heading receives focus), focus trap + restore in drawers/dialogs (Radix).
- **Tables**: real `<table>` semantics preserved under virtualization (`aria-rowcount`/`aria-rowindex`), sortable headers with `aria-sort`, row actions in-tab-order.
- **Live regions**: polite announcements for async completions (calculation finished, N rows approved), poll refreshes silent.
- **Color**: 4.5:1 minimum contrast in both themes; status never conveyed by color alone (chips carry text/icons — e.g. leave type chips pair `colorHex` with the code); charts have accessible table alternatives ("view as data").
- **Forms**: label every control, `aria-describedby` errors, `problem+json` violations mapped to fields, error summary link-list on submit failure.
- **CI gate**: axe-core on every Playwright flow; new violations fail the build. Manual screen-reader pass (NVDA + VoiceOver) per release on the five highest-traffic screens.

## 7. Internationalization

- ICU MessageFormat catalogs (react-intl); default `en`; no hardcoded strings in components (lint-enforced). Pseudo-locale build for expansion/RTL smoke testing; layout is logical-properties-based (`margin-inline-start`) so RTL locales work without overrides.
- Dates/times render in the **company timezone** (from `Company.timezone`) with the viewer's locale formatting; timestamps show timezone hints when viewer locale ≠ company zone. All API exchange is UTC ISO-8601; date-only fields (roster dates, leave dates) are timezone-less calendar dates and are never shifted.
- Currency amounts format with `Company.currency` (`Intl.NumberFormat`); payroll never renders a bare number without its currency.
- Translatable server content (problem details, insight texts) arrives keyed with server-side interpolation values; the client maps keys through the same catalogs.

## 8. Performance budgets

| Metric | Budget | Enforcement |
|---|---|---|
| Initial JS (gzipped, entry + vendor) | ≤ 250 KB; route chunks lazy-loaded per sidebar section | CI bundle-size check fails PRs over budget |
| LCP on Dashboard (P75, corporate network) | ≤ 2.5 s | Lighthouse CI on every merge to main |
| Interaction latency: table scroll at 100k rows | 60 fps target, no frame > 50 ms | Playwright trace assertion on directory scroll scenario |
| Route transition (cached data) | ≤ 200 ms to first meaningful paint | TanStack Query cache-first rendering; skeleton only on cold cache |
| API chatter | No polling faster than 60 s; no duplicate in-flight queries (Query dedupe) | Code review + MSW test asserting request counts |

Charts lazy-load their rendering library; the map (geofence editor) loads only on its settings route. `React.memo`/stable-callback discipline is applied only where profiling shows re-render cost (virtualized rows, roster cells) — not speculatively.

## 9. Session lifecycle and error handling

- **Token refresh**: fetch wrapper refreshes the Firebase ID token when < 5 min from expiry; concurrent requests share one refresh promise.
- **Idle timeout**: configurable per tenant (default 30 min) — modal warning at T−2 min, then sign-out with return-URL preservation; hard cap 12 h regardless of activity for admin sessions.
- **Permission drift** (role changed mid-session): any 403 on a previously permitted action refetches `GET /me`, recomputes gating, and shows "Your access has changed"; the sidebar re-renders immediately (doc `07-security-architecture.md` §3.3).
- **Global error boundary** per route section: a crashed screen renders a recovery card (reload section / report) without unmounting the shell; errors ship to the client telemetry endpoint with release hash and `traceId` correlation to server logs — no PII in telemetry payloads.
- **Multi-tab consistency**: BroadcastChannel propagates sign-out and company switch across tabs; mutation invalidations rely on refetch-on-focus rather than cross-tab cache sync.

## 10. Shared component inventory

Console screens compose exclusively from the WorkTrack Web DS; screen code contains layout and wiring, not bespoke widgets.

| Component | Used by | Notes |
|---|---|---|
| `DataTable` | Directory, live board, payslip review, audit, requests | Virtualized (§5.4), URL-bound sort/filter, column chooser, selection model, a11y table semantics (§6) |
| `EntityDrawer` | All detail/inspect flows (§3.11) | URL-bound open state, focus trap, lazy content query |
| `FilterBar` | Every list screen | Schema-driven from the screen's `useUrlState` definition; renders chips, presets, clear-all |
| `StatusChip` | Attendance/leave/payroll/run statuses | Enum-mapped color+icon+label; never color-only (§6) |
| `KpiStat` / `TrendChart` | Dashboard, payroll review | Chart lib lazy-loaded; "view as data" table fallback |
| `AudienceBuilder` | Announcements, leave policy `appliesTo`, calendar branch mapping | Emits the canonical audience JSON; recipient-count preview query |
| `GeoMapEditor` | Branch geofences | Lazy route-level load; paired numeric inputs for a11y (§6) |
| `WizardShell` | Payroll run | Step state from URL + resource status; guards forward navigation on exit criteria (§3.6) |
| `JsonDiffViewer` | Audit detail | Side-by-side, key-level highlight, classification-aware redaction display |
| `ConfirmDialog` (3 tiers) | All mutations (§3.11) | Typed-confirmation variant for tier 3 |
| `PermissionGate` (`<Can>`) | Everywhere | Removes (not disables) unauthorized controls (§5.2) |
| `ProblemCard` / `EmptyState` / `SkeletonGroup` | Canonical states (§3) | problem+json mapping, correlation id display |

## 11. Testing strategy

| Level | Scope | Tooling / gate |
|---|---|---|
| Unit | `useUrlState` schema round-trips, `can()` gating logic, audience JSON builder, formatter utilities (currency/timezone) | Vitest; PR-blocking |
| Component | DS components incl. keyboard interaction contracts (roster cell picker, drawer focus trap), all four canonical states per screen shell | React Testing Library + axe-core assertions; PR-blocking |
| Integration | Screen ↔ API flows against MSW fake `/v1` (pagination, optimistic vs pessimistic mutation classes incl. 409/422 paths, permission-drift 403 handling, token refresh) | Vitest + MSW; request-count assertions (§8); PR-blocking |
| E2E per persona | One journey each: COMPANY_ADMIN settings edit, HR_ADMIN leave approval, PAYROLL_ADMIN full 5-step run, BRANCH_MANAGER roster publish, AUDITOR audit drill-down + export | Playwright against staging seed tenant; axe scan per page visited; release-blocking |
| Visual regression | DS components + dashboard/roster/wizard layouts, light+dark, LTR+RTL pseudo-locale | Playwright screenshots with checked-in goldens; PR-blocking on diff |

Seed data: a deterministic fixture tenant (3 branches, 250 employees, one closed + one draft payroll run, pending approvals in every queue) is rebuilt per E2E run so tests never depend on mutable shared state.
