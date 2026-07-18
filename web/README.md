# WorkTrack Manager Portal (پورتال مدیر)

Web admin console for managers, HR, payroll, and branch/team leads. React 18 +
TypeScript + Vite, consuming the same `/v1` REST API as the Android app. Dari is
the default language (full Pashto + English), RTL-first, with the Solar Hijri
calendar throughout.

## Features (P0)

- **Login** — Firebase email/password; only manager roles are admitted
  (`COMPANY_ADMIN`, `HR_ADMIN`, `PAYROLL_ADMIN`, `BRANCH_MANAGER`, `TEAM_LEAD`,
  `AUDITOR`). Employees/kiosks are rejected.
- **Dashboard** — today's KPIs (active, present, absent, on-leave, late, half-day,
  pending leave, attendance rate) + a 7-day Solar Hijri attendance trend.
- **Employees** — directory (branch-scoped for branch managers), search, and an
  add-employee form (`employees:write`).
- **Attendance monitoring** — per-day live board of every employee's status,
  first-in time, worked hours, and lateness; date picker in Solar Hijri.
- **Leave approvals** — pending-request queue with approve/reject (rejection
  requires a note, enforced server-side too).

RBAC gates the sidebar and actions client-side for UX; the server is authoritative.

## Develop

```bash
npm install
cp .env.example .env.local   # fill in Firebase web config + API base URL
npm run dev                  # http://localhost:5173
npm run build                # tsc + vite build -> dist/
```

`.env.local` needs your Firebase **web app** config (Project settings → Your apps →
Web) and `VITE_API_BASE_URL`. For local development point it at the Functions
emulator, e.g. `http://127.0.0.1:5001/<project-id>/us-central1/api/v1`.

## Deploy (Firebase Hosting)

Hosting is configured in `../backend/firebase.json` (serves `web/dist`, rewrites
`/v1/**` to the `api` function and everything else to the SPA):

```bash
npm run build
cd ../backend && firebase deploy --only hosting
```

When served from Hosting you can set `VITE_API_BASE_URL=/v1` so the SPA and API
share an origin (no CORS).
