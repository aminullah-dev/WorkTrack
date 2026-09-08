# WorkTrack Privacy Notice

**This is not legal advice.** Linumic is a software vendor, not a law firm.
This notice describes, accurately and in plain language, what the WorkTrack
software actually collects, where it stores it, and who can see it. It is
written so that you and your lawyer have a truthful technical starting point.
Before you publish it to your staff or rely on it in a dispute, have a lawyer
who practises in Afghanistan review it and adapt it to your own contracts and
internal policy.

Two audiences read this document:

- **The company owner or manager** who bought WorkTrack. Sections 2 to 12 tell
  you what your obligations are, because in law the data is yours, not ours.
- **The employee** whose attendance is recorded. Sections 4, 5, 6 and 11 tell
  you what the app on your phone reads, what it sends, and what your employer
  can see.

Section 13 is a short list of things only you can fill in. Until you do, this
notice is incomplete.

---

## 1. What this notice covers

It covers the WorkTrack product as delivered to you: the Android employee app
(version 1.0.1), the manager portal at `https://worktrack-prod.web.app`, the QR
kiosk page, and the server behind them.

It does not cover the marketing site `linumic.com`, and it does not cover the
public demo at `https://demo.linumic.com` — see section 12.

---

## 2. Who is responsible for the data

**Your company is the controller.** You decide to run WorkTrack, you decide who
is enrolled, you decide whether geofencing or face recognition is switched on,
and you decide what to do with the records. In law, the responsibility to your
employees is yours. If an employee asks what is held about them, or asks for it
to be corrected or deleted, they ask you.

**Linumic is the processor.** We build and host the software and act on your
instructions. In practice that means:

- We hold administrative credentials for the Google Cloud project that stores
  your data. We can technically read it. We use that access for support,
  incident investigation, and setup work that the portal does not expose.
- **Work areas (geofences) can only be created by us.** There is no screen or
  API endpoint in the product to add one. If you want GPS check-in restricted
  to a site, you send us the coordinates and radius and we write them into your
  company's data directly.
- Licences are issued by us the same way. Your seat count, plan and expiry are
  written with a vendor tool that runs against the Firebase project itself.
  There is deliberately no way for you to change them — the endpoint was
  removed on purpose. You see the licence read-only under **Devices & licence**.

You should have a written processing agreement with Linumic that says this.
Ask for one if you do not have it.

---

## 3. What WorkTrack stores about an employee

This is the complete list, taken from the code. Every item below is stored on
the server, in your company's own area of the database. One internal record is
the exception and sits outside it — a nightly integrity report described in
section 9.

### Identity and employment

| Field | Where it comes from |
|---|---|
| First name, last name | Entered by an administrator under **Employees** |
| Employee code | Entered by an administrator |
| Email address | Entered by an administrator; also the login |
| Phone number (optional) | Entered by an administrator |
| Branch, department, position, manager | Entered by an administrator |
| Employment type (full time, part time, contract, intern) | Entered by an administrator |
| Join date | Entered by an administrator |
| Status (active, on leave, suspended, exited) | Set by an administrator |

The login itself (email address and password) is held by Google Firebase
Authentication. WorkTrack never stores or sees the password — only Firebase
does, and only as a hash.

There is an `avatarUrl` field on the employee record, but the product has no
way to upload a profile photo. It is always empty.

### Attendance

Every clock-in and clock-out is stored permanently as a separate record. It is
append-only: punches are never edited and never deleted, by anyone, including
us. Each one holds:

- The employee it belongs to, and the exact time
- Whether it is an IN or an OUT
- The method: GPS, QR, FACE, MANUAL or KIOSK
- **Latitude, longitude and GPS accuracy in metres** — see section 4
- Which work area it fell inside, and whether it was inside one
- Which kiosk it was scanned at, if any
- Whether the server accepted it, and if not, why (outside the work area,
  device clock wrong, sent too late, impossible travel, invalid kiosk code)
- Whether the face check passed, when face recognition is switched on

