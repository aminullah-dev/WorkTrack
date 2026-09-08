# WorkTrack Software Licence Agreement

**Linumic — Kabul, Afghanistan**

---

## READ THIS FIRST — DRAFT, NOT LEGAL ADVICE

**This document is a working draft.** It was written by the vendor, who is not
a lawyer, to set out in plain language what Linumic actually does and what the
WorkTrack software actually does.

**It must be reviewed by a lawyer qualified in Afghan law before it is signed
by anyone, or used with any real customer.** It has not been checked against
the Commercial Code, the Law on Commercial Contracts, tax law, labour law, or
any Afghan data or telecommunications regulation. Nothing in it is legal
advice, and no one should rely on it as if it were.

Both parties should take their own legal advice before signing.

Where this draft describes what the software does, those descriptions have been
checked against the product itself and are accurate as at the date on the cover
of the handover pack. Where the product cannot yet do something a customer
would reasonably expect, this draft says so plainly rather than promising it.

---

## 1. The parties

**Linumic** ("the Vendor"), a software vendor based in Kabul, Afghanistan.
Contact: +93 793 817 977, contact@linumic.com, linumic.com.

**[Customer legal name]** ("the Customer"), the company named on the Order Form.

"The Agreement" means this document together with the Order Form (the signed
sheet that records the plan, the number of device seats, the licence period, the
fee, and the WorkTrack company ID issued to the Customer). If the Order Form and
this document disagree, the Order Form wins.

## 2. What WorkTrack is

WorkTrack is an HR, attendance and payroll system with three parts:

- A **manager portal**, used in a web browser at the address given in the
  handover pack. Sections: Dashboard, Employees, Attendance, Shifts, Leave,
  Payroll, Finance, Kiosk, Devices & licence, and Settings.
- An **employee app for Android**, supplied by Linumic as a signed APK file.
  It requires Android 8.0 or later.
- A **kiosk mode**, a browser screen for a shared tablet, using a kiosk login
  created in the portal.

The software is trilingual (Dari, Pashto, English), right-to-left first, uses
the Solar Hijri calendar, Afghani (AFN) as the default currency, Asia/Kabul as
the default timezone, and a Saturday-to-Thursday working week with Friday as the
weekend by default. Payroll income tax is calculated using the monthly brackets
of Article 4 of the Afghan Income Tax Law.

## 3. Grant of licence

Subject to payment of the fees and to the terms below, the Vendor grants the
Customer a **non-exclusive, non-transferable, revocable licence** to use
WorkTrack for the Customer's own internal business purposes, for the licence
period stated on the Order Form.

The licence is granted:

**a) To one named company.** The licence is issued against a single WorkTrack
company ID. That ID is shown in the portal under **Settings → Support**, next to
the "Your company ID" heading, with a Copy button. It is the identifier the
Vendor uses for every licence, renewal and support conversation. The licence
does not extend to a parent company, a subsidiary, a sister company, a joint
venture, or any other legal entity, unless that entity is named on the Order
Form and has its own company ID.

**b) For a stated number of device seats.** The Order Form states a device
limit. **Where enforcement of the device limit is switched on for that licence**,
every Android phone running the employee app and every kiosk tablet occupies one
seat. Where enforcement is switched off — which is the position for any company
to which the Vendor has not yet issued a licence with enforcement on — the limit
is contractual only: no phone ever takes a seat, the registered device list stays
empty, and no device is ever refused. Whether enforcement is on is visible to the
Customer under **Devices & licence**.

Manager access through a web browser does **not** consume a seat — a manager, HR
administrator or accountant can sign in to the portal from any computer.

A device holds its seat until an administrator revokes it in the portal under
**Devices & licence** (the **Revoke** button on the device row). Revoking frees
the seat. A revoked device can be restored later with **Restore**, which takes
a seat again. When every seat is in use, the next new phone is refused; existing
devices keep working. Two limits of that refusal should be understood:

- **The app does not name the seat limit as the reason.** The server sends an
  explanatory message, but the Android app shows a general permission error
  instead — the employee sees "You don't have permission to do that." Tell staff
  in advance, or the call will arrive as a permissions question rather than a
  licence one.
- **Kiosk logins are not refused at the seat limit.** Creating a kiosk login in
  the portal always succeeds, even when every seat is already in use. The kiosk
  still counts against the limit afterwards, so a company can be pushed over its
  seat count this way and then find the next new phone refused. Only phones are
  actually refused at the limit today.

