import { describe, it, expect } from "vitest";
import { nextEmployeeCode } from "./employees";

describe("nextEmployeeCode", () => {
  it("starts a brand-new company at E-001", () => {
    // Not reachable through the product — signup always writes E-001 for the
    // founding admin — but the function must not depend on that being true.
    expect(nextEmployeeCode([])).toBe("E-001");
  });

  it("follows the code signup already wrote", () => {
    // The first employee an administrator adds after signing up.
    expect(nextEmployeeCode(["E-001"])).toBe("E-002");
  });

  it("continues from the highest, not from the count", () => {
    // Somebody was deleted, so there are 3 employees and the next free number
    // is 9. Counting them would hand out E-004 and duplicate an existing code.
    expect(nextEmployeeCode(["E-001", "E-005", "E-008"])).toBe("E-009");
  });

  it("compares numerically, not as text", () => {
    // "E-9" > "E-10" as strings, so a max-by-string would go back to E-010
    // and collide.
    expect(nextEmployeeCode(["E-009", "E-010", "E-011"])).toBe("E-012");
  });

  it("ignores codes it does not own", () => {
    // A company that imported its own payroll numbers. Those are theirs; the
    // generator numbers its own scheme and leaves the rest alone.
    expect(nextEmployeeCode(["1042", "ACC-7", "", null, undefined])).toBe("E-001");
  });

  it("does not mistake a code that merely contains one", () => {
    expect(nextEmployeeCode(["BR-E-004", "E-004-TEMP", "e-004"])).toBe("E-001");
  });

  it("tolerates whitespace around a hand-typed code", () => {
    expect(nextEmployeeCode([" E-007 "])).toBe("E-008");
  });

  it("keeps padding to three, and stops growing rather than renumbering", () => {
    // Alignment past 999 is worth less than never changing a code somebody has
    // already written on a personnel file.
    expect(nextEmployeeCode(["E-098"])).toBe("E-099");
    expect(nextEmployeeCode(["E-099"])).toBe("E-100");
    expect(nextEmployeeCode(["E-999"])).toBe("E-1000");
    expect(nextEmployeeCode(["E-1000"])).toBe("E-1001");
  });

  it("survives a number no integer can hold", () => {
    // A hand-typed code of forty digits parses to Infinity; adding one to that
    // would hand out "E-Infinity" to a real person.
    expect(nextEmployeeCode(["E-" + "9".repeat(40), "E-003"])).toBe("E-004");
  });
});