From these, the server computes one summary row per employee per day: first in,
last out, minutes worked, minutes late, minutes early, overtime, and the day's
status. That is what the **Attendance** page shows.

### Leave

- Leave type, start and end date, half-day flags, number of days
- **The reason the employee typed**, up to 1000 characters
- Status, who decided it, when, and their decision note
- Leave balances per year: entitled, used, pending, carried over

### Attendance corrections

When an employee asks to correct a day, the request stores the date, the times
they say are right, and **the reason they typed**.

### Salary and payroll

- Monthly basic salary, entered by an administrator under **Employees**
- For each payroll run: gross pay, deductions, net pay, income tax withheld
  under Article 4 of the Afghan Income Tax Law, employer cost, cost to company,
  days worked, paid leave days, unpaid absence days, and the individual pay
  lines

Payslips are kept indefinitely. Employees see their own in the app; they cannot
see anyone else's.

### Devices

For each phone that signs in, a device record holds a random identifier
generated by the app, the platform, the phone model, the app version, the
employee last signed in on it, and when it was last seen. The identifier is a
random value created on first run — **not** the IMEI, not the Android ID, not
the advertising ID, not anything tied to the handset or the SIM. Reinstalling
the app produces a new one.

### Activity log

Sensitive actions write an entry recording who did it, their role, what they
did, which record, and the before and after values. This includes settings
changes, employee edits, leave decisions, face enrolment and face resets, and
every punch. The punch entry records the method and whether it was accepted —
it does not record the coordinates.

### What WorkTrack does not collect

For the avoidance of doubt, and verified against the code:

- No contacts, call log, SMS, photo gallery, microphone or file access. The app
  declares six permissions: internet, network state, coarse location, fine
  location, camera, and post-notifications. Only location and camera are ever
  put to you in a dialogue; the rest are granted at install or never asked.
- No background location. The permission is not even declared, so the app
  cannot read your position when it is not open on the check-in screen.
- No analytics or crash-reporting SDK. There is no Firebase Analytics, no
  Crashlytics, no advertising SDK, no third-party tracker of any kind.
- No push notification service. The post-notifications permission is declared
  in the manifest but unused — version 1.0.1 contains no notification code and
  no push service, so nothing is ever sent to your phone. If an employee opens
  the app's permission list in Android settings they will see notifications
  listed there; it is inert.
- No national ID or tazkira number, no bank account details, no next of kin,
  no health data, no disciplinary records. There is nowhere to put them.
- No profile photo upload.

---

## 4. Location

**When it is read.** Only while an employee has the check-in screen open in the
app, and only after they grant location permission. The app takes one
high-accuracy fix, waits up to 15 seconds, and will not accept a fix older than
10 seconds. It does not track movement, it does not sample on a timer, and it
cannot read location in the background.

**What is stored.** Latitude, longitude and accuracy are saved on the punch
record and kept for as long as the punch is kept — which is permanently. The
server also records which work area the punch fell inside and whether it was
inside one.

**How it is used.** The server, not the phone, decides whether the punch was
inside a work area. It compares the coordinates against the work areas defined
for your company, crediting GPS accuracy toward the radius. If your company has
no work areas defined, every location is accepted, but the coordinates are
still recorded.

The server also compares each punch against the employee's previous one and
refuses it if the implied travel speed exceeds 250 km/h.

**What managers can see.** The portal does not display coordinates and has no
map. It shows the outcome — accepted, or "Outside the work area". No screen and
no API endpoint gives a manager the stored coordinates: every route a manager
can call returns the day's totals or the check-in photo, never a latitude or a
longitude. An employee's own app can pull their own punches, coordinates
included, because it syncs its own records. For anyone else the only route is
Linumic querying the database directly on your written instruction. The
coordinates are held, and they are retrievable that way, so treat them as
recorded about the employee — but nobody in your company can pull them
unaided.

**If location is refused.** The app says GPS check-in is not possible and
suggests the kiosk QR code instead. Kiosk punches attach a location only if a
fix happens to be available at that moment.

---

## 5. Check-in photos

The server will accept a small photo attached to a check-in, and the manager
portal has a **View check-in photo** button that appears when one exists.