**c) For a stated term.** The Order Form states an expiry date, or states that
the licence is perpetual. The expiry date is judged against the calendar date in
the Customer's own timezone, so a licence does not lapse early.

**d) On the plan stated.** Plans are Free, Standard or Enterprise. The plan,
seat count, status and expiry date are visible to the Customer, read-only, in
the portal under **Devices & licence**.

**Only the Vendor can issue or change a licence.** There is deliberately no
control in the portal, and no API endpoint, that lets a customer change their own
plan, seat count, expiry date or enforcement setting. The portal says so:
"Your licence is issued by Linumic. To add device seats, extend the expiry date
or change your plan, contact us." Changes are made by the Vendor using
credentials for the hosting project that no customer holds.

## 4. What is not granted

The Customer must not, and must not permit anyone else to:

- **Resell, sublicense, rent, lease or host** WorkTrack for a third party, or
  operate it as a service for any company other than the one named on the Order
  Form.
- **Reverse engineer, decompile or disassemble** the software, or attempt to
  derive its source code, except to the extent that Afghan law expressly permits
  this and cannot be contracted out of.
- **Copy, modify or create derivative works** of the software, its APK files, or
  its documentation, beyond the ordinary use and internal backup that this
  licence contemplates.
- **Share login credentials.** Each person who uses WorkTrack must have their
  own account. Kiosk logins are the one exception: a kiosk login belongs to a
  tablet, not to a person, and exists so that a shared check-in screen does not
  need a manager's password. Kiosk credentials must still be kept confidential
  and must not be used to sign in to the manager portal.
- **Remove or obscure** the Vendor's name, notices or branding from the
  software.
- **Use the software to break the law**, including Afghan labour law, tax law,
  and any law that applies to monitoring employees.

The Customer receives a licence to use WorkTrack. **No ownership of the software
transfers.** All intellectual property in WorkTrack, including the source code,
the design, the APK signing identity, and the name "WorkTrack", remains with the
Vendor.

## 5. The Vendor's obligations

**a) Availability.** The Vendor will use **reasonable efforts** to keep the
hosted portal and API available and working.

**There is no service level agreement in this Agreement.** The Vendor does not
commit to an uptime percentage, a maximum outage length, or a guaranteed
response time. If the Customer needs a commitment of that kind, it must be
negotiated and written into the Order Form; otherwise the Vendor is not offering
one and should not be understood to be offering one.

The software is hosted on Google Cloud (Firebase). The Vendor depends on that
platform and on the Customer's internet connectivity, and is not responsible for
outages caused by either.

**b) Support.** The Vendor will provide support by telephone and email during
ordinary working hours in Kabul:

- Phone: +93 793 817 977
- Email: contact@linumic.com

These details are also shown inside the product, under **Settings → Support**.
The Customer should quote its company ID when contacting the Vendor. No
guaranteed response time applies unless one is written into the Order Form.

**c) Updates.** The Vendor may update the portal and issue new versions of the
Android app during the licence period. Updates are included in the fee. The
Vendor does not promise any particular new feature by any particular date;
anything the Customer is relying on must be written into the Order Form.

**d) Licence administration.** The Vendor will issue, renew, extend or adjust the
Customer's licence on request and on payment, normally within a working day.

**e) Confidentiality.** See clause 11.

## 6. The Customer's obligations

**a) Accurate data.** WorkTrack calculates attendance, leave balances, payroll
and income tax from the data the Customer enters. The Customer is responsible
for the accuracy of that data — employee records, salaries, shifts, leave types,
holidays, and attendance corrections.

Two points are worth stating explicitly, because they change payroll figures:

- A working day with **no attendance record at all** is treated as unexcused
  absence and is deducted from pay.
- **Public holidays count as working days unless they are entered** in the
  portal under **Settings → Working calendar**. Nawroz and Independence Day are
  fixed in the Solar Hijri calendar and are created for the Customer for the
  first two years, at signup. From then on an administrator must set the year on
  **Settings → Working calendar** and press **Generate this year's fixed
  holidays** at the start of each year; if that is not done, those two days are
  absent from the calendar and are deducted as unexcused absence like any other
  unrecorded working day. Eid al-Fitr, Eid al-Adha, Ashura and Mawlid follow the
  moon and are announced by sighting, so the Customer must add them by hand each
  year.

