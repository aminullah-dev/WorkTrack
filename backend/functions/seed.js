/*
 * Local demo seed for the Firebase Emulator Suite.
 *
 * Populates the Firestore + Auth emulators with a sample Afghan tenant so the
 * web manager portal and the Android app show real data. No real Firebase
 * project or billing is required — everything runs locally.
 *
 * Run (emulators must be started first):
 *   npm run seed
 *
 * Logins it creates (password for all: Passw0rd!):
 *   admin@worktrack.af   — COMPANY_ADMIN  (use this in the web portal)
 *   hr@worktrack.af      — HR_ADMIN
 *   ahmad@worktrack.af   — EMPLOYEE       (use this in the Android app)
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

// Point the Admin SDK at the local emulators unless already configured.
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-worktrack";
const PASSWORD = "Passw0rd!";
const CID = "comp_kabul";

initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

const now = Timestamp.now();

/** companies/{CID}/{collection} */
function col(collection) {
  return db.collection("companies").doc(CID).collection(collection);
}

/** ISO date (YYYY-MM-DD, UTC) N days before today; 0 = today. */
function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

/** Timestamp at HH:mm UTC on an ISO date. */
function at(iso, hh, mm) {
  return Timestamp.fromDate(new Date(`${iso}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`));
}

const TODAY = isoDaysAgo(0);
const YEAR = Number(TODAY.slice(0, 4));

// --------------------------------------------------------------- org & people

const company = {
  name: "شرکت ساختمانی کابل",
  legalName: "Kabul Construction Co. Ltd",
  timezone: "Asia/Kabul",
  currency: "AFN",
  status: "ACTIVE",
  plan: "PRO",
  updatedAt: now,
};

const branches = [
  {
    id: "br_main",
    name: "دفتر مرکزی کابل",
    code: "KBL-HQ",
    address: "شهرنو، کابل",
    latitude: 34.5553,
    longitude: 69.2075,
    radiusMeters: 250,
    timezone: "Asia/Kabul",
    status: "ACTIVE",
  },
];

const geofences = [
  {
    id: "gf_main",
    branchId: "br_main",
    name: "دفتر مرکزی کابل",
    latitude: 34.5553,
    longitude: 69.2075,
    radiusMeters: 250,
    active: true,
  },
];

const departments = [
  { id: "dep_eng", name: "انجنیری", code: "ENG", branchId: "br_main" },
  { id: "dep_hr", name: "منابع بشری", code: "HR", branchId: "br_main" },
];

const positions = [
  { id: "pos_mgr", title: "مدیر", code: "MGR", level: 5 },
  { id: "pos_eng", title: "انجنیر", code: "ENG", level: 3 },
];

// The manager/admin is emp_admin; everyone else reports to them.
const employees = [
  { id: "emp_admin", employeeCode: "E-001", firstName: "احمد", lastName: "رحیمی", email: "admin@worktrack.af", dept: "dep_hr", pos: "pos_mgr", manager: null },
  { id: "emp_hr", employeeCode: "E-002", firstName: "زهرا", lastName: "نوری", email: "hr@worktrack.af", dept: "dep_hr", pos: "pos_mgr", manager: "emp_admin" },
  { id: "emp_ahmad", employeeCode: "E-003", firstName: "احمد", lastName: "کریمی", email: "ahmad@worktrack.af", dept: "dep_eng", pos: "pos_eng", manager: "emp_admin" },
  { id: "emp_fatima", employeeCode: "E-004", firstName: "فاطمه", lastName: "احمدی", email: "fatima@worktrack.af", dept: "dep_eng", pos: "pos_eng", manager: "emp_admin" },
  { id: "emp_omar", employeeCode: "E-005", firstName: "عمر", lastName: "صدیقی", email: "omar@worktrack.af", dept: "dep_eng", pos: "pos_eng", manager: "emp_admin" },
  { id: "emp_yusuf", employeeCode: "E-006", firstName: "یوسف", lastName: "حبیبی", email: "yusuf@worktrack.af", dept: "dep_eng", pos: "pos_eng", manager: "emp_admin" },
  { id: "emp_maryam", employeeCode: "E-007", firstName: "مریم", lastName: "رستمی", email: "maryam@worktrack.af", dept: "dep_eng", pos: "pos_eng", manager: "emp_admin" },
];

