# WorkTrack — Smart Workforce & Attendance Management

**ورک‌ترک — مدیریت هوشمند نیروی کار برای افغانستان.** پلتفرم به زبان‌های **دری**
(پیش‌فرض) و **پښتو** و انگلیسی است؛ تاریخ‌ها و دوره‌های معاش بر اساس تقویم
**هجری شمسی** با نام ماه‌های افغانستان (حمل، ثور، جوزا…) نمایش داده می‌شود و رخصتی
هفته‌وار روز جمعه است.

WorkTrack is a multi-tenant Workforce Management Platform (HRMS) **built for
Afghanistan**: attendance with GPS geofencing and kiosk QR check-in, shift
scheduling, leave management with approval chains, payroll, announcements,
analytics, and enterprise-grade security — designed for organizations from small
teams to 100,000+ employees. Dari is the default language (full Pashto and English
translations, RTL-first UI), and all dates/payroll periods use the Solar Hijri
calendar — see `docs/10-localization-afghanistan.md`.

**Two products, one backend.** Each company self-registers and gets its own
isolated workspace (multi-tenant):

| Product | Audience | Where |
|---|---|---|
| **Company Console** | managers, HR, payroll | web portal (`web/`) — dashboard, employees, attendance, leave, payroll |
| **Employee App** | employees | Android app (`app/`) — attendance, leave, payslips |

To take it live, see **[docs/12-production-deployment.md](docs/12-production-deployment.md)**.
To try it locally with sample data, see **[docs/11-local-demo-setup.md](docs/11-local-demo-setup.md)**.

## Repository layout

| Path | Contents |
|---|---|
| `docs/` | Complete design documentation (start at `docs/00-master-spec.md`) |
| `app/`, `core/`, `feature/` | Android app — Kotlin, Jetpack Compose (M3), MVVM + Clean Architecture, Hilt, Room, WorkManager, offline-first sync |
| `build-logic/` | Gradle convention plugins shared by all modules |
| `backend/` | Firebase backend — REST API v1 on Cloud Functions (TypeScript/Express), Firestore rules and indexes |
| `web/` | Manager portal (web admin) — React + TypeScript + Vite, Dari/Pashto/English, Solar Hijri (see `web/README.md`) |

## Design documentation

1. [Master specification (source of truth)](docs/00-master-spec.md)
2. [Product requirements](docs/01-product-requirements.md)
3. [System architecture](docs/02-system-architecture.md)
4. [Database design & ER diagrams](docs/03-database-design.md)
5. [REST API design](docs/04-api-design.md)
6. [Android architecture & navigation](docs/05-android-architecture.md)
7. [Web admin console design](docs/06-web-admin-design.md)
8. [Security architecture](docs/07-security-architecture.md)
9. [Offline-first sync strategy](docs/08-sync-strategy.md)
10. [Development roadmap](docs/09-roadmap.md)
11. [Afghanistan localization (دری/پښتو, Solar Hijri)](docs/10-localization-afghanistan.md)
12. [Local demo setup — run everything with sample data](docs/11-local-demo-setup.md)
13. [Production deployment — take it live](docs/12-production-deployment.md)
14. [Operations runbook — diagnosing and repairing a live system](docs/13-operations-runbook.md)

## Android app

Module graph (details in `docs/05-android-architecture.md`):

```
app → feature:{auth,dashboard,attendance,leave,payslips,profile}
    → core:{data,sync} → core:{database,network,datastore} → core:{domain,model,common}
    → core:designsystem
```

Key properties:

- **Offline-first**: Room is the local source of truth; mutations queue in an outbox
  with ULID idempotency keys and sync via WorkManager (`core/sync`). Punches are
  append-only; the server is authoritative for balances, attendance days, payroll.
- **Attendance**: GPS punch with client+server geofence validation, mock-location
  rejection, kiosk TOTP QR scanning (CameraX + ML Kit), monthly history.
- **Leave**: balances, apply flow with half-days, approver inbox with approve/reject.
- **Security**: Firebase Auth ID tokens, tenant/RBAC custom claims, no tokens stored
  outside the Firebase SDK, cloud backup disabled for tenant data.

### Building

Prerequisites: JDK 17+, Android SDK 35. The Gradle wrapper is pinned (8.9).

```bash
./gradlew :app:assembleDebug
./gradlew test                       # JVM unit tests (domain/common)
```

### Firebase setup (required to run the app)

The app authenticates with Firebase, so it needs a `google-services.json`. Without
it the app still launches to the login screen, but sign-in fails. To wire it up:

1. Create a Firebase project at <https://console.firebase.google.com>.
2. Add Android app(s) to it. **The debug build's application id is
   `app.worktrack.debug`** (the `.debug` suffix is added by the debug build type),
   so register that package name to run debug builds. Add `app.worktrack` too for
   release builds — both clients end up in the same `google-services.json`.
3. Download `google-services.json` and put it in the **`app/`** directory
   (`WorkTrack/app/google-services.json`). The Google Services Gradle plugin is
   applied automatically when the file is present (see the bottom of
   `app/build.gradle.kts`), which generates the default `FirebaseOptions` that
   `FirebaseApp` initializes from at startup.
4. In the Firebase console, enable **Authentication → Sign-in method →
   Email/Password**.
5. Rebuild and run.

The file is git-ignored (it's per-environment config). Debug builds point the API
at the local Functions emulator (`app/build.gradle.kts` → `API_BASE_URL`); run the
backend emulator (see below) and provision a tenant to sign in end-to-end.

## Backend

```bash
cd backend/functions
npm install
npm run typecheck        # strict TypeScript
npm run serve            # Firebase emulators: functions + firestore + auth
```

- REST API v1 (Express on Cloud Functions v2): `me`, `attendance` (punch validation:
  geofence, kiosk HMAC token, speed-of-travel plausibility), `leave` (transactional
  balance reservation + approval chain), `payslips`, `announcements`, and the
  sync protocol (`POST /sync/push`, `GET /sync/pull` with per-type delta cursors).
- Firestore rules deny all direct client access — every read/write goes through the
  API (deny-by-default RBAC middleware, RFC 7807 errors, audit log on privileged ops).
- Kiosk QR secret: `firebase functions:secrets:set KIOSK_HMAC_SECRET`.

## Provisioning a tenant (P0)

1. Create `companies/{cid}` with `name`, `timezone`, `currency`.
2. Create `companies/{cid}/employees/{eid}` documents and geofences/shifts/leaveTypes.
3. Create the Firebase Auth user and set custom claims
   `{ cid, eid, r: ["EMPLOYEE"], b: [branchIds] }` (Admin SDK).
4. Sign in from the app — session bootstraps via `GET /v1/me`, then full sync runs.

## Roadmap

P0 (this repository) is the foundation described above. P1–P4 add rosters UI,
regularization, face verification and kiosk mode, the payroll engine, the React
web admin, BigQuery analytics, and AI insights — see `docs/09-roadmap.md`.
