# WorkTrack delivery runbook

From first enquiry to a working, licensed customer. This is for you, the vendor,
not for the customer. It assumes you have the repository, a terminal, and
credentials for the `worktrack-prod` Firebase project.

Read the honesty box before you quote anyone.

---

## Honesty box: what is manual, and where you are the bottleneck

There is no vendor console. Everything below that is not the customer's own
self-service signup is you, at a terminal, one customer at a time.

| Job | Who does it | How |
|---|---|---|
| Create the company | The customer, or you on their behalf | Portal signup form |
| Issue / change / renew / suspend a licence | **You only** | `set-license.js` against `worktrack-prod` |
| See the list of all customers | **You only** | `set-license.js --list` |
| Set a branch GPS geofence | **You only** | Hand-written document in the Firestore console — there is no UI and no API for this |
| Create a second branch | **Nobody** | Signup creates one head-office branch. The portal cannot add another |
| Reset the company admin's own forgotten password | **You only** | Firebase Authentication console for `worktrack-prod` — the sign-in screen has no "forgot password" link (section 6.7). Everyone else's password an admin can reissue themselves |
| Deliver a new app version | **You only** | Hand the APK over again. There is no in-app update |
| Invoicing and payment | Outside the product entirely | WorkTrack has no billing, no invoices, no payment |

Consequences you should plan around:

- Every licence action needs your laptop and your Google credentials. If you are
  travelling without them, a customer who has just paid cannot be renewed.
- `--list` reads every company document in the project. It is your only
  inventory. Keep your own record of who paid what and when — the product does
  not track it.
- A licence change takes effect in the field within about a minute, not
  instantly: the API caches a company's licence for 60 seconds per running
  instance.

---

## 0. What you need on your machine, once

```bash
cd /Users/aminullahhashemi/StudioProjects/WorkTrack

# Sign in to Google so the scripts can reach worktrack-prod.
gcloud auth application-default login

# Compile the backend, including the licence tool.
npm --prefix backend/functions run build
```

`npm run build` compiles `backend/functions/src/**` into `backend/functions/lib/**`.
The licence tool ends up at `backend/functions/lib/scripts/set-license.js`.
Re-run the build after any `git pull`.

Sanity check that credentials and project are right:

```bash
cd /Users/aminullahhashemi/StudioProjects/WorkTrack/backend/functions
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js --list
```

If that prints companies, you are ready. If it fails on credentials, re-run
`gcloud auth application-default login`.

---

## 1. Qualifying the customer

Ask these before you quote. Each one changes the number you sell or the work you
have to do.

**How many employees?**
Employees are not what the licence counts, but they tell you the size of the
first-run session and whether payroll is realistic. Each employee needs a login
created by hand in the portal (Employees → Add employee), and the temporary
password is read out or written down — there is no invitation email.

**How many phones will actually run the app?**
This is what you are selling. The licence grants *device seats*. One seat is
taken by each phone that signs in, identified by an id the app generates on
first run and keeps. Reinstalling the app on the same phone generally produces a
new id and therefore takes a second seat, so leave headroom.

**Do they want kiosks, and how many?**
A kiosk is a tablet parked on the check-in screen with its own login, created in
the portal (Settings → "Kiosk devices" card → "Create kiosk login"; the card only
appears when the QR kiosk module is switched on). The "Kiosk" item in the menu is
the full-screen check-in display itself, not where logins are made.
**A kiosk consumes a device seat too.**
Sell seats as `phones + kiosks + headroom`.

Be aware of a rough edge: creating a kiosk login does not check the seat count.
You can end up with more kiosks than the licence grants; the kiosks keep working,
but they inflate the count on Devices & licence and the next *phone* is refused.

**Which branches, and do they want GPS restriction?**
Signup creates exactly one branch: "دفتر مرکزی" (code `HQ`). The portal has no
branch management and no geofence editor. If they want punches restricted to a
location, you write the geofence document yourself (section 5). If they have
several sites and want each fenced separately, that is several documents, all by
hand, and you must be honest that there is no screen where they can adjust it
later without calling you.