// Auth users -> custom claims. COMPANY_ADMIN sees everything; EMPLOYEE is the
// Android self-service login.
const authUsers = [
  { uid: "emp_admin", email: "admin@worktrack.af", name: "احمد رحیمی", roles: ["COMPANY_ADMIN"] },
  { uid: "emp_hr", email: "hr@worktrack.af", name: "زهرا نوری", roles: ["HR_ADMIN"] },
  { uid: "emp_ahmad", email: "ahmad@worktrack.af", name: "احمد کریمی", roles: ["EMPLOYEE"] },
];

// -------------------------------------------------------------- leave & pay

const leaveTypes = [
  { id: "lt_annual", name: "رخصتی سالانه", code: "ANNUAL", colorHex: "#2E7D32", isPaid: true, requiresAttachment: false },
  { id: "lt_sick", name: "رخصتی مریضی", code: "SICK", colorHex: "#B3261E", isPaid: true, requiresAttachment: false },
];

const salaryComponents = [
  { id: "sc_basic", name: "معاش اساسی", code: "BASIC", type: "EARNING", calc: "FIXED", value: 25000, taxable: true, active: true },
  { id: "sc_transport", name: "کمک‌هزینه ترانسپورت", code: "TRANSPORT", type: "EARNING", calc: "FIXED", value: 3000, taxable: false, active: true },
  { id: "sc_tax", name: "مالیه معاش", code: "TAX", type: "DEDUCTION", calc: "PERCENT_OF_BASIC", value: 5, taxable: false, active: true },
];

const announcements = [
  {
    id: "ann_1",
    title: "جلسهٔ عمومی کارمندان",
    body: "روز یکشنبه ساعت ۱۰ صبح جلسهٔ عمومی در دفتر مرکزی برگزار می‌شود. حضور همه الزامی است.",
    priority: "IMPORTANT",
    createdByName: "احمد رحیمی",
  },
  {
    id: "ann_2",
    title: "پرداخت معاش ماه",
    body: "معاش این ماه تا آخر هفته به حساب‌ها واریز می‌شود.",
    priority: "NORMAL",
    createdByName: "زهرا نوری",
  },
];

// --------------------------------------------------------------------- writes

async function seedOrg() {
  await db.collection("companies").doc(CID).set(company);

  for (const b of branches) {
    await col("branches").doc(b.id).set({ companyId: CID, ...b, updatedAt: now });
  }
  for (const g of geofences) {
    await col("geofences").doc(g.id).set({ companyId: CID, ...g, updatedAt: now });
  }
  for (const d of departments) {
    await col("departments").doc(d.id).set({ companyId: CID, ...d });
  }
  for (const p of positions) {
    await col("positions").doc(p.id).set({ companyId: CID, ...p });
  }
  for (const e of employees) {
    await col("employees").doc(e.id).set({
      companyId: CID,
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: "+93 700 000 000",
      avatarUrl: null,
      branchId: "br_main",
      departmentId: e.dept,
      positionId: e.pos,
      managerId: e.manager,
      employmentType: "FULL_TIME",
      joinDate: "2024-03-21",
      status: "ACTIVE",
      updatedAt: now,
    });
  }
}

async function seedAuth() {
  for (const u of authUsers) {
    try {
      await auth.deleteUser(u.uid);
    } catch {
      // first run: nothing to delete
    }
    await auth.createUser({
      uid: u.uid,
      email: u.email,
      emailVerified: true,
      password: PASSWORD,
      displayName: u.name,
    });
    await auth.setCustomUserClaims(u.uid, {
      cid: CID,
      eid: u.uid,
      r: u.roles,
      b: ["br_main"],
    });
  }
}