**b) Lawful use.** The Customer is responsible for using WorkTrack in a way that
complies with Afghan labour law, tax law, and any rules on employee monitoring.
This includes telling employees what is collected about them (see clause 9),
obtaining any consent the law requires, and paying its own taxes correctly.
WorkTrack calculates tax using published brackets; **it is not tax advice, and
the Customer remains responsible for its own tax filings.**

**c) Credentials and devices.** The Customer must keep account passwords
confidential, give each user their own account, mark leavers as **Exited** and
reset their password (**Employees → Reset password**) so their old one stops
working — **there is no way to delete an employee account, and marking someone
Exited does not by itself disable their login** (see clause 10(c)) — and revoke
the device seats of phones and tablets that are lost, sold or retired. The
Vendor is not responsible for what someone does with credentials the Customer
failed to protect.

**d) Administrators.** The Customer must appoint at least one company
administrator. Only a company administrator can close the company account
(clause 10).

**e) Fees.** The Customer must pay the fees in clause 7.

## 7. Fees and renewal

**a) Fees.** The licence fee, the currency, the billing period and the payment
method are stated on the Order Form. **No prices are set in this document.**

**b) Payment.** Invoices are payable by the date stated on the invoice. Unless
the Order Form says otherwise, fees are stated exclusive of any tax, duty or
bank charge, and the Customer pays those in addition.

**c) Term and renewal.** The licence runs for the period on the Order Form. It
does **not** renew automatically. Before the expiry date, the parties should
agree a renewal and the Vendor will extend the licence. If no renewal is agreed,
the licence expires on its expiry date and clause 8 applies.

**d) Adding seats.** The Customer may ask for more device seats at any time. The
Vendor will quote and, on payment, raise the limit. Reducing the seat count on a
renewal does not un-register devices that are already registered; it means the
next new phone is refused, subject to the two limits described in clause 3(b) —
the refusal is not explained to the employee, and a kiosk login is created even
when the seats are full. The Customer should revoke retired devices in the portal
to tidy the count.

**e) Refunds.** Unless the Order Form says otherwise, fees already paid are not
refundable, including where the Customer stops using the software before the end
of the period.

## 8. Suspension and expiry — what actually happens

This clause describes the real behaviour of the software, so that neither party
is surprised.

**a) Suspension for non-payment.** If an invoice is materially overdue, the
Vendor may set the Customer's licence status to **Suspended**, after giving the
Customer written notice (email is sufficient) and a reasonable chance to pay.

**b) Expiry.** If the licence expiry date passes without renewal, the licence
stops being usable.

**c) What suspension or expiry does.** In either case, and **only where
enforcement of the device limit is switched on for that licence**:

- The **Android employee app and the kiosk screens stop working.** Check-ins can
  no longer be filed from a phone or a kiosk. The product does not yet name the
  licence as the reason: the server sends that explanation, but the Android app
  shows a general permission error ("You don't have permission to do that.") and
  the kiosk screen shows a general error ("Something went wrong"). The Customer
  should tell its staff in advance what a suspension will look like.
- **The manager portal continues to work.** Managers, HR and finance staff can
  still sign in, read existing records, run reports and manage employees. This
  is deliberate: suspension is meant to stop new attendance being captured, not
  to lock the Customer out of its own payroll history.
- **No data is deleted.** Suspension and expiry do not destroy anything.

If enforcement is switched off for the licence, suspension or expiry has no
technical effect at all; it remains a contractual breach, but the software keeps
running. Whether enforcement is on is visible to the Customer under
**Devices & licence**.

**d) Restoring.** On payment or renewal, the Vendor sets the licence back to
Active. Devices resume working. Because licence state is cached briefly on the
server, there can be a delay of up to about a minute before devices recover.

**e) Termination for breach.** Either party may terminate this Agreement if the
other is in material breach and has not fixed it within 30 days of written
notice. On termination by the Vendor for the Customer's breach, the Vendor may
set the licence to Suspended with the effects described above. The Customer's
right to a copy of its data under clause 10 survives.

## 9. Data — ownership and content

**a) The Customer owns its data.** All data the Customer or its employees put
into WorkTrack — employee records, attendance, leave, shifts, salaries, payroll
runs, payslips, expenses, ledger entries, documents and settings — belongs to
the Customer. The Vendor claims no ownership of it and does not sell it, rent
it, or use it for advertising.