**Android version on their phones.**
The app needs Android 8.0 or newer. Anything older cannot install it.

**Anything you should say no to.** There is no iOS app. There is no biometric
fingerprint terminal integration. Face recognition exists but ships switched off
(`settings.features.faceRecognition`, default off) — do not sell it as a
delivered feature.

---

## 2. Creating their company

A tenant is created by one unauthenticated call: `POST /v1/public/signup`, which
runs `provisionCompany`. The portal's own sign-in page is the front end for it.

**The customer can do this themselves.** At https://worktrack-prod.web.app the
sign-in screen has a link, "New company? Register". That opens a form asking for
Company name, Admin first name, Admin last name, Work email, Password (at least
8 characters), and the button reads "Create workspace".

Prefer letting the customer do it, on their own machine, with their own email
address. You never handle their password that way.

If you do it for them during a visit, have them type the password themselves.

**What the founding admin gets.** One call creates, atomically:

- The company, with all core modules on: shifts, leave, payroll, attendance
  corrections, announcements, geofencing, QR kiosk. Face recognition is off.
  Default policies: 480 standard daily minutes, Friday as the weekend, 10
  minutes late grace, overtime on. Timezone `Asia/Kabul`, currency `AFN`.
- One branch, "دفتر مرکزی", code `HQ`, with no coordinates and no radius.
- One shift, "شیفت روز", code `DAY`, 08:00–16:00, 60-minute break, 10 minutes
  grace in and out.
- The founding admin as employee `E-001` with the `COMPANY_ADMIN` role — which
  holds every permission inside the tenant.
- Two leave types: "رخصتی سالانه" (ANNUAL, 20 days) and "رخصتی مریضی" (SICK, 10
  days), with the admin's balances for the current year.
- The fixed Solar Hijri holidays for this Shamsi year and the next: Nawroz and
  Independence Day only. Eid, Ashura and Mawlid follow the moon and are not
  seeded — the customer adds those in Settings → Working calendar.

**Email verification gates the account.** The signup form has Firebase mail a
verification link; the API refuses a self-signed-up admin until the address is
verified ("Verify your email address to finish setting up your company"). The
portal shows a "Verify your email" panel with a "Send the link again" button.
Tell them to check spam. Firebase sends this message itself — there is no other
mail transport configured anywhere in the product, so if the link does not
arrive there is nothing on your side to fix or resend.

**What the new tenant's licence looks like before you do anything.** Nothing is
written. `getLicense` falls back to: plan FREE, 5 seats, status ACTIVE, no
expiry, **enforcement off**. Enforcement off means the seat limit is not applied
at all — the guard exits immediately — so an unlicensed tenant can run any
number of phones. The "5" you see under Devices & licence is cosmetic until you
issue a licence with `--enforce`.

That is deliberate: a trial or pre-sale tenant gets a working product, not a
locked one. It also means **a customer who never pays keeps working until you
issue an enforced licence.** Do not skip section 3.

Get the company id: they read it from Settings → Support ("Your company ID",
with a Copy button), or you find it with `--list`.

---

## 3. Issuing the licence

The licence is the thing the customer buys, so it is not something they can
grant themselves. There is deliberately no endpoint for it — writing a licence
requires credentials for the Firebase project, which only you have. Inside the
portal the licence is read-only, on Devices & licence, under the note: "Your
licence is issued by Linumic. To add device seats, extend the expiry date or
change your plan, contact us."

All commands run from `backend/functions`:

```bash
cd /Users/aminullahhashemi/StudioProjects/WorkTrack/backend/functions
```

### 3.1 Find the company id

Either the customer reads it to you from Settings → Support, or:

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js --list
```

Each company prints as three lines: the id, the name, then its licence summary
(`plan=… seats=… status=… expires=… enforced=…`). A company with no licence on
file shows the defaults.

### 3.2 Read what they hold today

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --show
```

### 3.3 Dry run — always first

The tool writes nothing unless you pass `--apply`. Run it once without, read the
`now:` and `next:` lines, and only then apply.