async function seedAttendance() {
  // 7 days of attendance for every employee, with realistic variety.
  for (let d = 6; d >= 0; d--) {
    const iso = isoDaysAgo(d);
    const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 5 = Friday
    employees.forEach((e, idx) => {
      let status = "PRESENT";
      let lateMinutes = 0;
      let firstInAt = at(iso, 8, 0);
      let lastOutAt = at(iso, 16, 0);
      let workedMinutes = 480;

      if (weekday === 5) {
        status = "WEEK_OFF"; // Friday is the Afghan weekend
        workedMinutes = 0;
        firstInAt = null;
        lastOutAt = null;
      } else if (d === 0 && idx === 3) {
        status = "ABSENT";
        workedMinutes = 0;
        firstInAt = null;
        lastOutAt = null;
      } else if (d === 0 && idx === 4) {
        status = "LEAVE";
        workedMinutes = 0;
        firstInAt = null;
        lastOutAt = null;
      } else if (idx === 2 && (d === 0 || d === 2)) {
        status = "PRESENT";
        lateMinutes = 25;
        firstInAt = at(iso, 8, 25);
        workedMinutes = 455;
      } else if (d === 1 && idx === 5) {
        status = "HALF_DAY";
        lastOutAt = at(iso, 12, 0);
        workedMinutes = 240;
      }

      col("attendanceDays").doc(`${e.id}_${iso}`).set({
        employeeId: e.id,
        date: iso,
        shiftId: null,
        firstInAt,
        lastOutAt,
        workedMinutes,
        lateMinutes,
        earlyOutMinutes: 0,
        overtimeMinutes: 0,
        status,
        computedAt: now,
        updatedAt: now,
      });
    });
  }
}

async function seedLeave() {
  for (const t of leaveTypes) {
    await col("leaveTypes").doc(t.id).set({ companyId: CID, ...t, active: true, updatedAt: now });
  }
  for (const e of employees) {
    for (const t of leaveTypes) {
      await col("leaveBalances").doc(`${e.id}_${t.id}_${YEAR}`).set({
        employeeId: e.id,
        leaveTypeId: t.id,
        periodYear: YEAR,
        entitledDays: t.id === "lt_annual" ? 20 : 10,
        accruedDays: 0,
        usedDays: 2,
        carriedOverDays: 0,
        pendingDays: 0,
        updatedAt: now,
      });
    }
  }

  // Pending requests routed to the admin so they show in the approvals queue.
  const pending = [
    { id: "lr_1", emp: "emp_ahmad", name: "احمد کریمی", type: "lt_annual", start: isoDaysAgo(-3), end: isoDaysAgo(-5), days: 3, reason: "سفر خانوادگی به هرات" },
    { id: "lr_2", emp: "emp_fatima", name: "فاطمه احمدی", type: "lt_sick", start: isoDaysAgo(-1), end: isoDaysAgo(-1), days: 1, reason: "مریضی و مراجعه به داکتر" },
    { id: "lr_3", emp: "emp_omar", name: "عمر صدیقی", type: "lt_annual", start: isoDaysAgo(-7), end: isoDaysAgo(-9), days: 3, reason: "امور شخصی" },
  ];
  for (const r of pending) {
    await col("leaveRequests").doc(r.id).set({
      companyId: CID,
      employeeId: r.emp,
      employeeName: r.name,
      leaveTypeId: r.type,
      startDate: r.start,
      endDate: r.end,
      startHalfDay: false,
      endHalfDay: false,
      days: r.days,
      reason: r.reason,
      status: "PENDING",
      currentApproverId: "emp_admin",
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function seedExtras() {
  for (const c of salaryComponents) {
    await col("salaryComponents").doc(c.id).set({ companyId: CID, ...c, updatedAt: now });
  }
  for (const a of announcements) {
    await col("announcements").doc(a.id).set({
      companyId: CID,
      title: a.title,
      body: a.body,
      priority: a.priority,
      publishedAt: now,
      expiresAt: null,
      createdByName: a.createdByName,
      updatedAt: now,
    });
  }
  // Holiday calendar with the Afghan weekend note + a public holiday example.
  await col("holidayCalendars").doc("hc_2026").set({
    companyId: CID,
    name: "تقویم رخصتی ۱۴۰۵",
    year: YEAR,
    branchIds: ["br_main"],
    weekendDays: ["FRIDAY"],
    updatedAt: now,
  });
}

async function main() {
  console.log(`Seeding demo tenant into emulators (project=${PROJECT_ID})…`);
  await seedOrg();
  await seedAuth();
  await seedAttendance();
  await seedLeave();
  await seedExtras();
  console.log("\n✅ Done. Sample logins (password: Passw0rd!):");
  console.log("   admin@worktrack.af  — COMPANY_ADMIN (web portal)");
  console.log("   hr@worktrack.af     — HR_ADMIN");
  console.log("   ahmad@worktrack.af  — EMPLOYEE (Android app)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