**b) What the Vendor may do with it.** The Vendor processes the Customer's data
only to run the service, to provide support the Customer asks for, and to fix
faults. Vendor staff access a customer's records only when the Customer asks for
help or when it is necessary to fix a fault. The Vendor may use aggregated,
non-identifying operational information (for example, how many companies are
active) to run its own business.

**c) What the software collects about employees.** The Customer should read this
and tell its staff, because some of it is personal data:

- Name, contact details, job details, salary and bank/payment details as entered
  by the Customer.
- Check-in and check-out times, and the method used.
- **GPS location** at the moment of **every** check-in made from the employee
  app. Location is always captured and always stored with the attendance record.
  The **Geofencing (GPS)** switch in **Settings → Features** does not currently
  turn this off — it only affects whether a punch made outside a defined
  geofence is flagged. The location is also checked against the Customer's own
  geofences on the server.
- **A check-in selfie photo.** The database and the portal can hold and display
  one, but **the employee app does not capture a check-in photo today** and
  there is no setting to turn this on. No check-in photo is produced by the
  product as supplied.
- **Device information** — a device identifier, the platform, the model and the
  app version — for every registered phone and kiosk.
- **Face recognition is switched off by default** (`Settings → Features`). If the
  Customer switches it on, the Android app computes a numeric face descriptor on
  the phone itself and sends only that numeric vector. No face photograph is
  sent to or stored on the server for face recognition.
- An internal audit trail of administrative actions (who changed what, and when).

The Customer decides in **Settings → Features** which features to switch on, and
is responsible for the lawfulness of that decision. Two of the collections above
are **not** governed by that page and cannot be switched off there: GPS location
is captured on every check-in made from the employee app whatever the Geofencing
(GPS) switch is set to, and device information is recorded for every registered
phone and kiosk. The Customer should not tell its staff that turning Geofencing
off stops location being collected.

**d) Where the data is held.** WorkTrack runs on Google Cloud (Firebase). The
application servers run in Google's `us-central1` region in the United States.
**The Customer's data is therefore stored and processed outside Afghanistan.**
The Customer should satisfy itself that this is acceptable for its own records
and for any rule that applies to it.

**e) Security.** The Vendor uses the access controls, per-company separation and
role-based permissions built into the product, and relies on Google Cloud for
platform security. The Vendor does not claim any security certification and has
not been independently audited. No system is perfectly secure.

## 10. Getting your data out, and deletion

This clause describes what the product does today. Please read part (a)
carefully.

**a) There is no self-service export.** WorkTrack has **no** button, screen or
API that exports the Customer's data to a file. There is no CSV export, no Excel
export, no PDF download of payslips, and no "download all my data" function
anywhere in the portal or in the app. Data can be read on screen in the portal
and printed from the browser, but it cannot be exported by the Customer alone.

Accordingly, if the Customer needs a machine-readable copy of its data — on
termination, for an audit, for a tax inspection, or for any other reason — it
must **ask the Vendor**, and the Vendor will extract it manually from the
database and provide it in a common format (for example CSV or JSON). The Vendor
will do this within **30 days** of a written request, at no charge, once, on or
after termination. Requests during the licence period, or repeated requests, may
be charged at the Vendor's time-and-materials rate agreed in advance.

The Customer should therefore make an export request **before** initiating the
account closure described in part (b), and should not assume it can retrieve its
own records after deletion.

**b) Closing the company account.** A company administrator can close the
account from the portal, under **Settings → Close the company account**. The
software:

1. Requires the administrator to **type the company name exactly** to confirm.
2. States plainly what will be destroyed: every attendance and leave record;
   every payroll run, payslip and ledger entry; and the login of every employee
   and kiosk.
3. Marks the account for closure and shows the date, in the Solar Hijri
   calendar, on which the data will be deleted.
4. **Waits 30 days.** During those 30 days the closure can be cancelled from the
   same screen with the **Cancel and reactivate** button, and everything comes
   back untouched.
5. After the 30 days have fully elapsed, a scheduled job **permanently deletes**
   the company and everything beneath it, and deletes the Firebase login of
   every employee and every kiosk of that company.

**Step 5 is irreversible. There is no undo, and the Vendor cannot restore the
data afterwards.**

