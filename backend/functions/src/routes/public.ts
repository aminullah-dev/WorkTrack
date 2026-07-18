import { Router } from "express";
import { asyncHandler } from "../lib/errors";
import { parseBody } from "../middleware/validate";
import { companySignupSchema, provisionCompany } from "../services/signup";

/**
 * Unauthenticated routes (mounted before the auth middleware). Keep this
 * surface minimal — only self-service company signup lives here.
 */
export const publicRouter = Router();

publicRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const input = parseBody(req, companySignupSchema);
    const result = await provisionCompany(input);
    res.status(201).json({ data: result });
  }),
);
