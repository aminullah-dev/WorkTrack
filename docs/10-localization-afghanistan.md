# WorkTrack — Afghanistan Localization Architecture (دری / پښتو)

Version: 1.0 · Status: Approved · Owners: Platform Architecture

WorkTrack is built **for Afghanistan and Afghan organizations**. Dari (دری) and
Pashto (پښتو) are first-class product languages — not translations bolted onto an
English app — and the platform's business calendar is the **Solar Hijri (هجری شمسی)**
calendar. This document specifies how that is implemented across the Android app,
backend, and (future) web admin.

---

## 1. Language policy

| Locale | Role |
|---|---|
| `fa-AF` (Dari) | **Default.** The base `values/` resources are Dari; any unmatched device locale falls back to Dari. |
| `ps-AF` (Pashto) | Full translation (`values-ps/`). |
| `en` | Full translation (`values-en/`) for foreign managers/auditors. |

- Every user-visible string lives in per-module resources with a module prefix
  (`ds_`, `auth_`, `dash_`, `att_`, `leave_`, `pay_`, `prof_`, `nav_`) so library
  resource merging can never silently collide.
- The brand name "WorkTrack" stays in Latin script in all languages.
- `android:localeConfig` (`app/src/main/res/xml/locales_config.xml`) surfaces the
  per-app language setting on Android 13+; the in-app picker in **Profile → زبان**
  uses `AppCompatDelegate.setApplicationLocales` and works on every supported API
  level (`MainActivity` extends `AppCompatActivity` for exactly this reason).

## 2. Error and message localization

- Screen strings resolve via `stringResource` per module.
- Domain/server failures travel as typed `AppError` values (never pre-rendered
  strings). ViewModels emit `AppError` in state/effects; the UI renders it with
  `AppError.localizedMessage()` (`core:designsystem/l10n/ErrorMessages.kt`), which
  maps stable business codes (`GEOFENCE_VIOLATION`, `INSUFFICIENT_LEAVE_BALANCE`,
  `KIOSK_TOKEN_INVALID`, …) to Dari/Pashto/English text.
- Field-level validation surfaces as **field keys**; each screen maps keys to its
  own localized messages, so no English validation text leaks from the domain layer.

## 3. Calendar: Solar Hijri everywhere

- `core:common/time/SolarHijri.kt` implements Gregorian ⇄ Solar Hijri conversion
  (ported from the jalaali-js break-year algorithm, unit-tested incl. round trips
  and leap years). Afghanistan shares the Iranian leap structure; only month names
  differ.
- Afghan month names ship as localized string arrays: Dari **حمل ثور جوزا سرطان اسد
  سنبله میزان عقرب قوس جدی دلو حوت**, Pashto **وری غويی غبرګولی چنګاښ زمری وږی تله
  لړم ليندۍ مرغومی سلواغه کب**, English transliterations for the `en` locale.
- Display formatting is centralized in `core:designsystem/l10n/AfghanFormat.kt`:
  dates, ranges, month headers, and timestamps all render in Shamsi with
  Extended Arabic-Indic digits (۰–۹) for Dari/Pashto.
- **Attendance history pages by Shamsi month** (e.g. سرطان ۱۴۰۵): the ViewModel
  converts the Shamsi month to a Gregorian date range for the Room query.
- **Payroll periods are Shamsi months**: `Payslip.periodYear/periodMonth` carry
  Solar Hijri values (1405/4 = سرطان ۱۴۰۵). Tenant provisioning and the payroll
  engine (P2) must create runs per Shamsi month.
- Storage stays Gregorian/epoch-based (Room, Firestore, API ISO-8601): the
  conversion happens only at the display and query-boundary layers, which keeps
  interop, indexes, and delta cursors calendar-agnostic.

## 4. RTL, digits, typography

- `supportsRtl` + Compose's locale-driven `LayoutDirection` mirror every screen;
  directional icons use the `AutoMirrored` icon set.
- Digits: Latin digits are converted to ۰–۹ at display time (`AfghanDigits`) for
  `fa`/`ps`. Data entry and storage remain ASCII.
- System fonts cover Arabic-script Dari/Pashto (incl. ګ ډ ړ ږ ۍ ...). A custom
  Vazirmatn/Noto Naskh bundle is a P1 polish item.

## 5. Afghanistan business rules

| Rule | Where |
|---|---|
| Weekend = **Friday** (جمعه) | Server holiday calendars mark Friday `WEEK_OFF`; leave settlement excludes Fridays and public holidays on approval (client shows an estimate note). |
| Public holidays (Nawruz, Eid al-Fitr, Eid al-Adha, Ashura, Independence Day…) | Tenant `HolidayCalendar` seeded per year; Eid dates are lunar and entered per-tenant annually. |
| Currency | Default `AFN` (؋); stored per company, formatted with localized digits. |
| Timezone | Default `Asia/Kabul` (UTC+4:30) per company/branch. |
| Payroll | Runs per Solar Hijri month (§3). |

## 6. Testing & workflow

- `SolarHijriTest` covers Nawruz boundaries, leap years (1403 leap / 1404–05 not),
  month lengths, and 730-day round trips.
- Translation source of truth is the resource files; new strings must land in all
  three locales in the same PR (enforceable via `lint missingTranslation` once the
  default-locale declaration `tools:locale="fa"` is added in a lint pass).
- Web admin (P3) reuses the same message catalogs via exported JSON.

## 7. Known gaps (tracked for P1)

- Material date picker still renders a Gregorian grid; a native Shamsi picker
  component is a P1 deliverable (selected dates already display in Shamsi).
- Server-generated `detail` strings inside RFC 7807 problems are English; clients
  render localized text by `code`, so this only affects debugging surfaces.
- Pashto plural forms are simplified (Android quantity strings to be adopted with
  the l10n lint pass).
