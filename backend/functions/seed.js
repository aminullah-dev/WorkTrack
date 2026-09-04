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

/** Compact Gregorian -> Solar Hijri (year, month) for the current payroll period. */
function gregToShamsi(date) {
  const div = (a, b) => Math.trunc(a / b);
  const B = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  function jalCal(jy) {
    const gy = jy + 621; let leapJ = -14, jp = B[0], jump = 0;
    for (let i = 1; i < B.length; i++) { const jm = B[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(jump % 33, 4); jp = jm; }
    let n = jy - jp; leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4); if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
    const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150; const march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33; let leap = (((n + 1) % 33) - 1) % 4; if (leap === -1) leap = 4;
    return { leap, gy, march };
  }
  function g2d(gy, gm, gd) { let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * ((gm + 9) % 12) + 2, 5) + gd - 34840408; d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752; return d; }
  function d2g(jdn) { let j = 4 * jdn + 139361631; j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908; const i = div(j % 1461, 4) * 5 + 308; const gm = (div(i, 153) % 12) + 1; const gy = div(j, 1461) - 100100 + div(8 - gm, 6); return { gy, gm }; }
  const jdn = g2d(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  const gy = d2g(jdn).gy; let jy = gy - 621; const r = jalCal(jy); const jdn1f = g2d(gy, 3, r.march); let k = jdn - jdn1f;
  if (k >= 0) { if (k <= 185) return { year: jy, month: 1 + div(k, 31) }; k -= 186; } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  return { year: jy, month: 7 + div(k, 30) };
}

const TODAY = isoDaysAgo(0);
const YEAR = Number(TODAY.slice(0, 4));

/** Placeholder check-in "selfie" avatars (SVG data URLs) for the demo overview.
 *  Real captures come from the employee app's camera; these just demo the UI. */
const SELFIE_AVATARS = ["#0a8394", "#2e7d32", "#8a5a00"].map(
  (c) =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' fill='#e7f4f6'/><circle cx='60' cy='46' r='22' fill='${c}'/><path d='M20 110a40 40 0 0 1 80 0z' fill='${c}'/></svg>`,
    ),
);

// --------------------------------------------------------------- org & people

const company = {
  name: "شرکت ساختمانی کابل",
  legalName: "Kabul Construction Co. Ltd",
  timezone: "Asia/Kabul",
  currency: "AFN",
  status: "ACTIVE",
  plan: "PRO",
  // Editable modules + work policies (the dedicated-admin Settings surface).
  settings: {
    features: {
      shifts: true,
      leave: true,
      payroll: true,
      regularization: true,
      announcements: true,
      geofencing: true,
      qrKiosk: true,
      faceRecognition: true,
    },
    policies: {
      standardDailyMinutes: 480,
      weekendDays: [5], // Friday
      lateGraceMinutes: 10,
      overtimeEnabled: true,
    },
    profile: { currency: "AFN", timezone: "Asia/Kabul" },
  },
  updatedAt: now,
};

// A day shift, an overnight shift, and a full 24-hour shift (site security).
const shifts = [
  { id: "sh_day", name: "شیفت روز", code: "DAY", startTime: "08:00", endTime: "16:00", breakMinutes: 60, graceInMinutes: 10, graceOutMinutes: 10, isNightShift: false },
  { id: "sh_night", name: "شیفت شب", code: "NIGHT", startTime: "20:00", endTime: "04:00", breakMinutes: 45, graceInMinutes: 15, graceOutMinutes: 15, isNightShift: true },
  { id: "sh_24", name: "شیفت ۲۴ ساعته", code: "24H", startTime: "08:00", endTime: "08:00", breakMinutes: 120, graceInMinutes: 15, graceOutMinutes: 15, isNightShift: true },
];

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

// BASIC comes from each employee's EmployeeSalary; these are the shared
// earning/deduction components layered on top.
const salaryComponents = [
  { id: "sc_transport", name: "کمک‌هزینه ترانسپورت", code: "TRANSPORT", type: "EARNING", calc: "FIXED", value: 3000, taxable: false, active: true },
  { id: "sc_food", name: "کمک‌هزینه غذا", code: "FOOD", type: "EARNING", calc: "FIXED", value: 2000, taxable: false, active: true },
  { id: "sc_tax", name: "مالیه معاش", code: "TAX", type: "DEDUCTION", calc: "PERCENT_OF_BASIC", value: 5, taxable: false, active: true },
];

