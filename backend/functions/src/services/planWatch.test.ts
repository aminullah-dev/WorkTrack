import { describe, it, expect } from "vitest";
import { noticeFor } from "./planWatch";

describe("when a plan expiry is worth interrupting somebody for", () => {
  it("speaks up a month, a fortnight, a week, three days and one day out", () => {
    for (const days of [30, 14, 7, 3, 1]) {
      expect(noticeFor("ACTIVE", days)).not.toBeNull();
    }
  });

  it("stays quiet on the days in between", () => {
    // A notice every night is a notice nobody reads, including the last one.
    for (const days of [29, 20, 9, 5, 2]) {
      expect(noticeFor("ACTIVE", days)).toBeNull();
    }
    expect(noticeFor("ACTIVE", null)).toBeNull();
  });

  it("says what is still possible during the grace window", () => {
    const notice = noticeFor("GRACE", 4);
    expect(notice?.body).toContain("۴");
  });

  it("says what survived once the term is over", () => {
    // The message a customer reads on the worst day has to say the data is safe.
    expect(noticeFor("LAPSED", 0)?.body).toContain("محفوظ");
  });
});
