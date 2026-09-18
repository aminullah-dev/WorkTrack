import { describe, it, expect, beforeEach } from "vitest";
import { db, tenant } from "../lib/firestore";
import { listHolidays, seedSolarHolidays, saveHoliday, deleteHoliday } from "./calendar";

const EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let cid = "";
let seq = 0;

describe.skipIf(!EMULATOR)("holiday storage", () => {
  beforeEach(async () => {
    cid = `hol_${Date.now()}_${seq++}`;
    await db.collection("companies").doc(cid).set({ name: "Holidays" });
  });

  it("seeds the solar holidays for a year", async () => {
    const added = await seedSolarHolidays(cid, 1405);
    expect(added).toBe(2);
    const hs = await listHolidays(cid);
    expect(hs.map((h) => h.date)).toEqual(["2026-03-21", "2026-08-19"]);
  });

  it("does not duplicate on a second seed", async () => {
    await seedSolarHolidays(cid, 1405);
    expect(await seedSolarHolidays(cid, 1405)).toBe(0);
    expect(await listHolidays(cid)).toHaveLength(2);
  });

  it("leaves an administrator's edit alone when reseeding", async () => {
    await seedSolarHolidays(cid, 1405);
    await saveHoliday(cid, { date: "2026-03-21", name: "نوروز — تعطیل دو روزه", paid: true });
    await seedSolarHolidays(cid, 1405);
    const h = (await listHolidays(cid)).find((x) => x.date === "2026-03-21");
    expect(h?.name).toBe("نوروز — تعطیل دو روزه");
  });

  it("corrects rather than duplicates when the same date is saved twice", async () => {
    await saveHoliday(cid, { date: "2026-04-01", name: "اول", paid: true });
    await saveHoliday(cid, { date: "2026-04-01", name: "دوم", paid: false });
    const hs = await listHolidays(cid);
    expect(hs).toHaveLength(1);
    expect(hs[0].name).toBe("دوم");
    expect(hs[0].paid).toBe(false);
  });

  it("filters to a range", async () => {
    await seedSolarHolidays(cid, 1405);
    expect(await listHolidays(cid, "2026-06-01", "2026-12-31")).toHaveLength(1);
  });

  it("removes one", async () => {
    await seedSolarHolidays(cid, 1405);
    await deleteHoliday(cid, "2026-03-21");
    expect(await listHolidays(cid)).toHaveLength(1);
  });
});