**As shipped, no photo is ever captured or sent.** The Android app version
1.0.1 contains a photo-capture screen, but nothing in the app leads to it — it
is unreachable code, and no check-in path attaches a photo. If you look at the
Attendance page you will never see the button, because there is nothing to
show.

If a later version of the app wires that screen up, employees will start having
their photograph taken and stored on every check-in. That is a material change
and this notice must be updated before it ships. Ask Linumic to confirm in
writing before accepting any app update that enables it.

---

## 6. Face recognition

**It is off by default.** A new company is created with face recognition
switched off. It stays off until a company administrator turns it on under
**Settings → Features → Face recognition**.

Read this section carefully before switching it on. A face template is
biometric data. In most data-protection regimes it is treated as a special
category requiring explicit, informed, freely given consent — and consent that
an employee cannot refuse without losing pay is legally fragile. This is a
decision to take with your lawyer, not a checkbox.

### What actually happens when it is on

The employee's check-in screen gains two extra buttons: **Enroll face** and
**Face check-in**.

**Enrolment.** The employee points the front camera at their face. The phone
detects a face on-device using Google ML Kit. One frame is captured and cropped.
A machine-learning model bundled inside the app — MobileFaceNet, a 5.2 MB file
shipped in the APK — turns that crop into a list of 192 numbers. That list of
numbers is sent to the server and stored on the employee's record, together
with the time of enrolment.

**The photograph is not sent and is not stored.** It exists in the phone's
memory during capture and is discarded. WorkTrack has no server-side storage
for a face image, no upload endpoint for one, and no code that writes one to
disk. This is verified in the code, not a claim from a brochure.

**Verification.** At check-in the same capture happens, the same 192 numbers
are computed on the phone, and they are sent to the server. The server compares
them to the enrolled list mathematically (cosine similarity) and answers match
or no match. Again, no image is sent. On a match the server issues a signed
proof valid for 10 minutes; the check-in carries that proof, so the app cannot
simply claim it was verified.

**Enrolment is once only.** An employee cannot silently re-enrol a different
face over their own record. Replacing an enrolment requires an administrator to
clear it under **Employees → Face → Reset**, which is permission-checked and
written to the activity log.

**A failed face check does not void the check-in.** If face recognition is on
and someone checks in without a valid face proof, the attendance still counts.
The punch is flagged **Needs review** with the note "Recorded without face
verification", so a manager can look at it. This is deliberate: attendance —
and therefore pay — must not depend on a camera working.

**Only GPS and face check-ins are flagged.** Kiosk QR punches and manually
entered punches are never marked Needs review, because they carry their own
proof of presence — a rotating code scanned at the kiosk, or an administrator's
own entry. This matters if you switch face recognition on expecting every
unverified check-in to surface: an employee who declines to enrol and uses the
QR kiosk instead will produce punches that are never flagged.

### Honest limits you should know

- **The match threshold has not been calibrated on real faces.** The code sets
  it to 0.6 and carries a note from the developer saying it should be tuned
  against real enrolment captures before a wide rollout. Until that is done,
  expect some legitimate employees to be rejected, and do not treat a match as
  proof of identity for any purpose beyond flagging a check-in for review.
- **What the stored numbers can be turned back into is not something the code
  can tell you.** WorkTrack contains no function that reconstructs an image
  from the stored vector, and none is shipped. Whether such a vector could be
  reconstructed into a recognisable face by other means is outside what we can
  verify from this product. Treat the stored vector as personal biometric data
  and protect it accordingly. Do not tell your staff it is "just numbers and
  therefore not biometric data" — that is the kind of statement that goes badly
  in front of a regulator or a court.
- The activity log records that an enrolment happened and how many numbers it
  contained. It never records the numbers themselves.

### What we could not determine

- Whether ML Kit's on-device face detector, which is a Google component, sends
  anything to Google. WorkTrack sends it nothing and we found no such call, but
  the internals of that library are not ours and we cannot make a promise on
  Google's behalf. If this matters to you, raise it with your lawyer and with
  Google's own terms for ML Kit.

