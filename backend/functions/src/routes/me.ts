import { Router } from "express";
import { ApiError, asyncHandler } from "../lib/errors";
import { tenant, db } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { mergeSettings } from "../services/settings";

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
    };

    // Feature flags let both apps hide modules the company has turned off.
    const settings = mergeSettings(company?.settings);

    res.json({
      data: {
        uid: auth.uid,
        companyId: auth.companyId,
        companyName: company?.name ?? "",
        currency: settings.profile.currency,
        employeeId: auth.employeeId,
        displayName:
          [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Employee",
        email: employee.email ?? "",
        avatarUrl: employee.avatarUrl ?? null,
        roles: auth.roles,
        branchIds: auth.branchIds,
        features: settings.features,
      },
    });
  }),
);
