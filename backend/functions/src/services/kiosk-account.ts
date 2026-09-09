import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { ApiError } from "../lib/errors";
import { audit, nowTimestamp, tenant, toIso } from "../lib/firestore";
import { ulid } from "../lib/ids";
import { generateTempPassword } from "./invite";

export const kioskAccountCreateSchema = z.object({
  label: z.string().min(1).max(80),
  branchId: z.string().nullish(),
});

export type KioskAccountCreate = z.infer<typeof kioskAccountCreateSchema>;

/** Synthetic, unique login for an unattended kiosk device. */
function kioskEmail(kioskId: string): string {
  return `${kioskId}@kiosk.worktrack.app`;
}

/**
 * Provisions a dedicated KIOSK-role login so a wall-mounted tablet can stay on
 * the check-in screen without a manager's personal account. The account has no
 * employee record — its only power is kiosk:issue (minting rotating QR tokens).
 * Returns the credentials once; the admin types them into the device.
 */
export async function createKioskAccount(
  cid: string,
  payload: KioskAccountCreate,
  actorId: string,
  roles: string[],
): Promise<Record<string, unknown>> {
  const auth = getAuth();
  const kioskId = `kiosk-${ulid().slice(0, 16).toLowerCase()}`;
  const email = kioskEmail(kioskId);
  const password = generateTempPassword();

  await auth.createUser({ uid: kioskId, email, password, displayName: payload.label });
  await auth.setCustomUserClaims(kioskId, {
    cid,
    eid: kioskId,
    r: ["KIOSK"],
    b: payload.branchId ? [payload.branchId] : [],
  });

  const now = nowTimestamp();
  await tenant(cid, "devices").doc(kioskId).set({
    companyId: cid,
    kioskId,
    type: "KIOSK",
    label: payload.label,
    email,
    branchId: payload.branchId ?? null,
    active: true,
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });

  await audit(cid, {
    actorId,
    actorRole: roles.join(","),
    action: "kiosk.account.create",
    resourceType: "devices",
    resourceId: kioskId,
    after: { label: payload.label, email },
  });

  return { kioskId, label: payload.label, email, password, branchId: payload.branchId ?? null };
}

export async function listKioskAccounts(cid: string): Promise<Record<string, unknown>[]> {
  const snap = await tenant(cid, "devices").where("type", "==", "KIOSK").limit(100).get();
  return snap.docs.map((doc) => {
    const d = doc.data() as {
      label?: string;
      email?: string;
      branchId?: string | null;
      active?: boolean;
      createdAt?: FirebaseFirestore.Timestamp;
    };
    return {
      kioskId: doc.id,
      label: d.label ?? doc.id,
      email: d.email ?? null,
      branchId: d.branchId ?? null,
      active: d.active ?? true,
      createdAt: toIso(d.createdAt ?? null),
    };
  });
}

/** Resets a kiosk device's password (e.g. re-provisioning a lost tablet). */
export async function resetKioskPassword(
  cid: string,
  kioskId: string,
): Promise<Record<string, unknown>> {
  const doc = await tenant(cid, "devices").doc(kioskId).get();
  if (!doc.exists) {
    throw ApiError.notFound("Kiosk account not found");
  }
  const password = generateTempPassword();
  await getAuth().updateUser(kioskId, { password });
  return { kioskId, password };
}
