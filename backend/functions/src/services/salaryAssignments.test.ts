import { describe, it, expect } from "vitest";
import { componentsForEmployee, assignmentId } from "./salaryAssignments";
import type { AssignmentDoc } from "./salaryAssignments";

/**
 * The rule that decides whose payslip a component reaches, and at what figure.
 * Four cases from two fields; each one is somebody's actual pay.
 */

interface C {
  id: string;
  value: number;
  scope?: "ALL" | "INDIVIDUAL";
}

const transport: C = { id: "transport", value: 2000, scope: "ALL" };
const bonus: C = { id: "bonus", value: 5000, scope: "INDIVIDUAL" };
/** Written before scope existed; it applied to everyone and must keep doing so. */
const legacy: C = { id: "legacy", value: 300 };

function assign(over: Partial<AssignmentDoc> & { componentId: string }): AssignmentDoc {
  return { employeeId: "e1", value: null, active: true, ...over };
}

function resolve(components: C[], assignments: AssignmentDoc[]) {
  return componentsForEmployee(components, assignments).map((r) => [r.component.id, r.amount]);
}

describe("which components apply to an employee", () => {
  it("gives a company-wide component to someone with no assignment", () => {
    expect(resolve([transport], [])).toEqual([["transport", 2000]]);
  });

  it("does not give an individual component to someone with no assignment", () => {
    expect(resolve([bonus], [])).toEqual([]);
  });

  it("gives an individual component to the person it is assigned to", () => {
    expect(resolve([bonus], [assign({ componentId: "bonus" })])).toEqual([["bonus", 5000]]);
  });

  it("uses the assigned amount in place of the component's", () => {
    expect(resolve([transport], [assign({ componentId: "transport", value: 3500 })])).toEqual([
      ["transport", 3500],
    ]);
  });

  it("treats an assigned amount of zero as zero, not as absent", () => {
    // `?? c.value` on a 0 would have silently paid the full 2000.
    expect(resolve([transport], [assign({ componentId: "transport", value: 0 })])).toEqual([
      ["transport", 0],
    ]);
  });

  it("withholds a company-wide component from one person", () => {
    expect(resolve([transport], [assign({ componentId: "transport", active: false })])).toEqual(
      [],
    );
  });

  it("keeps a component that predates scope applying to everyone", () => {
    expect(resolve([legacy], [])).toEqual([["legacy", 300]]);
  });

  it("still lets a legacy component be overridden or withheld", () => {
    expect(resolve([legacy], [assign({ componentId: "legacy", value: 100 })])).toEqual([
      ["legacy", 100],
    ]);
    expect(resolve([legacy], [assign({ componentId: "legacy", active: false })])).toEqual([]);
  });

  it("ignores an assignment naming a component the company no longer has", () => {
    expect(resolve([transport], [assign({ componentId: "deleted" })])).toEqual([
      ["transport", 2000],
    ]);
  });

  it("resolves a mixed set in one pass", () => {
    expect(
      resolve(
        [transport, bonus, legacy],
        [assign({ componentId: "bonus" }), assign({ componentId: "transport", active: false })],
      ),
    ).toEqual([
      ["bonus", 5000],
      ["legacy", 300],
    ]);
  });

  it("derives the document id from the pair, so assigning twice corrects", () => {
    expect(assignmentId("e1", "transport")).toBe("e1__transport");
    expect(assignmentId("e1", "transport")).toBe(assignmentId("e1", "transport"));
  });
});