Worked example: a 25-seat STANDARD licence expiring one year out, enforced.

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... \
  --plan STANDARD \
  --seats 25 \
  --expires 2027-09-07 \
  --status ACTIVE \
  --enforce
```

Output to expect:

```
  project: worktrack-prod

  company: 01J8XYZ...  (شرکت ...)
  now:     plan=FREE  seats=5  status=ACTIVE  expires=never  enforced=no
  next:    plan=STANDARD  seats=25  status=ACTIVE  expires=2027-09-07  enforced=yes

  Dry run — nothing written. Re-run with --apply.
```

Check the `next:` line reads exactly what the customer paid for. Then:

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... \
  --plan STANDARD \
  --seats 25 \
  --expires 2027-09-07 \
  --status ACTIVE \
  --enforce \
  --apply
```

It prints `✓ Licence written.`

### 3.4 Things to know about the flags

- `--expires` is a **Gregorian** date, `YYYY-MM-DD`, or the literal word `never`.
  The portal shows it as written. Expiry is judged against the company's own
  calendar date in its timezone, so a licence does not lapse hours early in
  Kabul.
- Anything you leave out keeps its current value. A renewal is therefore one
  flag (`--expires`), and adding seats is one flag (`--seats`).
- `--status` defaults to ACTIVE only on a brand-new licence. On an existing one,
  omitting it keeps whatever is there — so **un-suspending needs an explicit
  `--status ACTIVE`.**
- `--enforce` / `--no-enforce` is what makes the seat count real. Without
  `--enforce` the seat number is decorative.
- Lowering `--seats` below the number of devices already registered does not
  un-register anyone. The tool warns you; registered devices keep working and
  the next *new* one is refused.
- `--plan` is FREE, STANDARD or ENTERPRISE. The plan name is a label shown to
  the customer (Free / Standard / Enterprise on Devices & licence). Nothing in
  the code behaves differently per plan — seats, expiry and enforcement do all
  the work. Do not promise plan-specific features.

