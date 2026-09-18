import { db, tenant } from "../lib/firestore";
import { localDateOf } from "./attendance";
import { getLicense, licenseStanding } from "./license";
import { easternDigits, notifyAll } from "./notifications";
import { getSettings } from "./settings";

/**
 * Telling a company its plan is about to end, before it ends.
 *
 * A term that lapses without warning reads as the product breaking. The whole
 * point of the notice is that the day nothing can be recorded any more is a day
 * the administrator already knew was coming — and could have prevented with one
 * payment from the page this links to.
 *
 * Addressed to whoever can act: company and HR administrators. Telling a
 * labourer on a building site that the company's plan expires on Sunday is well
 * meant and useless.
 */

/** Days before expiry that are worth interrupting somebody for. */
const NOTICE_DAYS = [30, 14, 7, 3, 1];

const ADMIN_ROLES = ["COMPANY_ADMIN", "HR_ADMIN", "SUPER_ADMIN"];

export interface PlanWatchResult {
  companiesChecked: number;
  companiesWarned: number;
}

export async function runPlanWatch(todayOverride?: string): Promise<PlanWatchResult> {
  const companies = await db.collection("companies").limit(1000).get();
  let companiesWarned = 0;

  for (const company of companies.docs) {
    const cid = company.id;
    try {
      const license = await getLicense(cid);
      // Nothing to warn about: a company the vendor has not metered, or one on
      // a perpetual licence, cannot be surprised by an expiry.
      if (!license.enforcePlan || license.expiresAt === null) continue;

      const settings = await getSettings(cid);
      const today = todayOverride ?? localDateOf(new Date(), settings.profile.timezone);
      const standing = licenseStanding(license, today);

      const message = noticeFor(standing.state, standing.daysLeft);
      if (!message) continue;

      const admins = await adminsOf(cid);
      if (admins.length === 0) continue;

      await notifyAll(cid, admins, {
        kind: "APPROVAL_WAITING",
        title: message.title,
        body: message.body,
        link: "/billing",
        // One per company per day, so a company that ignores the first notice
        // does not end up ignoring every notification the product sends.
        dedupeKey: `plan_${today}`,
      });
      companiesWarned += 1;
    } catch (error) {
      // One company's broken settings must not stop the sweep for the rest.
      console.error("PLAN_WATCH_FAILED", JSON.stringify({ cid }), error);
    }
  }

  return { companiesChecked: companies.size, companiesWarned };
}

/** What to say today, or nothing if today is not a day worth saying it. */
export function noticeFor(
  state: "ACTIVE" | "GRACE" | "LAPSED",
  daysLeft: number | null,
): { title: string; body: string } | null {
  if (state === "ACTIVE") {
    if (daysLeft === null || !NOTICE_DAYS.includes(daysLeft)) return null;
    return {
      title: "پلن ورک‌ترک شما رو به پایان است",
      body: `پلن شما تا ${easternDigits(String(daysLeft))} روز دیگر تمام می‌شود. از بخش «پلن و پرداخت» آن را تمدید کنید.`,
    };
  }
  if (state === "GRACE") {
    return {
      title: "پلن شما تمام شده است",
      body: `تا ${easternDigits(String(daysLeft ?? 0))} روز دیگر همه چیز کار می‌کند. پس از آن ثبت معلومات جدید بسته می‌شود، اما معلومات فعلی شما باقی می‌ماند.`,
    };
  }
  return {
    title: "ثبت معلومات جدید بسته شد",
    body: "پلن شما تمام شده است. معلومات و گزارش‌های شما محفوظ و قابل دیدن است؛ با تمدید پلن، ثبت دوباره باز می‌شود.",
  };
}

/** Employees whose login carries a role that can actually act on this. */
async function adminsOf(cid: string): Promise<string[]> {
  const snap = await tenant(cid, "employees").where("status", "==", "ACTIVE").limit(500).get();
  return snap.docs
    .filter((d) => {
      const role = (d.data() as { role?: string }).role;
      return role !== undefined && ADMIN_ROLES.includes(role);
    })
    .map((d) => d.id);
}