// Per-employee monthly basic salary (AFN). The manager (emp_admin) earns more.
const employeeSalaries = {
  emp_admin: 45000,
  emp_hr: 35000,
  emp_ahmad: 28000,
  emp_fatima: 26000,
  emp_omar: 25000,
  emp_yusuf: 24000,
  emp_maryam: 23000,
};

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
  for (const s of shifts) {
    await col("shifts").doc(s.id).set({ companyId: CID, ...s, active: true, updatedAt: now });
  }
  // A small roster for today: two on the day shift, one on nights.
  const roster = [
    { emp: "emp_ahmad", shift: "sh_day" },
    { emp: "emp_omar", shift: "sh_day" },
    { emp: "emp_yusuf", shift: "sh_night" },
  ];
  for (const r of roster) {
    await col("shiftAssignments").doc(`${r.emp}_${TODAY}`).set({
      companyId: CID,
      employeeId: r.emp,
      shiftId: r.shift,
      date: TODAY,
      branchId: "br_main",
      source: "ROSTER",
      updatedAt: now,
    });
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

      // Demo check-in selfies (placeholder avatars) on a few of today's present
      // days, so the manager's overview visibly shows photo-verified attendance.
      const hasSelfie = d === 0 && firstInAt && idx < 3;

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
        checkInSelfie: hasSelfie ? SELFIE_AVATARS[idx % SELFIE_AVATARS.length] : null,
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

  // Pending attendance-correction requests routed to the admin.
  const regs = [
    { id: "reg_1", emp: "emp_ahmad", name: "احمد کریمی", day: isoDaysAgo(3), inH: 8, outH: 16, reason: "فراموش کردم خروج بزنم" },
    { id: "reg_2", emp: "emp_yusuf", name: "یوسف حبیبی", day: isoDaysAgo(2), inH: 8, outH: 15, reason: "سیستم حاضری خراب بود" },
  ];
  for (const r of regs) {
    await col("regularizations").doc(r.id).set({
      companyId: CID,
      employeeId: r.emp,
      employeeName: r.name,
      date: r.day,
      requestedInAt: at(r.day, r.inH, 0),
      requestedOutAt: at(r.day, r.outH, 0),
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

async function seedPayroll() {
  // Per-employee basic salary.
  for (const [empId, basic] of Object.entries(employeeSalaries)) {
    await col("employeeSalaries").doc(empId).set({
      employeeId: empId,
      structureId: null,
      basicAmount: basic,
      currency: "AFN",
      effectiveFrom: "2024-03-21",
      revisionReason: "Initial",
      updatedAt: now,
    });
  }

  // Pre-generate a finalized payroll run for the current Solar Hijri month so
  // payslips are visible immediately in the portal and the employee app. The
  // shape matches services/payroll.ts so a re-run from the portal overwrites it.
  const sh = gregToShamsi(new Date());
  const runId = `${sh.year}_${String(sh.month).padStart(2, "0")}`;
  let totalGross = 0;
  let totalNet = 0;
  let count = 0;
  for (const e of employees) {
    const basic = employeeSalaries[e.id];
    if (!basic) continue;
    const tax = Math.round(basic * 0.05);
    const lines = [
      { componentCode: "BASIC", componentName: "معاش اساسی", type: "EARNING", amount: basic },
      { componentCode: "TRANSPORT", componentName: "کمک‌هزینه ترانسپورت", type: "EARNING", amount: 3000 },
      { componentCode: "FOOD", componentName: "کمک‌هزینه غذا", type: "EARNING", amount: 2000 },
      { componentCode: "TAX", componentName: "مالیه معاش", type: "DEDUCTION", amount: tax },
    ];
    const gross = basic + 3000 + 2000;
    const net = gross - tax;
    await col("payslips").doc(`${e.id}_${runId}`).set({
      companyId: CID,
      runId,
      employeeId: e.id,
      periodYear: sh.year,
      periodMonth: sh.month,
      currency: "AFN",
      gross,
      totalDeductions: tax,
      net,
      workedDays: 22,
      paidLeaveDays: 0,
      lopDays: 0,
      overtimeMinutes: 0,
      status: "FINALIZED",
      pdfUrl: null,
      lines,
      updatedAt: now,
    });
    totalGross += gross;
    totalNet += net;
    count += 1;
  }
  await col("payrollRuns").doc(runId).set({
    companyId: CID,
    periodYear: sh.year,
    periodMonth: sh.month,
    status: "APPROVED",
    startedBy: "emp_admin",
    approvedBy: "emp_admin",
    currency: "AFN",
    payslipCount: count,
    totalGross,
    totalNet,
    lockedAt: now,
    createdAt: now,
    updatedAt: now,
  });
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
  await seedPayroll();
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
