import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/errors";
import { audit } from "../lib/firestore";
import { authOf } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { parseBody } from "../middleware/validate";
import {
  classifyDay,
  deleteHoliday,
  eachDate,
  holidayWriteSchema,
  listHolidays,
  saveHoliday,
  seedSolarHolidays,
} from "../services/calendar";
import { getSettings } from "../services/settings";

export const calendarRouter = Router();

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * The company's holidays. Readable by anyone signed in — an employee needs to
 * know the office is closed just as much as the manager who closed it.
 */
calendarRouter.get(
  "/holidays",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    res.json({ data: await listHolidays(auth.companyId, from, to) });
  }),
);

/**
 * Every date in a range with what kind of day it is. This is what makes a quiet
 * Friday distinguishable from an office where nobody showed up.
 */
calendarRouter.get(
  "/days",
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { from, to } = rangeSchema.parse({ from: req.query.from, to: req.query.to });

    const [settings, holidays] = await Promise.all([
      getSettings(auth.companyId),
      listHolidays(auth.companyId, from, to),
    ]);
    const byDate = new Map(holidays.map((h) => [h.date, h]));
    const dates = new Set(holidays.map((h) => h.date));

    res.json({
      data: eachDate(from, to).map((date) => {
        const kind = classifyDay(date, settings.policies.weekendDays, dates);
        const holiday = kind === "HOLIDAY" ? byDate.get(date) : undefined;
        return {
          date,
          kind,
          holidayName: holiday?.name ?? null,
          holidayNameEn: holiday?.nameEn ?? null,
          paid: holiday?.paid ?? null,
        };
      }),
    });
  }),
);

calendarRouter.put(
  "/holidays/:date",
  requirePermission("calendar:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    // The path carries the date; the body may repeat it but the path wins.
    const payload = parseBody(req, holidayWriteSchema.extend({ date: z.string().optional() }));
    const holiday = await saveHoliday(auth.companyId, {
      ...payload,
      date: req.params.date,
    });

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "calendar.holiday.save",
      resourceType: "holidays",
      resourceId: holiday.date,
      after: { name: holiday.name, paid: holiday.paid },
    });

    res.json({ data: holiday });
  }),
);

calendarRouter.delete(
  "/holidays/:date",
  requirePermission("calendar:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    await deleteHoliday(auth.companyId, req.params.date);

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "calendar.holiday.delete",
      resourceType: "holidays",
      resourceId: req.params.date,
    });

    res.status(204).end();
  }),
);

/**
 * Generates the Solar Hijri holidays for a year. Only the fixed ones — the
 * religious holidays follow the moon and are announced days ahead, so they are
 * entered by hand rather than guessed at.
 */
calendarRouter.post(
  "/holidays/seed",
  requirePermission("calendar:write"),
  asyncHandler(async (req, res) => {
    const auth = authOf(req);
    const { year } = parseBody(req, z.object({ year: z.number().int().min(1300).max(1500) }));
    const added = await seedSolarHolidays(auth.companyId, year);

    await audit(auth.companyId, {
      actorId: auth.employeeId,
      actorRole: auth.roles.join(","),
      action: "calendar.holiday.seed",
      resourceType: "holidays",
      resourceId: String(year),
      after: { added },
    });

    res.json({ data: { year, added } });
  }),
);
