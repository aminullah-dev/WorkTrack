import { db, tenant, toIso } from "../lib/firestore";
import { DEFAULT_LICENSE, isDeviceActive } from "./license";
import type { DeviceDoc, License } from "./license";

/**
 * What the vendor can see across every customer.
 *
 * Deliberately company-level only: name, licence, how many seats are in use,
 * how many people are on the books. No attendance, no payslips, no employee
 * records. The privacy notice tells every customer that Linumic is a processor
 * acting on their written instruction, and a console that browsed their staff
 * would make that untrue — so the reach of this surface is bounded here, in
 * the queries, rather than by remembering not to look.
 */

export interface CompanySummary {
  companyId: string;
  name: string;
  status: string;
  license: License;
  /** Seats occupied by a registered, non-revoked device. */
  devicesInUse: number;
  employeeCount: number;
  /** Null when the licence never expires. */
  daysUntilExpiry: number | null;
  createdAt: string | null;
  deletion: { status: string; purgeAfter: string | null } | null;
}

function daysBetween(fromIso: string, toIsoDate: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIsoDate}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

async function summarise(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  todayIso: string,
): Promise<CompanySummary> {
  const d = doc.data();
  const license: License = { ...DEFAULT_LICENSE, ...(d.license ?? {}) };

  // count() aggregations rather than reading the documents: the vendor needs
  // the number, not the people.
  const [deviceSnap, employeeAgg] = await Promise.all([
    tenant(doc.id, "devices").limit(1000).get(),
    tenant(doc.id, "employees").where("status", "==", "ACTIVE").count().get(),
  ]);

  const deletion = d.deletion as { status?: string; purgeAfter?: string } | undefined;

  return {
    companyId: doc.id,
    name: (d.name as string) ?? "(unnamed)",
    status: (d.status as string) ?? "ACTIVE",
    license,
    devicesInUse: deviceSnap.docs.filter((x) => isDeviceActive(x.data() as DeviceDoc)).length,
    employeeCount: employeeAgg.data().count,
    daysUntilExpiry: license.expiresAt ? daysBetween(todayIso, license.expiresAt) : null,
    createdAt: toIso(d.createdAt ?? null),
    deletion: deletion?.status
      ? { status: deletion.status, purgeAfter: deletion.purgeAfter ?? null }
      : null,
  };
}

export async function listCompanies(todayIso: string): Promise<CompanySummary[]> {
  const snap = await db.collection("companies").limit(500).get();
  const rows = await Promise.all(snap.docs.map((d) => summarise(d, todayIso)));
  // Whatever needs attention soonest, first: expired, then expiring, then the
  // rest. A vendor opening this wants to know what is about to break.
  return rows.sort((a, b) => {
    const av = a.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER;
    const bv = b.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER;
    if (av !== bv) return av - bv;
    return a.name.localeCompare(b.name);
  });
}

export async function getCompany(
  companyId: string,
  todayIso: string,
): Promise<CompanySummary | null> {
  const doc = await db.collection("companies").doc(companyId).get();
  if (!doc.exists) return null;
  return summarise(doc as FirebaseFirestore.QueryDocumentSnapshot, todayIso);
}