**c) Deletion of individual records.** The product does not provide a way to
delete or anonymise a single employee's historical attendance or payroll records
while keeping the rest. Their historical records remain, as payroll and labour
records normally must.

An employee can be marked as **Exited**, which removes them from the attendance
board and from payroll runs. **It does not disable their login.** The product has
no way to disable or delete an employee account: an Exited employee can still
sign in to the Android app, punch in and out, and view their own records. To stop
a leaver signing in, an administrator must reset their password
(**Employees → Reset password**) so the old one no longer works, and revoke their
device under **Devices & licence**.

**d) Backups.** The Vendor relies on the hosting platform's own durability. The
Vendor does **not** operate a separate, independently restorable backup of
customer data, and does not offer point-in-time restore. Deleted data is gone.

**e) After termination.** Unless the Customer closes the account itself under
part (b), the Vendor will keep the Customer's data for **90 days** after the
licence ends, so that a renewal or an export request is still possible, and may
then delete it. The Vendor will give the Customer written notice before deleting
data under this part.

## 11. Confidentiality

Each party may learn confidential information of the other — for the Vendor, the
Customer's employee, payroll and business data; for the Customer, the Vendor's
pricing, technical design and non-public documentation.

Each party will keep the other's confidential information confidential, use it
only for the purposes of this Agreement, and disclose it only to its own staff
and advisers who need it and who are under a duty of confidence.

This does not apply to information that is public through no fault of the
receiving party, that the receiving party already lawfully had, or that must be
disclosed by law or by a competent authority — in which case the receiving party
will tell the other party first, if it is lawfully able to.

These obligations continue for **three years** after this Agreement ends. The
Vendor's obligation in respect of the Customer's employee and payroll data
continues for as long as the Vendor holds that data.

## 12. Warranties and disclaimer

**a) The Vendor warrants** that it has the right to grant this licence, and that
the software will perform substantially as described in the documentation
supplied with it. If it does not, the Customer's remedy is to tell the Vendor,
and the Vendor will use reasonable efforts to fix the fault within a reasonable
time; if it cannot, the Vendor will refund the fee for the unexpired part of the
licence period.

**b) Otherwise, the software is provided "as is".** To the fullest extent
permitted by Afghan law, the Vendor disclaims all other warranties, express or
implied, including any implied warranty of merchantability, fitness for a
particular purpose, uninterrupted or error-free operation, or that the software
will meet any requirement the Customer has not written into the Order Form.

**c) The Vendor is not the Customer's accountant, tax adviser or lawyer.**
WorkTrack calculates payroll and income tax using the monthly brackets of
Article 4 of the Afghan Income Tax Law as the Vendor understands them. It is a
calculation tool. **The Customer remains responsible for the correctness of its
own payroll, its own tax withholding and its own filings**, and should have them
checked by a qualified accountant. Payroll runs for a month that has not ended
are marked "Provisional" and cover only the days elapsed so far; a provisional
run is not a final payroll.

**d) Third-party platforms.** The Vendor does not warrant Google Cloud, Android,
the Customer's devices, or the Customer's internet connection.

## 13. Limitation of liability

**a) Nothing excluded that cannot be.** Nothing in this Agreement limits either
party's liability for fraud, for wilful misconduct, or for anything else that
Afghan law does not allow to be limited.

**b) No indirect loss.** Neither party is liable to the other for indirect or
consequential loss, loss of profit, loss of business, loss of goodwill, or loss
of anticipated savings, however caused.

**c) Cap.** Subject to (a), each party's total liability under this Agreement,
for all claims taken together, is limited to **the total fees paid by the
Customer under this Agreement in the 12 months before the event giving rise to
the claim**.

**d) Data loss.** The Customer acknowledges that it, not the Vendor, controls
what is entered into WorkTrack, that the Vendor does not operate an independent
restorable backup (clause 10(d)), and that permanent deletion under clause 10(b)
is initiated by the Customer's own administrator. The Vendor is not liable for
data lost through the Customer's own use of the account-closure function, or
through the Customer's failure to request an export in time.

## 14. Governing law and disputes

**a) Governing law.** This Agreement is governed by the laws of the Islamic
Emirate of Afghanistan.

**b) Language.** This Agreement may be issued in English, Dari and Pashto. The
parties should agree on the Order Form which version prevails if they differ.
*(Point for the lawyer: which language version governs, and whether an Afghan
court will accept an English-language contract, needs to be settled properly.)*