### 3.5 Verify

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --show
```

Then have the customer open Devices & licence in the portal and read the five
facts back to you: Plan, Device limit, Status, Expires, Enforce the device
limit. The header chip shows "N of M devices".

---

## 4. What to send them

### 4.1 The app

Release APKs are in `/Users/aminullahhashemi/StudioProjects/WorkTrack/app/release/`.
They are signed with the Linumic release key (RSA 4096, v2 and v3 signing; no v1,
which is correct because the app requires Android 8.0). Version 1.0.0,
versionCode 1.

Every APK talks to the same production backend. **The APK is not
customer-specific** — the same file works for every customer, and the licence is
what separates them.

| File | Size | Give it to |
|---|---|---|
| `app-arm64-v8a-release.apk` | 30 MB | Almost every phone sold in the last several years. **This is the default.** |
| `app-armeabi-v7a-release.apk` | 24 MB | Older, cheaper 32-bit phones |
| `app-x86_64-release.apk` | 33 MB | Emulators. Not a real phone |
| `app-universal-release.apk` | 80 MB | Only when you cannot find out what the phone is |

Send arm64 first. If it refuses to install ("app not installed" / "package
appears to be invalid"), send armeabi-v7a. Only fall back to the universal build
if you are handing over a bag of unknown devices — it is 80 MB over a connection
that may not finish.

Checksums, so they can confirm nothing was tampered with in transit:

```
0143556f689fef0c75d1bedf127361939823e4d128b4f8c8fabb030b40cf6359  app-arm64-v8a-release.apk
946fc3c66a9b7c7e33d2e3b3dad71c1f2fa5249925c6ec35e076f67e05240a15  app-armeabi-v7a-release.apk
4e27d52009a374070093e10fa3d8c10265969756b2f7b83e9031de4824e4218b  app-x86_64-release.apk
4252c6682e7a2bb45053bd22f6d58d03711a2f3abfc6aeda9136e50e921f9064  app-universal-release.apk
```

Signing certificate SHA-256:
`e37a2ec8cdd024198dda6db7e97bb30ce03344a9bfbe47ab7db15280f4a7d983`

Verify your own copy before sending:

```bash
cd /Users/aminullahhashemi/StudioProjects/WorkTrack/app/release
shasum -a 256 *.apk
```

A technical customer can check the same on Windows with
`certutil -hashfile app-arm64-v8a-release.apk SHA256`.

### 4.2 How to send it

WhatsApp, Telegram, a USB stick, or a link you host. There is no Play Store
listing, so every phone must allow installation from that source once — Android
asks, and the employee taps "Allow" / "Install anyway". Warn them in advance so
the prompt does not read as a virus warning.

### 4.3 The rest of the pack

- The portal address: **https://worktrack-prod.web.app**
- The demo, if they want to show colleagues before rolling out:
  **https://demo.linumic.com** (public, resets itself nightly, not their data)
- Support: **+93 793 817 977**, **contact@linumic.com**, Kabul. The same details
  are inside the product at Settings → Support.
- Their company id, and the licence you issued in plain words: plan, number of
  device seats, expiry date.
- The customer-facing guides. Check
  `/Users/aminullahhashemi/StudioProjects/WorkTrack/delivery/customer/` and send
  whatever is current — do not send a guide you have not opened.

---

## 5. First-run support session

Budget an hour on a call or in person, with the admin at a computer. Do these in
order; each one prevents a support call later.

**1. Sign in and language.** https://worktrack-prod.web.app, their email and
password. The language switch is at the top of every page: دری / پښتو / English.
Set it to what they will actually use.

**2. Settings → Company settings.** Walk through the three cards:

- *Features* — turn off the modules they will not use. A disabled module
  disappears from the menu. Leave Face recognition off.
- *Work policies* — Standard daily hours, Weekend day(s), Late grace (min),
  Calculate overtime. Default weekend is Friday; change it if they work
  Saturdays off instead.
- *Profile* — Currency and Timezone. Leave AFN and Asia/Kabul unless there is a
  reason.

Press "Save changes".

**3. Settings → Working calendar. Do not skip this.** Say it plainly: *a working
day with no attendance record is treated as unexcused absence and is deducted
from pay.* Public holidays are only holidays if they are in this list. Nawroz
and Independence Day are already there. Eid al-Fitr, Eid al-Adha, Ashura and
Mawlid are set by moon sighting and are **not** seeded — the customer adds each
one with the "Add" button, every year. The card says this too.

**Type the Gregorian date of the holiday into the Date box.** It is an ordinary
Gregorian date picker, and holidays are stored by Gregorian date. Once added, the
table shows the day in Solar Hijri with the Gregorian date underneath, so they can
check they got the right day. Only the "Year" box at the top of the card is a
Solar Hijri year. Typing a Shamsi date (1405-01-01) into the Date box books a
holiday six centuries out: the real day stays a working day and is deducted as
unexcused absence — the exact failure this step exists to prevent.

The "Generate this year's fixed holidays" button only adds the two fixed ones for
the year in the Year box.

**4. Employees → Add employee.** Add two or three together so they can do the
rest. For each: Code, Phone, Name, Name (2), Email, Employment, Join date,
**Monthly basic salary** and Role — the form warns that "Without a basic salary
this employee gets no payslip when payroll runs." There is no Branch field on the
form; there is only ever the one branch. Tick "Create a mobile-app login"
and leave the password blank to get a generated temporary one. A panel appears,
"Employee account created", with the email and temp password and a Copy button.
**That password is shown once.** If it is lost, open the employee → "Edit" → the
"Login account" field → leave it blank for another random password, or type one of
at least 8 characters → press "Set password". The new password is shown once in
the same "Employee account created" panel. Nothing anywhere is labelled "Reset
password" — the row has only an "Edit" button. Roles they can assign: Employee,
Team lead, Branch manager, HR admin, Payroll admin, Auditor. They cannot make
another company admin.

**5. One phone, end to end, in the room.** Install the APK on one employee's
phone, sign in with the credentials from step 4, punch in, and then refresh the
Attendance page in the portal until the punch appears. Do not leave until you
have seen a punch made on a phone show up on the manager's screen. This is the
single most valuable thing in the session.

If enforcement is on, this first sign-in is also what claims the phone's licence
seat — the app has no "activate device" screen; the seat is taken automatically
on the first request. It then appears under Devices & licence.

**Location permission, on the 1.0.0 APKs you are handing over today.** Check-in
needs a location fix: with no location permission the punch buttons stay greyed
out and the screen reads "Location permission is required for GPS punch"
(«برای حاضری GPS اجازهٔ موقعیت لازم است»). In the 1.0.0 build the permission is
asked for in a way that Android 12 and newer drops silently — **no dialog
appears**, so on any recent phone you must grant it by hand: Settings → Apps →
WorkTrack → Permissions → Location → "Allow only while using the app". Do this on
every phone during the session; it is the most common "the app does nothing"
call. This is already fixed in the source — the next release asks properly and
the employee just taps "While using the app" ("Precise" or "Approximate", either
one works) — but it is *not* in the APKs in `app/release/`, so keep doing the
Settings step until you have built and sent a newer version.

**6. Kiosk, if they bought one.** Settings → "Kiosk devices" card → "Create kiosk
login", give it a name like "Entrance kiosk". The card is only on the Settings
page when the QR kiosk module is on under Features; the "Kiosk" menu item is the
display itself and has no create button. You get an email and password once. Type
them into the tablet's browser at the same portal URL; the tablet then locks to the full-screen
"Scan to check in" display with a QR code that refreshes every 30 seconds.
Employees tap "Scan kiosk QR" in the app. Remember this tablet holds a seat.

**7. Payroll, once.** Payroll → pick Year and Month → "Run payroll". Show them:
the run summary, the per-employee Gross / Deductions / Tax / Net, and the
"Provisional" badge if the month has not ended — "This month has not ended. The
figures cover only the days elapsed so far — run it again once the month closes."
Tax is the Afghan Income Tax Law Article 4 monthly brackets. If employees were
left out, the page says so and why: no basic salary on file. It warns separately
when someone whose status is "Exited" nonetheless worked during the month — they
are named, but they still get no payslip. Tell the admin the order matters: run
payroll first, mark the leaver as exited afterwards. If they did it the other way
round, set the person back to Active, run payroll again, then mark them exited.

**8. Settings → Support.** Show them the phone number, the email, and their
company ID with its Copy button. Tell them to quote the company ID whenever they
call — it is what their licence is issued against. Note that only the company
admin sees Settings; an HR admin does not have the Settings menu at all.

**9. GPS geofence — only if they asked, and only you can do it.** There is no
screen for this. You create the document yourself in the Firebase console for
`worktrack-prod`, under `companies/<companyId>/geofences/<anyId>`:

| Field | Type | Value |
|---|---|---|
| `companyId` | string | the company id |
| `branchId` | string | the branch id (the HQ branch created at signup) |
| `name` | string | e.g. `Head office` |
| `latitude` | number | e.g. `34.5553` |
| `longitude` | number | e.g. `69.2075` |
| `radiusMeters` | number | e.g. `150` |
| `active` | boolean | `true` |
| `updatedAt` | timestamp | now |

Until at least one active geofence exists, no punch is rejected for location —
the server treats "no fences configured" as nothing to enforce. Once one exists,
a punch outside every active fence is refused and the employee sees "شما خارج از
ساحهٔ کاری مجاز هستید" ("You are outside the permitted work area"). GPS accuracy
is credited toward the radius, and being inside *any* fence is enough. Set the
radius generously — 150 m, not 30 m — or you will spend the next month on the
phone about it.

Tell the customer honestly that they cannot change this themselves and must call
you to move or resize it.

---

## 6. Renewal, seats, suspension — and what a phone in the field does

### 6.1 What enforcement actually touches

The device licence guard applies **only** when `enforceDevices` is on, and
**only** to employee phones and kiosk tablets. Managers work in a browser, and a
browser is not a licensed device — **the manager portal keeps working no matter
what you do to the licence.** So suspending a customer stops their staff
recording attendance; it does not lock the admin out of their data.

Every check is cached for 60 seconds per running API instance, so any change
below reaches the field within roughly a minute, not instantly.

### 6.2 Renewal

```bash
cd /Users/aminullahhashemi/StudioProjects/WorkTrack/backend/functions

GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --expires 2028-09-07            # dry run

GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --expires 2028-09-07 --apply
```

Everything else keeps its current value. If the licence had already lapsed and
you had set `--status EXPIRED`, add `--status ACTIVE` as well.

There is no expiry reminder anywhere in the product — not for you, not for them.
Put the renewal date in your own calendar the day you issue the licence.

### 6.3 Adding seats

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --seats 40 --apply
```

New phones can enrol immediately (within the cache minute). Nothing needs
reinstalling.

If they have simply run out of seats because of retired phones, the cheaper fix
is free: the customer opens Devices & licence, finds the dead device by its
model and Last seen date, and presses "Revoke". That frees the seat at once. An
HR admin can do this too. "Restore" puts it back — though a restored device can
stay refused for up to a minute while the cached refusal expires.

### 6.4 Suspending a customer who has not paid

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --status SUSPENDED --apply
```

This only bites if `enforceDevices` is on. If you never issued an enforced
licence, `--status SUSPENDED` changes a label and nothing else.

**What an employee with the app sees, precisely.**

An employee who tries to sign in cannot: sign-in fetches their profile from the
API, the API refuses it, and the app drops the session and shows the generic
permission message —

> دری: «اجازهٔ این کار را ندارید.»
> پښتو: «تاسو د دې کار اجازه نه لرئ.»
> English: "You do not have permission to do this."

An employee already signed in keeps their app, their cached data and their
history on screen. Punching still *appears* to work: the punch is written
locally and queued. What fails is the sync — the queue stops draining and the
app reports the sync as failed.

**Nothing is lost.** A refused sync requeues the whole batch untouched; queued
punches are never discarded. When you set the licence back to ACTIVE, the queue
drains on the next sync and the missing days appear in the portal.

Be honest with yourself about the wording: **the app does not explain that this
is a licence problem.** It says "you do not have permission". The employee will
assume they have been fired, and the manager will call you. Tell the manager
before you suspend, so they can tell their staff.

The same generic message is what an employee sees when the licence has expired,
when their device was revoked, and when the last seat has been taken by someone
else's phone. You cannot tell these apart from the phone — check Devices &
licence, or `--show`, to know which it is.

A kiosk tablet behaves slightly differently: a kiosk whose device record was
revoked stays refused permanently and will not re-enrol itself. A phone will
re-enrol automatically once a seat is free.

### 6.5 Un-suspending

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --status ACTIVE --apply
```

