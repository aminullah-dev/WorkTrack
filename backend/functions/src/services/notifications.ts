import { ApiError } from "../lib/errors";
import { nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";

/**
 * Telling somebody something happened.
 *
 * Until now nothing did. A worker did not know their leave was approved, a
 * manager did not know a request was waiting, nobody knew a payslip existed —
 * everyone had to open the app and go looking, which mostly meant they did not
 * find out until they asked in person.
 *
 * ---------------------------------------------------------------------------
 * A notification must NEVER break the thing that caused it.
 *
 * Approving leave is the important act; telling the employee about it is not.
 * If the write fails — a bad index, a quota, a bug in here — the approval must
 * still stand. So every function in this module swallows its own errors and
 * logs them, and no caller is given anything to handle. The failure mode being
 * chosen deliberately is "the approval worked and the employee was not told",
 * because the alternative is "the approval was refused because we could not
 * tell them", which is worse in every case.
 * ---------------------------------------------------------------------------
 */

const EASTERN = "۰۱۲۳۴۵۶۷۸۹";

/**
 * Eastern-Arabic digits, because the text around them is Dari.
 *
 * The bodies here are written whole rather than assembled on the client, so
 * anything numeric in them has to arrive already localised — "دورهٔ 1405/06"
 * in an interface where every other number is ۱۴۰۵ reads as a rendering fault,
 * which is exactly how it looked the first time it was opened.
 *
 * The honest limit of that choice: these strings are Dari only. Serving them
 * per reader would mean storing structured data and translating at render
 * time, which is worth doing when notifications reach the apps and not before.
 */
export function easternDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => EASTERN[Number(d)]);
}

export type NotificationKind =
  | "LEAVE_DECIDED"
  | "CORRECTION_DECIDED"
  | "PAYSLIP_READY"
  | "APPROVAL_WAITING";

export interface NotificationDoc {
  employeeId: string;
  kind: NotificationKind;
  /** Already-translated title and body: the sender knows the tenant's language. */
  title: string;
  body: string;
  /** Where the app should go when it is opened. A route, not a URL. */
  link: string | null;
  readAt: FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.Timestamp;
}

export function notificationToDto(
  id: string,
  doc: NotificationDoc,
): Record<string, unknown> {
  return {
    id,
    kind: doc.kind,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    read: doc.readAt !== null,
    createdAt: toIso(doc.createdAt),
  };
}

/**
 * Writes one notification. Never throws.
 *
 * See the module comment: the caller is in the middle of something that
 * matters more than this.
 */
export async function notify(
  cid: string,
  input: {
    employeeId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    link?: string | null;
    /**
     * Makes this notification replaceable rather than repeated.
     *
     * Payroll is deliberately re-runnable, and without a key every re-run sent
     * every employee another "your payslip is ready" — four runs of one month,
     * four identical messages each. With one, the second run overwrites the
     * first exactly as the payslip itself does.
     *
     * Unread state is deliberately reset with it: the news is new again, which
     * is the honest reading when the numbers may have changed.
     */
    dedupeKey?: string;
  },
): Promise<void> {
  try {
    const doc: NotificationDoc = {
      employeeId: input.employeeId,
      kind: input.kind,
      title: easternDigits(input.title),
      body: easternDigits(input.body),
      link: input.link ?? null,
      readAt: null,
      createdAt: nowTimestamp(),
    };
    const id = input.dedupeKey
      ? `${input.employeeId}_${input.dedupeKey}`.slice(0, 1000)
      : ulid();
    await tenant(cid, "notifications").doc(id).set(doc);
  } catch (error) {
    // Logged, not raised. A failure here must not undo an approval.
    console.warn("NOTIFY_FAILED", JSON.stringify({ cid, kind: input.kind }), error);
  }
}

/** The same, for several people at once. Also never throws. */
export async function notifyAll(
  cid: string,
  employeeIds: readonly string[],
  input: {
    kind: NotificationKind;
    title: string;
    body: string;
    link?: string | null;
    dedupeKey?: string;
  },
): Promise<void> {
  await Promise.all([...new Set(employeeIds)].map((employeeId) => notify(cid, { employeeId, ...input })));
}

export async function listNotifications(
  cid: string,
  employeeId: string,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const snap = await tenant(cid, "notifications")
    .where("employeeId", "==", employeeId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => notificationToDto(d.id, d.data() as NotificationDoc));
}

export async function unreadCount(cid: string, employeeId: string): Promise<number> {
  const snap = await tenant(cid, "notifications")
    .where("employeeId", "==", employeeId)
    .where("readAt", "==", null)
    .count()
    .get();
  return snap.data().count;
}

/**
 * Marks one as read.
 *
 * Scoped to the caller's own id on purpose: a notification is addressed to a
 * person, and marking somebody else's as read is not a thing anybody should be
 * able to do by guessing an id.
 */
export async function markRead(cid: string, employeeId: string, id: string): Promise<void> {
  const ref = tenant(cid, "notifications").doc(id);
  const snap = await ref.get();
  if (!snap.exists || (snap.data() as NotificationDoc).employeeId !== employeeId) {
    throw ApiError.notFound("Notification not found");
  }
  await ref.update({ readAt: nowTimestamp() });
}

/** Marks everything the caller has as read. */
export async function markAllRead(cid: string, employeeId: string): Promise<number> {
  const snap = await tenant(cid, "notifications")
    .where("employeeId", "==", employeeId)
    .where("readAt", "==", null)
    .limit(500)
    .get();
  if (snap.empty) return 0;

  const batch = snap.docs[0].ref.firestore.batch();
  const now = nowTimestamp();
  for (const doc of snap.docs) batch.update(doc.ref, { readAt: now });
  await batch.commit();
  return snap.size;
}