**c) Good-faith discussion first.** If a dispute arises, the parties will first
try to resolve it by direct discussion between senior representatives, within 30
days of one party notifying the other in writing.

**d) If that fails.** If the dispute is not resolved, it will be submitted to
the competent courts of Kabul, Afghanistan, which will have exclusive
jurisdiction.

*(Point for the lawyer: whether commercial arbitration in Kabul is preferable to
the courts here, and which arbitral body should be named, is a decision the
Vendor has not yet taken.)*

## 15. General

**a) Changing this Agreement.** This Agreement can only be changed in writing,
signed by both parties. **The Vendor cannot change these terms unilaterally**,
and posting new terms on a website does not change this Agreement.

Prices, seat counts and the licence period are changed by agreeing a new Order
Form, which both parties sign; the new Order Form replaces the old one and this
document continues to apply.

**b) Notices.** Notices must be in writing. Email is sufficient: to the Vendor at
contact@linumic.com, and to the Customer at the address on the Order Form. A
notice is treated as received on the next working day in Kabul.

**c) Assignment.** The Customer may not assign or transfer this Agreement, or
its licence, without the Vendor's written consent. Consent will not be
unreasonably refused where the Customer's business is transferred as a whole.

**d) Force majeure.** Neither party is liable for a failure caused by something
outside its reasonable control, including internet or power failure, an outage
at Google Cloud, natural disaster, or an act of government.

**e) No partnership.** Nothing here makes the parties partners, or either the
agent of the other.

**f) Entire agreement.** This document and the Order Form are the whole agreement
between the parties about WorkTrack, and replace anything said or written
beforehand.

**g) Severability.** If any part of this Agreement is held to be invalid, the
rest continues in force.

**h) Survival.** Clauses 4, 9, 10, 11, 12, 13 and 14 survive the end of this
Agreement.

---

## Signatures

| | Linumic | Customer |
|---|---|---|
| Name | | |
| Title | | |
| Signature | | |
| Date | | |
| Company ID | — | |

---

# Gaps the Vendor must close, or must not promise

**This section is addressed to Linumic, not to the customer.** It should be
removed before this document is issued, once each item is either fixed or
consciously accepted. It lists the places where a customer's reasonable
expectation and the product's actual behaviour do not yet meet.

**1. There is no self-service data export. This is the biggest gap.** Nothing in
the portal, the API or the Android app produces a downloadable file — no CSV, no
Excel, no PDF payslip. A customer that closes its account and then asks for its
payroll history will need manual extraction from Firestore, done by hand, by
you. Until an export exists:
- Do not say "you can export your data" in any sales conversation.
- Keep clause 10(a) as written, including the 30-day manual commitment, and be
  sure you can actually meet it.
- Build at least a CSV export for attendance, payroll runs and payslips. This is
  also what a tax inspection will ask for.

**2. The account-closure suspension is written but not enforced.**
`companyDeletion.ts` sets the company document's `status` to `SUSPENDED` when
closure is requested, and the code comment says nobody should keep filing
attendance into a tenant on its way out. Nothing in the API reads that field.
During the 30-day grace period the company keeps working normally. This draft
therefore does not claim the account is suspended during the grace period —
which is honest, but the code and its own comment disagree with each other, and
that should be fixed one way or the other.

**3. Suspension for non-payment only bites if enforcement is on.** If
`enforceDevices` is false — which is the default for any company with no licence
on file — setting the licence to Suspended or Expired does nothing at all. Do
not tell a customer their access will stop unless you have actually issued them
a licence with `--enforce`. Check this before relying on suspension as a
collections tool.

**4. Suspension never affects the manager portal.** `deviceGuard` applies only
to EMPLOYEE and KIOSK roles. A suspended customer's managers keep full access,
including running payroll. Clause 8(c) says so openly; decide whether that is
the commercial behaviour you want.

**5. No independent backup.** You rely entirely on Firestore durability. There
is no export, no scheduled dump, and no point-in-time restore. Clause 10(d) and
clause 13(d) are written to reflect that. Do not promise backup or recovery to
anyone. A nightly export to Cloud Storage would close both this gap and gap 1.

**6. Data is hosted in the United States.** Functions run in `us-central1`, and
the Firestore database is in a Google region, not in Afghanistan. Clause 9(d)
discloses this. If a customer — particularly a ministry, an NGO, or a bank —
requires data residency in Afghanistan, you cannot meet it, and must say so
before signing rather than after.

