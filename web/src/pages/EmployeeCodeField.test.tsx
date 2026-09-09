import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LocaleProvider } from "../i18n/LocaleProvider";

/**
 * The employee code field, now that the server numbers people itself.
 *
 * The rule and the endpoint are covered in the backend. What only the form can
 * get wrong is what it puts in the request: an empty string is not the same as
 * a missing field. Sent on a create it fails validation; sent on an edit — and
 * the edit writes the whole document — it erases the code payroll knows
 * somebody by.
 */

const state = vi.hoisted(() => ({
  created: [] as Record<string, unknown>[],
  updated: [] as Record<string, unknown>[],
  permissions: new Set<string>(["employees:write", "employees:read"]),
}));

vi.mock("../api/hooks", () => ({
  useEmployees: () => ({ data: { items: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateEmployee: () => ({
    mutateAsync: async (body: Record<string, unknown>) => {
      state.created.push(body);
      return { id: "e_new", employeeCode: "E-002" };
    },
    isPending: false,
  }),
  useUpdateEmployee: () => ({
    mutateAsync: async ({ body }: { body: Record<string, unknown> }) => {
      state.updated.push(body);
      return { id: "e_1" };
    },
    isPending: false,
  }),
  useEmployeeSalary: () => ({ data: undefined, isLoading: false }),
  useSetEmployeeSalary: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetEmployeePassword: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useResetEmployeeFace: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ me: { branchIds: [], companyId: "c1" } }),
  useHasPermission: () => (p: string) => state.permissions.has(p),
  useFeatures: () => ({ faceRecognition: false, payroll: true }),
}));

const { EmployeesPage } = await import("./EmployeesPage");

function openAddForm(): void {
  render(
    <LocaleProvider>
      <EmployeesPage />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /افزودن کارمند|Add/ }));
}

/** The code box, found by its label rather than by position in the grid. */
function codeInput(): HTMLInputElement {
  const label = screen.getByText("کود");
  const field = label.closest(".field") as HTMLElement;
  return field.querySelector("input") as HTMLInputElement;
}

beforeEach(() => {
  state.created = [];
  state.updated = [];
});

describe("adding somebody", () => {
  it("leaves the code blank and says it is automatic", () => {
    openAddForm();
    const input = codeInput();

    expect(input.value).toBe("");
    // An empty box with no explanation reads as a field the user forgot.
    expect(input.placeholder).toBe("خودکار");
  });

  it("omits the code entirely rather than sending an empty one", async () => {
    openAddForm();
    fireEvent.change(screen.getByText("نام").closest(".field")!.querySelector("input")!, {
      target: { value: "Zahra" },
    });
    fireEvent.submit(document.querySelector("form.modal") as HTMLFormElement);

    await waitFor(() => expect(state.created).toHaveLength(1));
    // The distinction the server acts on: absent means "number this person",
    // "" is a validation failure.
    expect(state.created[0].employeeCode).toBeUndefined();
    expect("employeeCode" in state.created[0]).toBe(true);
    expect(state.created[0].employeeCode).not.toBe("");
  });

  it("still sends a code somebody typed", async () => {
    openAddForm();
    fireEvent.change(codeInput(), { target: { value: "ACC-77" } });
    fireEvent.submit(document.querySelector("form.modal") as HTMLFormElement);

    await waitFor(() => expect(state.created).toHaveLength(1));
    expect(state.created[0].employeeCode).toBe("ACC-77");
  });
});
