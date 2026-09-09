import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { EmployeeDocument } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { DICTIONARIES } from "../i18n/strings";

/**
 * The register of papers held for one person.
 *
 * The expensive case is not a missing document — it is one that quietly ran
 * out, so what this component has to get right is the distinction between
 * "expired", "expiring", and "does not expire at all". Showing a tazkira as
 * "valid" teaches people to ignore the column, which costs more than showing
 * nothing.
 */

const state = vi.hoisted(() => ({
  docs: [] as EmployeeDocument[],
  added: [] as Record<string, unknown>[],
  deleted: [] as string[],
}));

vi.mock("../api/hooks", () => ({
  useEmployeeDocuments: () => ({ data: state.docs, isLoading: false, isError: false }),
  useAddDocument: () => ({
    mutateAsync: async (body: Record<string, unknown>) => {
      state.added.push(body);
      return { id: "d_new" };
    },
    isPending: false,
  }),
  useDeleteDocument: () => ({
    mutateAsync: async (id: string) => {
      state.deleted.push(id);
    },
    isPending: false,
  }),
}));

const { EmployeeDocuments } = await import("./EmployeeDocuments");

function doc(over: Partial<EmployeeDocument> = {}): EmployeeDocument {
  return {
    id: "d1",
    employeeId: "e1",
    employeeName: "Ali",
    type: "CONTRACT",
    number: "C-100",
    issuedOn: null,
    expiresOn: "2027-01-01",
    note: null,
    ...over,
  };
}

function show(): void {
  render(
    <LocaleProvider>
      <EmployeeDocuments employeeId="e1" />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  state.docs = [];
  state.added = [];
  state.deleted = [];
  vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));
});

describe("what the register shows", () => {
  it("shows nothing at all without an employee to hang it on", () => {
    render(
      <LocaleProvider>
        <EmployeeDocuments employeeId={null} />
      </LocaleProvider>,
    );
    expect(screen.queryByText(DICTIONARIES.fa.doc_title)).not.toBeInTheDocument();
  });

  it("says a document without an expiry does not expire, rather than calling it valid", () => {
    // A tazkira shown as "valid" among contracts that really do expire teaches
    // people to stop reading the column.
    state.docs = [doc({ type: "TAZKIRA", expiresOn: null })];
    show();
    expect(screen.getByText(DICTIONARIES.fa.doc_no_expiry)).toBeInTheDocument();
  });

  it("marks an expired document as expired", () => {
    state.docs = [doc({ expiresOn: "2026-05-01" })];
    show();
    expect(document.querySelector(".chip-negative, .chip.negative")).toBeTruthy();
  });

  it("warns on one that is close, without calling it expired", () => {
    state.docs = [doc({ expiresOn: "2026-09-20" })];
    show();
    const chip = document.querySelector(".chip");
    expect(chip?.className).toMatch(/warning/);
  });

  it("leaves a distant one alone", () => {
    state.docs = [doc({ expiresOn: "2028-01-01" })];
    show();
    expect(document.querySelector(".chip")?.className).toMatch(/positive/);
  });

  it("says so when there is nothing on file", () => {
    show();
    expect(screen.getByText(DICTIONARIES.fa.doc_empty)).toBeInTheDocument();
  });

  it("removes one", async () => {
    state.docs = [doc({ id: "d7" })];
    show();
    fireEvent.click(screen.getByRole("button", { name: DICTIONARIES.fa.doc_delete }));
    await waitFor(() => expect(state.deleted).toEqual(["d7"]));
  });
});

describe("adding one", () => {
  function openForm(): void {
    show();
    fireEvent.click(screen.getByRole("button", { name: DICTIONARIES.fa.doc_add }));
  }

  it("sends an empty expiry as null, meaning it does not expire", async () => {
    // "" would be an invalid date and the register has no use for a date
    // somebody meant to fill in later.
    openForm();
    fireEvent.click(screen.getByRole("button", { name: DICTIONARIES.fa.common_save }));

    await waitFor(() => expect(state.added).toHaveLength(1));
    expect(state.added[0].expiresOn).toBeNull();
    expect(state.added[0].employeeId).toBe("e1");
  });

  it("sends the date when one is given", async () => {
    openForm();
    const field = screen.getByText(DICTIONARIES.fa.doc_expires_on).closest(".field") as HTMLElement;
    fireEvent.change(field.querySelector("input")!, { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: DICTIONARIES.fa.common_save }));

    await waitFor(() => expect(state.added).toHaveLength(1));
    expect(state.added[0].expiresOn).toBe("2027-03-01");
  });

  it("saves with a button that does not submit the employee form around it", () => {
    // This sits INSIDE the employee form. A submit button here would save the
    // employee instead of the document.
    openForm();
    const save = screen.getByRole("button", { name: DICTIONARIES.fa.common_save });
    expect(save.getAttribute("type")).toBe("button");
  });
});
