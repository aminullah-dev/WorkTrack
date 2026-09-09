import { db } from "../lib/firestore";
import { localDateOf } from "./attendance";
import { expiringDocuments } from "./employeeDocuments";
import { notifyAll } from "./notifications";
import { getSettings } from "./settings";
import { tenant } from "../lib/firestore";

/**
 * The nightly sweep that makes the register worth keeping.
 *
 * A list of documents nobody opens is not a control — it is another place to
 * not look. What turns it into one is somebody being told, unasked, that a
 * work permit runs out in three weeks.
 *
 * Addressed to the people who can act: whoever holds employees:write. Telling
 * the employee their own permit is expiring is well meant and useless — they
 * cannot renew the company's copy or file it.
 */

const WARN_WITHIN_DAYS = 30;

const ADMIN_ROLES = ["COMPANY_ADMIN", "HR_ADMIN", "SUPER_ADMIN"];

export interface DocumentWatchResult {
  companiesChecked: number;
  companiesWarned: number;
  documentsFlagged: number;
}

export async function runDocumentWatch(todayOverride?: string): Promise<DocumentWatchResult> {
  const companies = await db.collection("companies").limit(1000).get();
  let companiesWarned = 0;
  let documentsFlagged = 0;

  for (const company of companies.docs) {
    const cid = company.id;
    try {
      const settings = await getSettings(cid);
      const today = todayOverride ?? localDateOf(new Date(), settings.profile.timezone);
      const due = await expiringDocuments(cid, today, WARN_WITHIN_DAYS);
      if (due.length === 0) continue;

      const admins = await adminsOf(cid);
      if (admins.length === 0) continue;

      const expired = due.filter((d) => d.standing === "EXPIRED").length;
      const soon = due.length - expired;

      await notifyAll(cid, admins, {
        kind: "APPROVAL_WAITING",
        title: "اسناد کارمندان نیاز به توجه دارد",
        body:
          expired > 0
            ? `${expired} سند منقضی شده و ${soon} سند تا ${WARN_WITHIN_DAYS} روز دیگر منقضی می‌شود`
            : `${soon} سند تا ${WARN_WITHIN_DAYS} روز دیگر منقضی می‌شود`,
        link: "/employees",
        // One per company per day. Without it a company with an expired
        // contract nobody renews gets the same message every night until they
        // stop reading any of them.
        dedupeKey: `documents_${today}`,
      });

      companiesWarned += 1;
      documentsFlagged += due.length;
    } catch (error) {
      // One company's bad data must not stop the sweep for everybody else.
      console.warn("DOCUMENT_WATCH_FAILED", cid, error);
    }
  }

  return { companiesChecked: companies.size, companiesWarned, documentsFlagged };
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
