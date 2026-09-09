import { Router } from "express";
import { ApiError, asyncHandler } from "../lib/errors";
import { tenant, db } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import { mergeSettings } from "../services/settings";
import { embeddingSchema, enrollFace } from "../services/face";

export const meRouter = Router();

/** Resolves the caller's profile + tenant context for session bootstrap. */
meRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);

    const [companySnap, employeeSnap] = await Promise.all([
      db.collection("companies").doc(auth.companyId).get(),
      tenant(auth.companyId, "employees").doc(auth.employeeId).get(),
    ]);
    if (!companySnap.exists || !employeeSnap.exists) {
      throw ApiError.permissionDenied("Account is not provisioned for any company");
    }
    const company = companySnap.data() as
      | { name?: string; currency?: string; settings?: Parameters<typeof mergeSettings>[0] }
      | undefined;
    const employee = employeeSnap.data() as {
      firstName?: string;
      lastName?: string;
      email?: string;
      avatarUrl?: string | null;
      faceEmbedding?: unknown;
    };

    // Feature flags let both apps hide modules the company has turned off.
    const settings = mergeSettings(company?.settings);

    res.json({
      data: {
        uid: auth.uid,
        companyId: auth.companyId,
        companyName: company?.name ?? "",
        currency: settings.profile.currency,
        // Attendance days are filed in the company's timezone, so every client
        // must resolve "today" in it — a manager abroad would otherwise ask for
        // their own local date and see an empty board.
        timezone: settings.profile.timezone,
        employeeId: auth.employeeId,
        displayName:
          [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Employee",
        email: employee.email ?? "",
        avatarUrl: employee.avatarUrl ?? null,
        roles: auth.roles,
        branchIds: auth.branchIds,
        features: settings.features,
        faceEnrolled: Array.isArray(employee.faceEmbedding),
      },
    });
  }),
);

/**
 * Enroll the caller's own face: the app computes the embedding on-device and
 * sends only the numeric vector (never a photo). Stored on the employee record
 * and used to verify future face check-ins.
 *
 * Gated on self:punch so shared device accounts (kiosks) cannot enroll a face.
 * Enrolling twice is refused — see enrollFace.
 */
meRouter.post(
  "/face/enroll",
  requirePermission("self:punch"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { embedding } = parseBody(req, embeddingSchema);
    await enrollFace(auth.companyId, auth.employeeId, embedding);
    res.status(201).json({ data: { faceEnrolled: true } });
  }),
);
