import { describe, it, expect } from "vitest";
import { loginAllowedFor, roleChangeRefusal, claimsFor } from "./employeeAccount";

describe("who may still sign in", () => {
  it("lets somebody on leave in", () => {
    // Still employed: they need their payslip, and they need to extend the
    // leave they are already on.
    expect(loginAllowedFor("ACTIVE")).toBe(true);
    expect(loginAllowedFor("ON_LEAVE")).toBe(true);
  });

  it("shuts the door on somebody suspended or gone", () => {
    // This is the whole point: before this, marking somebody EXITED changed a
    // chip in a table and they kept every permission they had the day before.
    expect(loginAllowedFor("SUSPENDED")).toBe(false);
    expect(loginAllowedFor("EXITED")).toBe(false);
  });
});

const HR = { actorEmployeeId: "e_hr", actorRoles: ["HR_ADMIN"] };
const OWNER = { actorEmployeeId: "e_owner", actorRoles: ["COMPANY_ADMIN"] };

describe("who may change whose role", () => {
  it("allows the ordinary case", () => {
    expect(
      roleChangeRefusal({
        ...HR,
        targetEmployeeId: "e_ali",
        targetCurrentRoles: ["EMPLOYEE"],
        newRole: "TEAM_LEAD",
      }),
    ).toBeNull();
  });

  it("refuses to mint authority that cannot be granted", () => {
    // COMPANY_ADMIN is not in ASSIGNABLE_ROLES. Without this an HR admin makes
    // themselves the owner in a single call.
    expect(
      roleChangeRefusal({
        ...HR,
        targetEmployeeId: "e_ali",
        targetCurrentRoles: ["EMPLOYEE"],
        newRole: "COMPANY_ADMIN",
      }),
    ).toMatch(/cannot be assigned/);

    expect(
      roleChangeRefusal({
        ...HR,
        targetEmployeeId: "e_ali",
        targetCurrentRoles: ["EMPLOYEE"],
        newRole: "SUPER_ADMIN",
      }),
    ).toMatch(/cannot be assigned/);
  });

  it("stops an HR admin taking the company from its owner", () => {
    // Every role in this request is assignable — EMPLOYEE is perfectly
    // ordinary — so checking the NEW role alone would let this through, and
    // afterwards the company has no owner and the HR admin is the most senior
    // account left.
    expect(
      roleChangeRefusal({
        ...HR,
        targetEmployeeId: "e_owner",
        targetCurrentRoles: ["COMPANY_ADMIN"],
        newRole: "EMPLOYEE",
      }),
    ).toMatch(/company administrator/);
  });

  it("lets an owner change another owner", () => {
    expect(
      roleChangeRefusal({
        ...OWNER,
        targetEmployeeId: "e_other_owner",
        targetCurrentRoles: ["COMPANY_ADMIN"],
        newRole: "HR_ADMIN",
      }),
    ).toBeNull();
  });

  it("refuses anybody changing their own role", () => {
    // Self-promotion is already covered, but self-DEMOTION is its own hazard:
    // the only COMPANY_ADMIN making themselves an EMPLOYEE locks the company
    // out of its own settings with no way back that does not involve us.
    expect(
      roleChangeRefusal({
        ...OWNER,
        targetEmployeeId: "e_owner",
        targetCurrentRoles: ["COMPANY_ADMIN"],
        newRole: "EMPLOYEE",
      }),
    ).toMatch(/your own role/);

    expect(
      roleChangeRefusal({
        ...HR,
        targetEmployeeId: "e_hr",
        targetCurrentRoles: ["HR_ADMIN"],
        newRole: "EMPLOYEE",
      }),
    ).toMatch(/your own role/);
  });

  it("checks identity before anything else", () => {
    // Somebody editing themselves gets told that, not a confusing message
    // about which roles are assignable.
    expect(
      roleChangeRefusal({
        ...HR,
        targetEmployeeId: "e_hr",
        targetCurrentRoles: ["HR_ADMIN"],
        newRole: "COMPANY_ADMIN",
      }),
    ).toMatch(/your own role/);
  });
});

describe("the claims a login should carry", () => {
  it("mirrors the record, branch included", () => {
    // The middleware reads r and b from the token and never opens the employee
    // document, so a branch written only to Firestore is a branch nobody
    // enforces.
    expect(
      claimsFor({ companyId: "c1", employeeId: "e_1", role: "TEAM_LEAD", branchId: "b_kabul" }),
    ).toEqual({ cid: "c1", eid: "e_1", r: ["TEAM_LEAD"], b: ["b_kabul"] });
  });

  it("carries no branch rather than an empty one", () => {
    expect(
      claimsFor({ companyId: "c1", employeeId: "e_1", role: "EMPLOYEE", branchId: null }).b,
    ).toEqual([]);
  });
});