**7. The audit trail is not readable by anyone.** `auditLogs` is written for
every significant action, and the RBAC catalogue grants `audit:read` to HR,
finance and auditor roles, but there is no API route and no portal screen that
reads it back. Do not promise an audit report. A customer who asks "who changed
this salary?" cannot be answered today without you querying the database
directly.

**8. There is no per-employee data deletion or anonymisation.** Clause 10(c)
states this honestly. If a customer or a future regulation requires erasing one
person's records, the only tool is deleting the entire company. Worth building.

**9. No SLA exists, and none should be implied.** This draft deliberately
commits to "reasonable efforts" and no numbers. Do not let a sales conversation,
an email, or a proposal put an uptime percentage or a response time in writing
unless you intend to be held to it and have the monitoring to prove it.

**10. Marking an employee Exited does not stop them using the system.** The auth
middleware builds its context from the Firebase custom claims alone and never
reads the employee document's status; no route disables or deletes a leaver's
login. EXITED only filters them out of the attendance board and out of payroll.
An offboarded employee can still sign in, punch and sync until someone resets
their password. Clause 6(c) and clause 10(c) now say so. Build a real disable —
this is the offboarding step every customer will assume exists, and getting it
wrong leaves live accounts open.

**11. The Geofencing (GPS) switch does not control location collection.** Every
self-service punch from the Android app is a GPS or FACE punch, coordinates are
mandatory for those methods, the geofence check always runs, and latitude,
longitude and accuracy are always written to the punch. `features.geofencing` is
read nowhere in the backend and nowhere in the app except when it is copied into
the session model. A customer can switch it off, tell its staff location is no
longer collected, and be wrong. Either make the switch stop collection or rename
it; clause 9(c) discloses the gap in the meantime.

**12. Licence and seat-limit refusals are invisible to the user.** The API
returns proper messages ("This company's licence is not active", the seat-limit
refusal), but `ApiCall` maps every 403 to `AppError.PermissionDenied` and throws
the server's detail away, so the employee reads "You don't have permission to do
that."; the kiosk shows "Something went wrong". Support calls will arrive as
permission complaints, not licence questions. Surfacing the server's `detail` for
403 is a small change and worth making before suspension is used for collections.

**13. Kiosk logins bypass the seat limit.** `createKioskAccount` writes the
device document directly with `active: true` — no licence read, no `countActive`,
no limit check. The limit is enforced only in `activateDevice`, which nothing but
the phone path reaches. A kiosk is therefore created over the limit and then
counts against it, refusing the next phone. Add the limit check, or keep the
disclosure now in clause 3(b).

**14. There is no check-in selfie.** `SelfieCaptureRoute` exists but is
referenced from nowhere in the repo, no code path ever sets `PunchCommand.selfie`,
and there is no photo-verified check-in flag in the feature list. The field is
carried through the DTO, the model and the portal, so it looks built. Do not sell
photo-verified check-in; clause 9(c) now says the app does not capture one.

**15. Fixed Solar Hijri holidays are only seeded for two years.** `signup.ts`
seeds `shamsiYear` and `shamsiYear + 1`; after that `seedSolarHolidays` runs only
when an administrator presses the button on the Working calendar card. A customer
in year three whose administrator forgets will see Nawroz and Independence Day
deducted as unexcused absence. Clause 6(a) now tells them to press it each year —
a scheduled job would be better.

**16. Legal points still open, listed here so the lawyer sees them:**
- Which language version of the contract governs, and whether an Afghan court
  will accept an English-language contract.
- Courts of Kabul versus commercial arbitration, and which arbitral body.
- Whether the liability cap in clause 13(c) is enforceable under Afghan law.
- Whether any Afghan rule governs the collection of employee GPS location —
  which today happens on every app check-in and cannot be switched off — or of
  face descriptors, and whether employee consent must be obtained in a
  particular form. (The check-in selfie is not collected today; see gap 14.)
- Whether the transfer of employee personal data outside Afghanistan needs a
  legal basis or a notification.
- Tax treatment of the licence fee, and whether withholding applies.

**17. Fill in before issuing:** the customer's legal name, the Order Form
figures, and Linumic's own registration details (licence number, tax
identification number, registered address) if an Afghan commercial contract
requires them — which it very likely does.
