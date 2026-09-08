# WorkTrack pricing sheet

For Linumic internal use. Not to be handed to a customer as-is.

This sheet does two things. First it says exactly what the software enforces
today, so you never sell something the code cannot deliver. Second it proposes
a rate card built only on those real levers, plus the promises you would have
to keep by hand.

Every price in this document is a proposal, not a validated market price. See
[Assumptions](#assumptions-read-before-you-quote-anyone).

---

## 1. What the code actually enforces

There is exactly one licence object per company, stored on the company document
under `license`. It is written only by
`backend/functions/src/scripts/set-license.ts`, run by you with project
credentials. There is deliberately no API endpoint to write it, so a customer
cannot change their own plan, seats, expiry or enforcement.

The licence has five fields (`backend/functions/src/services/license.ts`):

| Field | Values | What it actually does |
|---|---|---|
| `plan` | FREE / STANDARD / ENTERPRISE | **Nothing.** See below. |
| `deviceLimit` | 1–100,000 | Number of device seats. Enforced only when `enforceDevices` is true. |
| `status` | ACTIVE / SUSPENDED / EXPIRED | Anything but ACTIVE makes the licence unusable. |
| `expiresAt` | `YYYY-MM-DD` or null | Past date makes the licence unusable. Judged against the company's own Kabul date, not the server's. |
| `enforceDevices` | true / false | The master switch. When false, nothing above is enforced on day-to-day traffic. |

### `plan` is a label and nothing else

I searched the whole backend and the whole portal. `plan` is written, read, and
displayed. It is never used in a condition. Nothing branches on it — not a
feature, not a limit, not a route.

- Backend: only `services/license.ts` (store/read), `scripts/set-license.ts`
  (validate the string), and tests.
- Portal: `web/src/pages/DevicesPage.tsx` renders it as a read-only line on
  **Devices & licence**, translated via `dev_plan_free` / `dev_plan_standard` /
  `dev_plan_enterprise`.

So **you cannot price on feature tiers today.** If you sell "Enterprise gets
the Finance module", nothing stops a Standard customer turning Finance on
themselves. Price on the things below instead.

### The feature flags are the customer's, not yours

`settings.features` (shifts, leave, payroll, regularization, announcements,
geofencing, qrKiosk, faceRecognition, finance) lives in
`backend/functions/src/services/settings.ts`. `PUT /v1/settings` requires
`settings:write`, and COMPANY_ADMIN holds `*` — so the customer's own admin can
toggle every one of these under **Settings → Features** ("Choose which modules
are enabled for your company. A disabled module is hidden from the menu.").

That includes `faceRecognition`, which ships default OFF but is a checkbox the
customer can tick, and `finance`, which ships default ON.

Consequence: **no module can be withheld for non-payment or sold as a paid
add-on with any technical backing.** You may still sell setup and training for a
module. You may not claim to switch it off from your side.

### Seats are devices, not employees

`activateDevice` and `enforceDeviceLicense` count **device documents** —
one per phone running the employee app, and one per kiosk account. Nothing
anywhere counts employees. There is no employee cap in the code, and
`set-license.ts --list` prints company id, name and licence, not headcount.

This matters more than anything else on this page:

- A 500-person factory where everyone punches at 10 shared kiosks needs
  **10 seats**, not 500.
- A 20-person construction firm where everyone has the app needs **20 seats**.

So seats measure your *infrastructure exposure*, not the customer's *value
received*. Price on headcount; use seats as the enforcement handle and the
anti-sprawl limit. If you price on seats, the factory pays a tenth of what the
construction firm pays for twenty-five times the value.

### Two hard ceilings in the code — know these before quoting an enterprise

- **Seat counting stops at 1,000 devices.** `countActive` and `listDevices`
  both read `devices.limit(1000)`. `deviceLimit` accepts up to 100,000, but
  above roughly 1,000 device documents the count is wrong and the Devices page
  is incomplete. Do not sell more than ~1,000 seats without a code change.
- **The attendance board shows at most 500 employees.** `GET
  /v1/attendance/overview` and the weekly view both cap the roster at
  `employeesQuery.limit(500)`. A company with 600 active employees will see 500
  rows on **Attendance** and no warning. Disclose this before you take money
  from anyone above 500, or fix it first.

### What a company that has never had a licence issued gets

Self-signup (`services/signup.ts`) writes **no `license` field at all**. So
`DEFAULT_LICENSE` applies: plan FREE, deviceLimit 5, status ACTIVE, expiresAt
null, **enforceDevices false**.

Because enforcement is off, that nominal 5-seat limit is not enforced on
day-to-day traffic. A self-signed-up company has an unlimited, never-expiring,
fully-featured installation until you issue it a licence. That is a deliberate
choice (a pre-sale tenant gets a working product) but it means **a trial does
not end by itself.** You must issue a licence with an expiry to time-box it.

---

## 2. What to sell

Three tiers, defined by seats, support and services — not by features, because
features cannot be gated.

| | Trial | Standard | Enterprise |
|---|---|---|---|
| Licence `plan` value to set | FREE | STANDARD | ENTERPRISE |
| Seats (`deviceLimit`) | headcount + 5 | agreed, +15% headroom | agreed, +15% headroom |
| `enforceDevices` | true | true | true |
| `expiresAt` | trial end date | paid-through + 14 days | paid-through + 30 days |
| Support channel | Email only | Phone + email, business hours | Phone + email + named contact |
| Target response | Best effort | Next working day | Same working day |
| Setup | Self-serve | Remote setup session | On-site setup in Kabul |
| Training | Written guides | 1 remote session | 2 on-site sessions |
| Data import (employee list) | No | Yes, one import | Yes, plus re-imports |
| Holiday calendar loaded for the year | No | Yes | Yes |
| Payroll dry-run reviewed with you | No | First month | First three months |

### Enforced by code vs. promised by you

| Line item | Enforced? | How |
|---|---|---|
| Device seat limit, phones | **Yes** | `deviceLimit` + `enforceDevices`, transactional seat count in `activateDevice` |
| Device seat limit, kiosks | **No** | `createKioskAccount` writes a device document without checking the licence; only phones are refused when the count is full |
| Licence expiry | **Yes** | `expiresAt`, checked in the company's Kabul date |
| Suspension | **Yes** | `status: SUSPENDED` → 403 for employee app and kiosks |
| Customer cannot raise their own limits | **Yes** | No write endpoint exists; script needs project credentials |
| Plan name shown in the portal | Cosmetic | Read-only line on Devices & licence |
| Any feature or module | **No** | Customer admin toggles them in Settings → Features |
| Employee headcount limit | **No** | Nothing counts employees anywhere |
| Support response time | **No** | Your promise. Nothing measures it. |
| Training, setup, import, on-site visits | **No** | Your promise |
| Backup / restore of one tenant | **No** | No per-tenant backup tool exists in the repo |
| Uptime or SLA | **No** | Only `/v1/health` exists; there is no monitoring or credit machinery |

**The seat limit only bites on phones — read this before you quote seats.**
`createKioskAccount` (`backend/functions/src/services/kiosk-account.ts`) mints
the login and writes an ACTIVE device document without reading the licence at
all: no `getLicense`, no `licenseUsable`, no seat count. The route that reaches
it is gated only on `employees:write`, which the customer's own admin holds. The
device guard then waves those kiosks straight through, because the document
exists and is active. So a customer sold 22 seats can create 50 kiosk accounts
and every one of them will work. Only phones enrolling through the guard are
ever refused. A kiosk-heavy customer can quietly exceed the seat count they paid
for and you will not find out from the product — which is one more reason to
price on headcount, not on seats.

Everything in the second half of that table is a promise you keep by hand. Price
your time into it — see the margin section, where your hours, not Firebase, are
the real cost.

---

## 3. Proposed rate card (AFN)

**Proposed. Not validated against the Afghan market. Read section 4 first.**

Structure: a one-time setup fee, plus a per-employee monthly fee that steps down
with size, plus a monthly floor so a tiny customer still covers a support call.

**Setup fee, one-time**

| Company size | Setup fee (AFN) |
|---|---|
| Up to 50 employees | 15,000 |
| 51–200 | 35,000 |
| 201–1,000 | 75,000 |

**Per employee, per month**

| Headcount band | AFN per employee per month |
|---|---|
| First 25 | 120 |
| 26–100 | 90 |
| 101–300 | 70 |
| 301–1,000 | 50 |

Bands are cumulative (like tax brackets), not a flat rate for the whole company.

**Monthly floor:** 2,500 AFN/month. This is the one break-even figure in the
document, and everything else is derived from it: assume a support phone call
plus its follow-up costs you about an hour of your own time, and 2,500 AFN is
roughly what that hour has to earn. Below 2,500, a customer who phones you once
in the month has cost you more than the month brought in.

**Annual prepay:** pay 10 months, get 12. Roughly 17% off. Recommended as the
default ask — collection is manual and every monthly invoice is a phone call you
have to make.

### The three worked quotes

Headcount drives price. Seats are set to what they actually need — remembering
that only the phone half of each seat count is actually enforced (section 2).

**A. Construction company, 20 employees**

Everyone carries a phone, one tablet at the site gate.

| | |
|---|---|
| Monthly by band | 20 × 120 = 2,400 → floor applies |
| **Monthly** | **2,500 AFN** |
| Annual, paid monthly | 30,000 AFN |
| Annual, prepaid (10 for 12) | **25,000 AFN** |
| Setup fee | 15,000 AFN |
| **Year one, prepaid** | **40,000 AFN** |
| Effective per employee/month | 125 AFN |
| Seats to issue | 22 (20 phones + 1 kiosk + 1 spare) |

**B. Factory, 100 employees**

Most workers punch at shared kiosks; supervisors and office staff have phones.

| | |
|---|---|
| Monthly by band | (25 × 120) + (75 × 90) = 3,000 + 6,750 |
| **Monthly** | **9,750 AFN** |
| Annual, paid monthly | 117,000 AFN |
| Annual, prepaid | **97,500 AFN** |
| Setup fee | 35,000 AFN |
| **Year one, prepaid** | **132,500 AFN** |
| Effective per employee/month | 98 AFN |
| Seats to issue | ~36 (25 phones + 6 kiosks, +15% headroom) |

**C. Enterprise, 500 employees**

| | |
|---|---|
| Monthly by band | (25 × 120) + (75 × 90) + (200 × 70) + (200 × 50) |
| | = 3,000 + 6,750 + 14,000 + 10,000 |
| **Monthly** | **33,750 AFN** |
| Annual, paid monthly | 405,000 AFN |
| Annual, prepaid | **337,500 AFN** |
| Setup fee | 75,000 AFN |
| **Year one, prepaid** | **412,500 AFN** |
| Effective per employee/month | 68 AFN |
| Seats to issue | ~106 (80 phones + 12 kiosks, +15% headroom) |

**Before quoting case C, confirm the 500-employee board limit above.** At exactly
500 active employees the attendance board is at its cap; at 501 it silently
truncates.

### Why the shape is this way

- **Per employee, not per seat.** Value tracks headcount (payroll runs,
  attendance days, absence deductions). Seats track only how many devices talk
  to the server. A kiosk-heavy factory has few seats and enormous value; a seat
  price would give it away.
- **Declining bands.** Your marginal cost per employee falls with size (see
  section 6 — a 20-person company is entirely inside Firebase's free daily
  quota), and a 500-person buyer will compare total AFN, not per-head AFN.
- **A floor, not a per-employee minimum.** The cost of a small customer is one
  phone call, and that call costs the same whether they have 5 staff or 25.
- **Setup priced separately.** Employee import, the year's holiday calendar,
  salary components, a payroll dry-run and a training session are real days of
  your time. If you fold them into the monthly fee, a customer who leaves after
  three months has taken those days for free.
- **Annual prepay pushed hard.** There is no billing system, no card gateway and
  no invoicing anywhere in the product. Every renewal is you, on the phone. Twelve
  collections a year for 2,500 AFN each is not a business.

---

## 4. Assumptions — read before you quote anyone

**I have no real Afghan market data.** None of the numbers above are grounded in
observed prices, salaries, or competitor quotes. They are internally consistent
and cost-covering; that is all. Every one of these is an assumption you must
replace with a checked fact:

1. **Exchange rate: 70 AFN = 1 USD.** Used only to compare your AFN revenue
   against Firebase's USD bill. Check today's rate; if AFN weakens materially,
   your margin on a fixed AFN annual prepay shrinks over the year.
2. **Willingness to pay.** I assumed a Kabul SME will pay roughly one month of
   one mid-level office salary per year for attendance and payroll software. I
   have no evidence for this. **Check it against: what does a firm of this size
   pay its HR/admin clerk per month?** If the annual fee exceeds two months of
   that clerk's salary, expect resistance — the honest comparison a buyer makes
   is "software vs. one more clerk".
3. **Competing products.** I do not know what local vendors charge, or what a
   fingerprint attendance terminal plus its bundled desktop software costs in Kabul.
   That hardware bundle is your real competitor and it is a **capital purchase,
   not a subscription** — a buyer comparing a one-time 60,000 AFN device against
   your recurring fee will do it on year-three total cost. Get three real quotes
   before you finalise the rate card.
4. **Payment mechanics.** I assumed cash, hawala or bank transfer, collected by
   you. There is no payment processing in the product. Confirm which of your
   target customers can actually pay annually in advance — if most cannot, the
   prepay discount is theatre and you should price monthly and expect to chase.
5. **Setup effort.** I assumed setup is 1–3 days of your time depending on size.
   Time your first two real onboardings and reprice the setup fee from actual
   hours.
6. **Support load.** I assumed a mature customer generates under one support
   contact per month. If a 100-person factory generates one a week, case B is
   priced too low — that is 4 hours a month of your only engineer.
7. **Retention.** The rate card assumes customers stay past year one. If they
   churn after twelve months, the setup fee must cover nearly all of your
   acquisition and onboarding cost, and 15,000 AFN will not.
8. **Firebase prices.** The unit prices in section 6 are as I understand them at
   time of writing and Google changes them. Verify against the Firebase pricing
   page and, more importantly, against your own bill for the first two months.

**The three numbers to check first, before you quote a single customer:** the
local clerk salary benchmark (2), the biometric-terminal bundle price (3), and
whether annual prepay is collectable (4).

---

## 5. Trial, discounts, non-payment

### Trial

The product has no trial mechanism of its own. Self-signup creates a company
with no licence, which means unlimited and never-expiring. **A trial only ends
if you make it end.**

Recommended trial: 30 days, full product, licence issued on day one.

```
# Once per machine: sign in, so the script can reach worktrack-prod.
gcloud auth application-default login

# From the repo root, after every git pull: the script is TypeScript and only
# exists under lib/ once it is compiled.
npm --prefix backend/functions run build

# The command itself must be run from backend/functions.
cd backend/functions
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company COMPANY_ID --plan FREE --seats 25 --expires 2026-10-07 --enforce
# review the printed dry run, then repeat with --apply
```

Skip either of the first two steps and node exits with MODULE_NOT_FOUND or a
credentials error, not a useful message. Full prerequisites: see
01-delivery-runbook.md, section 0, "What you need on your machine, once".

Notes that will save you a support call:

- **Set seats generously.** With `--enforce` on, the trial company's phones
  claim seats as they appear. Too small a number and staff are refused mid-trial
  with "All N device seats on this licence are in use."
- Get the company id from the customer: it is on **Settings → Support**, labelled
  "Your company ID", with a copy button. Or run the script with `--list`.
- Self-signup accounts are gated until the email address is verified. If the
  customer says they cannot log in on day one, this is usually why.
- **Do not use demo.linumic.com as a trial.** It resets every night at 03:30
  Kabul time. It is a sales demo, not a sandbox they can put real data in.
- At trial end the licence lapses on its own. Employee phones and kiosks stop;
  the manager portal keeps working (see below). Nothing is deleted.

### Discounts

| Discount | Amount | When |
|---|---|---|
| Annual prepay | 2 months free (~17%) | Default ask on every deal |
| Three-year prepay | 2.5 months free per year (~21%) | Only when you are confident the product will still be supported |
| NGO / school | 20% off the monthly fee | Your discretion |
| Reference customer | 15% off, in exchange for a named reference and permission to bring prospects on site | First 3–5 customers only |
| Setup fee | **Never discount** | It is paid labour, not margin |

Set a walk-away floor and hold it: **1,500 AFN/month, or 50 AFN per employee per
month, whichever is higher.** This is not a second break-even point — break-even
is the 2,500 AFN list floor in section 3. 1,500 AFN is deliberately *below* it:
a customer at the walk-away floor loses you money in any month they phone you.
Take it only where the deal buys something other than cash — a named reference,
a first customer in a sector — never as an opening position, and never for a
customer you expect to be support-heavy.

Stack no more than one discount. Do not discount the first year and plan to
raise the price at renewal — there is no billing system to enforce a step-up,
and the conversation will be worse than the discount was worth.

### Non-payment

You have exactly three levers, all in `set-license.ts`, and you must understand
what each one does and does not stop.

**What suspension actually stops.** `enforceDeviceLicense` only applies to
EMPLOYEE and KIOSK callers, and only when `enforceDevices` is true. So:

- The **employee Android app** stops: 403 with "This company's licence is not
  active."
- **Kiosk screens** stop, same error.
- **The manager portal keeps working completely.** Managers can still log in,
  view attendance, run payroll and export. There is no lever that locks the
  portal.
- If `enforceDevices` is **false**, suspension and expiry do nothing at all —
  not "only new activations". The guard returns at
  `if (!license.enforceDevices)` before it ever reads the status or the expiry,
  and no shipped client calls the `POST /v1/devices/activate` endpoint that
  would otherwise check it (the Android app only stamps `X-Device-Id` on its
  requests and lets the guard enrol it). **A licence issued without `--enforce`
  is unenforceable.** Always issue with `--enforce`.
- Enforcement decisions are cached in-process for 60 seconds, so a suspension
  takes up to a minute per warm server instance to take effect. Same on the way
  back.

**Recommended sequence**

| Day | Action |
|---|---|
| 0 | Invoice due. Licence `expiresAt` was already set to paid-through + 14 days, so the clock is running whether you call or not. |
| +3 | Phone call. +93 793 817 977 is your number on their Settings → Support page; they will call you back on it. |
| +7 | Written notice by email to the admin address, stating the date access stops. |
| +14 | Licence lapses on its own — `expiresAt` passes. Phones and kiosks stop. Portal still works. |
| +21 | If still unpaid: `--status SUSPENDED --apply`. Same practical effect, but it is explicit and it shows as "Suspended" on their Devices & licence page. |
| Anytime | Payment received: `--status ACTIVE --expires <new date> --apply`. Devices reconnect within about a minute. Nothing was lost. |

**What you must not do:** there is no vendor tool to delete a customer's data,
and you should not improvise one. Company deletion is customer-initiated only,
with a 30-day grace period before the nightly purge job acts. Data from a
non-paying customer simply sits there, costing you Firestore storage (pennies)
until they either pay or ask you to close the account.

**Set the expiry every time you take money.** Renewal is one flag — same
directory, same build, same credentials as the trial command above:

```
cd backend/functions
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company COMPANY_ID --expires 2027-03-20 --apply
```

Everything not passed keeps its current value. If you never set an expiry, a
customer who stops paying keeps a working product forever and your only remedy
is an explicit suspension you have to remember to run.

---

## 6. Your cost side — Firebase Blaze

One Firebase project, `worktrack-prod`, serves every customer. The API is a
single HTTPS function in `us-central1` (`minInstances: 0`, `maxInstances: 100`,
concurrency 80, 512 MiB).

**The free daily quotas are per project, not per customer.** Firestore's free
50,000 reads / 20,000 writes per day are consumed by all your tenants together.
Your first customer is free; your fifth is not.

### Unit prices assumed

Verify these — Google changes them, and your Firestore location matters.

| Item | Assumed price |
|---|---|
| Firestore document reads | $0.06 per 100,000 |
| Firestore document writes | $0.18 per 100,000 |
| Firestore stored data | $0.18 per GiB per month |
| Firestore free daily | 50,000 reads / 20,000 writes / 1 GiB |
| Cloud Functions (2nd gen) invocations | 2M free/month, then $0.40 per million |
| Hosting transfer | 360 MB/day free, then $0.15/GB |
| Cloud Scheduler | 3 jobs free; you use exactly 3 |
| Firebase Auth (email/password) | Free at your volumes |

Blaze has no base fee. Your fixed monthly cost with zero customers is close to
zero — a few cents for Secret Manager holding `KIOSK_HMAC_SECRET`.

### Which operations dominate — this is the important part

I traced these in the code. In descending order:

**1. The attendance board's 60-second refresh. This is your largest cost by a
wide margin.**

`web/src/api/hooks.ts` refetches `/attendance/overview` every 60 seconds while a
manager has today's board open. Each call reads **every active employee plus
every attendanceDay for that date** (`routes/attendance.ts`, the two `.get()`
calls under `Promise.all`). For a 500-employee company that is roughly 1,000
document reads per minute per open browser tab — about **1.4 million reads per
tab per 24 hours**. Four managers leaving the tab open all day is most of your
Firestore bill.

It does refetch only while the tab is focused (`refetchIntervalInBackground:
false`), which helps a great deal. The weekly view behaves the same way.

**2. Kiosk QR polling.** `useKioskToken` refetches every 20 seconds **including
in the background** (`refetchIntervalInBackground: true`) — a kiosk screen is
meant to sit there all day, so this is by design. Each poll is one function
invocation and one company-document read: **4,320 reads and 4,320 invocations
per kiosk per day**. Ten kiosks is 43,200 reads/day, and more importantly
1.3 million function invocations a month, which is most of the 2M free tier on
its own.

**3. Employee app sync.** `WorkManagerSyncScheduler` runs every 30 minutes, and
each cycle pulls 12 resource types (`ResourceTypes.pullOrder`) — 13 Firestore
queries, since leave requests are queried twice. An empty query still bills one
read. So roughly **13–16 reads per phone per sync cycle**, call it 400–500 reads
per phone per day. Three hundred phones is around 144,000 reads/day.

**4. Each punch.** `applyPunch` → geofence check → `recomputeAttendanceDay`
(punch window query + shift assignment query + shift document) ≈ **10 reads and
2–3 writes per punch**. Two punches per employee per day. At 500 employees that
is 16,000 reads and ~5,000 writes a day — still inside the free write quota.

**5. Payroll runs.** `computePayrollRun` reads, per employee, the salary
document plus that employee's attendanceDays for the month (~26 docs), and
writes one payslip. For 500 employees: ~13,500 reads and ~500 writes **once a
month**. Negligible. Warn customers off re-running a provisional payroll
repeatedly for large companies, but it is not a cost problem.

**6. Nightly integrity audit.** `runAttendanceAudit` reads two days of punches
for every company, every night at 02:00 Kabul. Small, and worth every read.

### Estimated monthly infrastructure cost per customer

Marginal cost, ignoring free tiers (because they are shared and the first
customer already ate them).

| | A: 20 employees | B: 100 employees | C: 500 employees |
|---|---|---|---|
| Phones / kiosks assumed | 20 / 1 | 25 / 6 | 80 / 12 |
| Manager tabs open all day | 1 | 2 | 4 |
| Firestore reads/day | ~40,000 | ~245,000 | ~2,130,000 |
| Firestore reads/month | ~1.2M | ~7.4M | ~64M |
| **Firestore reads cost** | **~$0.70** | **~$4.40** | **~$38** |
| Writes | inside free tier | inside free tier | ~$0.30 |
| Function invocations/month | ~0.3M | ~1.2M | ~4.7M |
| **Functions cost** | ~$0 | ~$0–5 | **~$5–25** |
| Storage (no selfies) | <$0.05 | ~$0.10 | ~$0.50 |
| **Total, USD/month** | **~$1** | **~$5–10** | **~$45–65** |
| **Total, AFN/month at 70** | **~70** | **~350–700** | **~3,200–4,600** |

The functions figure is the least reliable line: Cloud Run bills instance time,
which depends on how long instances stay warm. **Measure it on your real bill
after month one** and correct this table.

### Margin

| | A | B | C |
|---|---|---|---|
| Revenue AFN/month | 2,500 | 9,750 | 33,750 |
| Infrastructure AFN/month | ~70 | ~500 | ~3,900 |
| **Gross margin** | **~97%** | **~95%** | **~88%** |

Infrastructure is not your cost. **Your time is.** One hour of your support
attention, valued at anything realistic, is worth more than a month of case A's
Firebase bill. Price and staff accordingly: the reason case A has a 2,500 AFN
floor is not servers, it is the phone.

### Two things that will blow up your bill

**Selfies stored in Firestore.** `punchCreateSchema` accepts a base64 selfie up
to 200,000 characters, stored inside the punch document, and copied onto the
attendanceDay as `checkInSelfie`. At 500 employees × 2 punches × 150 KB that is
about **6 GB of new storage per month, forever** — around $1/month in the first
month, $13/month by the end of the first year, and it never stops growing. It
also inflates every read of those collections.

The board itself is safe: the overview deliberately sends only a
`hasCheckInSelfie` flag and fetches images on demand. But the storage growth is
real. If a customer turns on photo check-in for a large workforce, **watch the
Firestore storage line specifically**, and consider that a reason to price them
higher or to move images out of Firestore before you sell it.

**Leaving the attendance board open.** See item 1 above. A single 500-employee
tenant with four permanently-open dashboards costs more in Firestore reads than
everything else that tenant does combined. If margin ever becomes a problem, the
cheapest fix in the whole product is raising that 60-second refresh interval or
making the board fetch only changed rows.

### Cost items that are yours, not per-customer

- The demo tenant (`worktrack-demo-af`) resets nightly and serves the public
  sandbox at demo.linumic.com. Small, but it is marketing cost, not customer
  cost.
- The Windows desktop shell (`desktop/`, WorkTrack-Setup-1.0.0.exe) is an
  Electron window around the hosted portal. It is **not code-signed** — there is
  no signing configuration in `desktop/package.json` — so Windows SmartScreen
  will warn on install. Factor that into what you promise about desktop
  installation, or budget for a code-signing certificate.
- The Android APKs are signed (RSA 4096, O=Linumic) and distributed by you
  directly. There is no Play Store listing in this repo, so there is no store
  fee and no store distribution.

---

## 7. What the product does not do, that a buyer or you may assume it does

State these plainly rather than discovering them at renewal.

- **No billing, invoicing, or payment processing anywhere.** No card gateway, no
  self-serve upgrade, no receipts. Every invoice and collection is manual.
- **No plan-change button for the customer.** By design. Every change is you and
  `set-license.ts`.
- **No headcount reporting for you.** `--list` shows company id, name and
  licence. It does not show how many employees a company has. If you price on
  headcount you are on the honour system unless you query Firestore yourself.
- **No per-tenant backup or restore tool.**
- **No SLA machinery, no uptime monitoring** beyond an unauthenticated
  `/v1/health` endpoint.
- **No iOS app.** The device schema accepts an `IOS` platform value, but the
  only built clients are the Android APKs (signed; minSdk 26 / Android 8.0) and
  the Windows portal shell (built, but **not** code-signed — see section 6).
- **No multi-company or group rollup.** Each company is a separate tenant with
  separate logins.
- **Public holidays are the customer's job.** Only Nawroz and Independence Day
  are seeded; the lunar holidays are set by moon sighting and must be entered in
  **Settings → Working calendar** (Dari **تقویم کاری**, Pashto **کاري جنتري** —
  there is no card called "Holidays", so do not send a customer looking for
  one). The button that seeds the fixed days for a year is **Generate this
  year's fixed holidays** (**ساخت تعطیلات ثابت سال** / **د کال ثابتې رخصتۍ
  جوړول**); everything else is typed in by hand. Days that are not entered count
  as working days and staff are marked absent. This is the single most common
  cause of a wrong first payroll. Loading the year's calendar during setup is a
  real part of what the setup fee buys.