### If you decide to switch it on

Do not do it silently. At minimum: tell your staff first, in writing, in a
language they read; explain that a numeric face template will be stored on the
server; offer a genuine alternative (the QR kiosk works without any face
capture); and record their consent. Section 13 lists this as something you must
write yourself.

---

## 7. Where the data is stored

WorkTrack runs entirely on Google Firebase. Data is stored in Google Cloud
Firestore, and logins are held in Firebase Authentication. Both are Google
services.

**The server code runs in Google's `us-central1` region — Iowa, United States.**
That is set explicitly in the product's configuration.

**The database's own location is set on the Google Cloud project and is not
recorded anywhere in the product's configuration.** We cannot tell you from the
code which region your Firestore data physically sits in. Ask Linumic to
confirm it in writing, and put the answer in section 13 before you publish this
notice.

**In every case, the data leaves Afghanistan.** There is no on-premises option
and no Afghan hosting. If your company, a contract, or a donor agreement
requires data to stay in the country, WorkTrack as delivered does not meet that
requirement, and no setting changes it.

Nothing is sent to any party other than Google. There is no third-party
analytics, advertising, or data-broker relationship in this product.

---

## 8. Who can see what

Access is decided by role, and refused by default.

| Role | Can see |
|---|---|
| Company admin | Everything in the company |
| HR admin | Employees, attendance, leave, rosters, devices, announcements, payroll (read), activity log |
| Payroll admin | Employees, attendance, leave, and payroll — including running it |
| Branch manager | Their own branch's attendance, leave, rosters and devices — but see below on the employee directory |
| Team lead | Employees, attendance, leave (approve), rosters, announcements |
| Auditor | Read-only: employees, attendance, leave, payroll, activity log |
| Employee | Only their own attendance, leave and payslips, plus announcements |
| Kiosk | Only issues QR codes. It cannot read anyone's records. |

There is one further role in the software, **Finance admin**, which owns expenses
and the general ledger. It cannot be granted to anyone in this version: the
**Employees** screen and the API both offer Employee, Team lead, Branch
manager, HR admin, Payroll admin and Auditor only. Do not go looking for it.
Finance, expenses and the ledger are visible to the company admin, who can see
everything.

**Branch scoping is real on the attendance board, and absent on the employee
directory.** A branch manager or team lead who asks for another branch's
attendance board is refused, not quietly narrowed. The employee directory is
not scoped that way: anyone who can open **Employees** — branch manager, team
lead, and every administrator role — can read any employee record in the
company, whichever branch they belong to. That means name, employee code,
email, phone number, branch, department, position, join date, status and
whether a face is enrolled. Salary is not exposed this way; it needs the
payroll permission. If you were relying on branch boundaries to keep staff
contact details apart, they do not hold here. Ask Linumic if you need this
tightened.

An employee cannot see another employee's attendance, salary or payslip through
the app or the API.

No client application talks to the database directly. Every read and write goes
through the server, which checks the role first.

---

## 9. How long data is kept

**Indefinitely, unless the whole company account is closed.** WorkTrack has no
automatic deletion, no retention timer, and no archiving. Punches, attendance
days, leave records, payroll runs, payslips and the activity log stay until the
company is deleted.

An employee who leaves is marked **EXITED**. Their record and their history
remain. There is no "delete this employee" function in the product — none in
the portal, none in the API. This is a real limitation, and you should know it
before you promise anything to a departing employee.

The only automatic expiry in the product is on short-lived internal
housekeeping records (request replay keys and rate-limit counters), which hold
no personal information.

**One internal record is kept outside your company's data.** A job runs
overnight to check that every attendance day was recalculated correctly. Where
it finds one that was not, it writes a report naming the company, the employee
id and the date. That report is stored in a shared area of the database
belonging to Linumic, not under your company. It has no expiry, and it is not
removed when your company account is purged. It holds no name, no salary and no
coordinates — an employee identifier and a date — but it is employee data and it
outlives everything else. Ask Linumic to delete these reports if that matters to
you.