Remember: status is *not* reset for you. If you also let the expiry lapse while
they were suspended, set `--expires` in the same command.

### 6.6 The soft option

If you would rather not stop attendance recording while a payment is chased,
turn enforcement off instead of suspending:

```bash
GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
  --company 01J8XYZ... --no-enforce --apply
```

Everything works again with no seat limit. Nothing in the portal tells the
customer that this happened.

### 6.7 A manager who has forgotten their portal password

There is no self-service recovery. The sign-in screen offers email, password and
the "New company? Register" toggle — no "forgot password" link — and nothing in
the portal sends a password-reset mail.

- **An employee's password** is not your problem: anyone who can edit employees —
  the company admin, or an HR admin — reissues it from Employees → the employee →
  "Edit" → "Login account" → "Set password".
- **The company admin's own password** is yours alone. You reset it in the
  Firebase Authentication console for `worktrack-prod`: find the user by their
  email address, reset the password there, tell them the new one and have them
  change it. Until you do, they are locked out of the portal.

There is no second company admin to fall back on: the portal cannot create one —
the assignable roles stop at HR admin. The founding admin's own email address and
password are the whole of the account's recovery, so say at handover that this is
a phone call to you, and that the address they sign up with should be one they
will keep and can still read.

---

## 7. Offboarding

### 7.1 The customer closes their own account

Only the company admin can. Settings → "Close the company account" → "Close the
company account". The dialog lists what is destroyed — every attendance and
leave record, every payroll run, payslip and ledger entry, the login of every
employee and kiosk — and requires them to **type the company name exactly**, with
an optional Reason field for their own records. Then "Yes, close the account".

