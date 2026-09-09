import { z } from "zod";
import { nowTimestamp, tenant } from "../lib/firestore";

/**
 * Which salary components apply to which employee, and at what amount.
 *
 * A component is a definition — "transport allowance, 2000". Whether a given
 * person gets it, and whether they get that figure, is this. Four cases, all
 * from the same two fields:
 *
 *   company-wide          scope ALL, no assignment          everyone gets 2000
 *   different for one     scope ALL, assignment value 3000  that person gets 3000
 *   withheld from one     scope ALL, assignment inactive    that person gets none
 *   only for some         scope INDIVIDUAL + assignment     only the assigned
 *
 * Components written before `scope` existed have none, and are read as ALL:
 * they applied to everybody, and that must not change under them.
 */

/** Whether a component applies to everyone by default or only where assigned. */
export type ComponentScope = "ALL" | "INDIVIDUAL";

export interface AssignmentDoc {
  employeeId: string;
  componentId: string;
  /** Overrides the component's own amount. Null means "use the component's". */
  value: number | null;
  /** False withholds an otherwise company-wide component from this employee. */
  active: boolean;
}

export const assignmentWriteSchema = z.object({
  // Null and "no value" both mean the component's own figure; accepting either
  // spares every caller from having to know which one this API prefers.
  value: z.number().min(0).max(100_000_000).nullish(),
  active: z.boolean().optional().default(true),
});

export type AssignmentWrite = z.infer<typeof assignmentWriteSchema>;

/**
 * The document id. Deriving it from the pair rather than minting one makes
 * assigning the same component twice a correction instead of a duplicate — the
 * same reason payslip ids are derived from the employee and the run.
 */
export function assignmentId(employeeId: string, componentId: string): string {
  return `${employeeId}__${componentId}`;
}

export async function listAssignments(cid: string): Promise<AssignmentDoc[]> {
  const snap = await tenant(cid, "employeeComponents").limit(5000).get();
  return snap.docs.map((d) => {
    const v = d.data();
    return {
      employeeId: v.employeeId as string,
      componentId: v.componentId as string,
      value: (v.value as number | null | undefined) ?? null,
      active: (v.active as boolean | undefined) ?? true,
    };
  });
}

export async function listAssignmentsFor(
  cid: string,
  employeeId: string,
): Promise<AssignmentDoc[]> {
  const snap = await tenant(cid, "employeeComponents")
    .where("employeeId", "==", employeeId)
    .limit(500)
    .get();
  return snap.docs.map((d) => {
    const v = d.data();
    return {
      employeeId: v.employeeId as string,
      componentId: v.componentId as string,
      value: (v.value as number | null | undefined) ?? null,
      active: (v.active as boolean | undefined) ?? true,
    };
  });
}

export async function setAssignment(
  cid: string,
  employeeId: string,
  componentId: string,
  input: AssignmentWrite,
): Promise<AssignmentDoc> {
  const doc: AssignmentDoc = {
    employeeId,
    componentId,
    value: input.value ?? null,
    active: input.active ?? true,
  };
  await tenant(cid, "employeeComponents")
    .doc(assignmentId(employeeId, componentId))
    .set({ companyId: cid, ...doc, updatedAt: nowTimestamp() });
  return doc;
}

/**
 * Removes the assignment, which returns the employee to the component's own
 * behaviour: a company-wide component applies again at its own amount, and an
 * individual one stops applying.
 */
export async function clearAssignment(
  cid: string,
  employeeId: string,
  componentId: string,
): Promise<void> {
  await tenant(cid, "employeeComponents")
    .doc(assignmentId(employeeId, componentId))
    .delete();
}

/** A component as payroll needs to see it: does it apply, and at what amount. */
export interface ResolvedComponent<T> {
  component: T;
  amount: number;
}

/**
 * Resolves one employee's components from the company's definitions and their
 * own assignments.
 *
 * Pure, so payroll's arithmetic can be tested without a database, and so the
 * rule lives in exactly one place rather than being re-derived per call site.
 */
export function componentsForEmployee<
  T extends { id: string; value: number; scope?: ComponentScope },
>(components: T[], assignments: AssignmentDoc[]): ResolvedComponent<T>[] {
  const byComponent = new Map(assignments.map((a) => [a.componentId, a]));
  const out: ResolvedComponent<T>[] = [];

  for (const c of components) {
    const a = byComponent.get(c.id);
    // No scope at all means the component predates individual assignment and
    // has always applied to everyone.
    const appliesByDefault = (c.scope ?? "ALL") === "ALL";
    const applies = a ? a.active : appliesByDefault;
    if (!applies) continue;
    out.push({ component: c, amount: a?.value ?? c.value });
  }

  return out;
}