You should decide how long you actually need these records — Afghan employment
and tax practice generally requires payroll records to be kept for years — and
write that period into section 13. Recognise that the software will not enforce
it for you.

---

## 10. What deletion actually does

The only deletion the product offers is closing the entire company account:
**Settings → Close the company account**.

1. An administrator types the company name back, exactly, to confirm.
2. The company is **marked as closing**. Be clear about what this does not do:
   the software does not block anything during the 30 days. Employees can still
   check in, managers can still approve leave, and payroll can still be run. The
   mark is recorded on the company record and nothing reads it. If you need use
   to actually stop, stop it yourself, or ask Linumic to suspend your licence —
   that is what takes the phones offline.
3. **Nothing is destroyed for 30 days.** During that window any administrator
   can cancel, and everything comes back untouched.
4. After 30 days a scheduled job destroys it.

What the purge destroys, permanently and with no backup you can ask us to
restore from:

- Every employee record, attendance punch and attendance day
- Every leave request and balance
- Every payroll run, payslip and ledger entry
- Every device record and the activity log
- The login of every employee and every kiosk

This cannot be undone. There is deliberately no way to delete one employee, one
month, or one record type — the choice is the whole company or nothing.

**What the purge does not reach.** The job deletes your company's own area of
the database and every login in it. It does not touch the nightly integrity
reports described in section 9, which live outside that area and carry an
employee id and a date. Those survive the purge. If you need them gone as well,
ask Linumic in writing, and do it as part of the same closure request.

---

## 11. Employee rights, and how to exercise them in practice

Your rights are against your employer, not against Linumic. Linumic holds the
data on their instructions and will not act on a request from you directly.

**Access — what is held about me?** Ask your employer. Be aware of what the
product can and cannot do: there is no export button anywhere in WorkTrack. No
CSV, no PDF, no download. A manager can read your attendance on screen under
**Attendance**, your leave under **Leave**, and your payslips under **Payroll**,
and can copy that out by hand or by screenshot. Anything beyond that — your
stored coordinates, for instance — requires Linumic to query the database on
your employer's written instruction. Expect it to take time.

**Your own view.** In the employee app you can see your own attendance history,
your own leave requests and balances, and your own payslips. That is a real
view of most of what is held about you, and it is the fastest route.

**Correction of attendance.** You can file an attendance correction from the
app: give the date, the times you say are right, and a reason. A manager
approves or rejects it in the portal. The original punches are not changed —
they are never changed — but the day's totals are recomputed and that is what
payroll uses.

**Correction of personal details.** Ask your employer. Name, email, phone,
branch, position and employment type are all edited by an administrator under
**Employees**.

**Deletion.** Honestly: the product cannot delete one person. See section 9.
Your employer can close the whole company account, which deletes everyone. They
cannot delete only you. If you need your record removed, that is a conversation
with your employer about their retention policy, and it will have to be done by
Linumic against the database, if at all.

**Face enrolment.** If face recognition is on and you have enrolled, ask an
administrator to clear it under **Employees → Face → Reset**. That removes the
stored template and the enrolment date from your record. It is logged.

**Objection.** If you do not want your position recorded, do not grant the
location permission — the app will tell you to use the QR kiosk instead.
Whether refusing is practical, and what your employer does about it, is between
you and them. The software does not decide that.

**Complaints.** Complain to your employer first, using the contact in section
13. If the complaint is about the software itself rather than your employer's
use of it, Linumic's details are in section 14.

---

## 12. Security, and the demo site

**Security measures actually in the product:**

- All traffic runs over HTTPS to Google's front end.
- No client — not the app, not the portal, not the kiosk — can read the
  database directly. Rules deny it outright; everything goes through the server,
  which checks the caller's role.
- Each company's data lives under its own document tree, and the company is
  taken from the signed login token, not from anything the caller sends. The one
  exception is the nightly integrity report described in section 9, which is
  written outside every company's tree and holds an employee id and a date.
- The Android app is excluded from Android cloud backup and device-to-device
  transfer, so its local copy of your attendance and payroll data is not swept
  into a Google backup.