The account is marked scheduled for closure and the card changes to "This account
is scheduled to close", showing the purge date: **30 days** from the request.
Until that date, "Cancel and reactivate" restores everything untouched.

Set expectations honestly: during the grace period the account is flagged as
suspended internally, **but nothing is actually blocked** — the portal still
works, phones still work, and staff can keep punching into a company that is on
its way out. If they want it to stop before the purge, suspend the licence
(section 6.4).

### 7.2 What the purge does

A scheduled job runs at 04:00 Kabul time every day. For any company whose grace
period has fully elapsed it deletes the Firebase logins of every employee and
every kiosk, then recursively deletes the company and every subcollection under
it. It refuses to touch anything that is not an explicit, matured, scheduled
deletion.

After that there is nothing to restore. There is no backup you can hand back.
Say this to the customer in those words before they type their company name.

### 7.3 Your side

There is nothing for you to run. Do not use the licence tool to "clean up" — it
only writes licences, it does not delete anything. After a purge, the company
simply stops appearing in `--list`.

If a customer just stops paying and you want the tenant gone, you cannot do it
for them: closure is initiated from inside the portal by their own company
admin. Your only lever is the licence.

---

## 8. Enquiry-to-delivery checklist

Copy this per customer.

```
CUSTOMER: ______________________  DATE: __________

QUALIFY
[ ] Employee count: ______
[ ] Phones running the app: ______
[ ] Kiosk tablets: ______        (each one takes a seat)
[ ] Seats to sell = phones + kiosks + headroom: ______
[ ] Branches: ______   GPS geofence wanted? Y / N
    (only one branch exists; geofence is a manual Firestore edit by me)
[ ] Phones are Android 8.0 or newer: Y / N
[ ] Told them: no iOS app, face recognition not delivered

CREATE
[ ] Company created at https://worktrack-prod.web.app -> "New company? Register"
    (customer typed their own password)
[ ] Verification email opened, admin can sign in
[ ] Company id recorded: ______________________
    (Settings -> Support, or --list)

LICENCE
[ ] cd backend/functions && npm run build   (if not built today)
[ ] Dry run reviewed:
    GOOGLE_CLOUD_PROJECT=worktrack-prod node lib/scripts/set-license.js \
      --company <ID> --plan STANDARD --seats <N> --expires <YYYY-MM-DD> \
      --status ACTIVE --enforce
[ ] Applied with --apply, saw "Licence written."
[ ] --show confirms it
[ ] Customer read the five facts back from Devices & licence
[ ] RENEWAL DATE IN MY OWN CALENDAR: ______________
    (the product will not remind either of us)

SEND
[ ] app-arm64-v8a-release.apk sent (fallback: armeabi-v7a)
[ ] Checksums sent
[ ] Portal URL, support phone/email, company id, licence terms in writing
[ ] Customer guides from delivery/customer/ sent (opened before sending)

FIRST-RUN SESSION
[ ] Signed in, language set
[ ] Settings -> Company settings saved (features, policies, profile)
[ ] Working calendar: explained that a missing day = unexcused absence;
    explained Eid/Ashura/Mawlid must be added by hand each year
[ ] 2-3 employees added WITH basic salary and mobile logins
[ ] Location permission granted by hand on each phone
    (Settings -> Apps -> WorkTrack -> Permissions -> Location; needed on 1.0.0)
[ ] One real punch made on a phone and seen in the portal
[ ] Kiosk created and tested (if bought)
[ ] Payroll run once, "Provisional" explained
[ ] Settings -> Support shown, company id explained
[ ] Geofence document written by me (if wanted), radius >= 150 m

AFTER
[ ] Told them: licence changes are a phone call to me, not self-service
[ ] Told them: app updates come from me by hand, no auto-update
[ ] Told them: closing the account has a 30-day grace period, then nothing
    can be recovered
[ ] Told them: a forgotten admin password can only be reset by me, and a
    second company admin is worth having
```