- Employees can switch on a fingerprint or face lock for the app itself. That
  uses the phone's own Android biometric prompt; WorkTrack never sees the
  fingerprint or the face — the phone only answers yes or no.
- Face recognition can be switched on so that unverified GPS and face check-ins
  are flagged for a manager. Kiosk QR and manual punches are not flagged — see
  section 6.

**Honest limitations:**

- The app's local database on the phone is **not separately encrypted**. It sits
  in the app's private storage, protected by Android's own sandbox and by the
  phone's screen lock. On a rooted or compromised phone it is readable. Insist
  that work phones have a screen lock.
- Sign-in is by email and password. There is no two-factor authentication in
  the product. A manager account is only as strong as its password.
- The employee directory is not branch-scoped. Anyone who can open **Employees**
  — including a branch manager or team lead — can read any employee's name,
  code, email, phone, branch and status company-wide, not just their own branch.
  Salary is not exposed this way. See section 8.
- Stored check-in coordinates are not reachable from any screen or any API
  endpoint a manager can call, and an employee's app pulls only their own. They
  are nonetheless held in the database, and Linumic can query them out on your
  written instruction. They are protected by the absence of a route to them, not
  by any access rule of their own.

**The demo site.** `https://demo.linumic.com` is a public sandbox. It is
**reset and wiped every night**, and anyone on the internet can open it. Never
put a real employee's name, salary, phone number or face into it. It is for
looking at the product, nothing else.

---

## 13. What you must complete yourself

This notice is not usable until your company fills in the following. Until then
it is a technical description, not a privacy notice you can hand to staff.

1. **Your company's own details.** The legal name of the controller, the
   registered address, and the name, role, phone number and email address of
   the person an employee should contact about their data. Put a real person
   there, not "the office".

2. **Your retention period.** How long you will keep attendance, leave and
   payroll records after an employee leaves, and on what legal or tax basis.
   Remember the software will not enforce it — you or Linumic will have to act.

3. **Whether geofencing is on, and where.** List the sites, and tell your staff
   that their coordinates are recorded at check-in. If you have not asked
   Linumic to configure work areas, say so — location is still recorded, it is
   simply not checked against anything.

4. **Whether face recognition is on.** If it is, you must add: why you decided
   to use it, what alternative an employee has (the QR kiosk), how you obtained
   consent, and who to ask to have an enrolment cleared. If it is off, say so
   plainly — most companies should leave it off.

5. **The Firestore region.** Ask Linumic in writing which Google Cloud region
   your database is in, and write the answer here. Confirm with your lawyer
   whether storing employee data in that country is acceptable for your
   contracts and any donor or client obligations you have.

6. **Your internal policy.** Who in your company holds which role, who may run
   payroll, who may view attendance for which branch, who may reset a face
   enrolment, and what you will do when an employee asks to see or correct
   their record. The roles you can actually assign are Employee, Team lead,
   Branch manager, HR admin, Payroll admin and Auditor, plus the company admin
   account itself; Finance admin is defined in the software but cannot be
   granted in this version. Remember that a branch manager's limits apply to the
   attendance board but not to the employee directory (section 8). Roles in
   WorkTrack enforce the technical side. They do not write your policy.

7. **The language you will publish this in.** Your staff read Dari and Pashto.
   The app and the portal are fully translated into both. An English-only
   privacy notice handed to staff who do not read English is not meaningful
   notice.

---

## 14. Contact

**The vendor — Linumic**, Kabul, Afghanistan.

- Phone: +93 793 817 977
- Email: contact@linumic.com
- Web: linumic.com

When you contact us, quote your company ID. You will find it in the portal
under **Settings → Support**, with a copy button next to it. Your licence is
issued against it, and every support conversation starts there.

**Your company's own contact for data questions:** to be completed — see
section 13, item 1.

---

*Prepared by Linumic for the WorkTrack handover pack. Every statement above was
checked against the source code of WorkTrack version 1.0.1. Where the code
could not answer a question, this notice says so instead of guessing.*
