import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Advance } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { DICTIONARIES } from "../i18n/strings";

/**
 * The advances card.
 *
 * The arithmetic and the idempotency are settled in the backend. What only
 * this card can get wrong is the part a person touches: offering to cancel
 * something that has already been repaid, sending a blank instalment as a
 * number, or letting somebody record an advance without saying who it is for.
 */

const state = vi.hoisted(() => ({
  advances: [] as Advance[],
  created: [] as Record<string, unknown>[],
  cancelled: [] as string[],
  permissions: new Set<string>(["payroll:read", "payroll:run"]),
}));

vi.mock("../api/hooks", () => ({
  useAdvances: () => ({
    data: state.advances,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useEmployees: () => ({
    data: { data: [{ id: "e1", firstName: "Ali", lastName: "Rahimi" }] },
    isLoading: false,
    isError: false,
  }),
  useCreateAdvance: () => ({
    mutateAsync: async (body: Record<string, unknown>) => {
      state.created.push(body);
      return { id: "a_new" };
    },
    isPending: false,
  }),
  useCancelAdvance: () => ({
    mutateAsync: async (id: string) => {
      state.cancelled.push(id);
      return { id };
    },
    isPending: false,
  }),
}));

vi.mock("../auth/AuthProvider", () => ({
  useHasPermission: () => (p: string) => state.permissions.has(p),
}));

const { AdvancesCard } = await import("./AdvancesCard");

function advance(over: Partial<Advance> = {}): Advance {
  return {
    id: "a1",
    employeeId: "e1",
    employeeName: "Ali Rahimi",
    principal: 5000,
    instalment: null,
    issuedOn: "2026-09-01",
    note: null,
    repaid: 0,
    outstanding: 5000,
    status: "OUTSTANDING",
    ...over,
  };
}

function show(): void {
  render(
    <LocaleProvider>
      <AdvancesCard />
    </LocaleProvider>,
  );
}

function openForm(): void {
  show();
  fireEvent.click(screen.getByRole("button", { name: DICTIONARIES.fa.adv_add }));
}

function field(label: string): HTMLElement {
  const wrap = screen.getByText(label).closest(".field") as HTMLElement;
  return (wrap.querySelector("input") ?? wrap.querySelector("select")) as HTMLElement;
}

beforeEach(() => {
  state.advances = [];
  state.created = [];
  state.cancelled = [];
  state.permissions = new Set(["payroll:read", "payroll:run"]);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("what the list shows", () => {
  it("says an advance with no instalment comes out in one go", () => {
    // A dash would leave somebody guessing whether it means nothing is owed.
    state.advances = [advance({ instalment: null })];
    show();
    expect(screen.getAllByText(DICTIONARIES.fa.adv_in_full).length).toBeGreaterThan(0);
  });

  it("offers to cancel an untouched advance", () => {
    state.advances = [advance({ repaid: 0 })];
    show();
    expect(screen.getByRole("button", { name: DICTIONARIES.fa.adv_cancel })).toBeInTheDocument();
  });

  it("does not offer to cancel one that has been partly repaid", () => {
    // A payslip was issued against it, and that cannot be unsaid. The server
    // refuses too; offering the button would just produce an error.
    state.advances = [advance({ repaid: 2000, outstanding: 3000 })];
    show();
    expect(screen.queryByRole("button", { name: DICTIONARIES.fa.adv_cancel })).not.toBeInTheDocument();
  });

  it("does not offer to cancel a settled or cancelled one", () => {
    state.advances = [
      advance({ id: "s", status: "SETTLED", repaid: 5000, outstanding: 0 }),
      advance({ id: "c", status: "CANCELLED" }),
    ];
    show();
    expect(screen.queryByRole("button", { name: DICTIONARIES.fa.adv_cancel })).not.toBeInTheDocument();
  });

  it("leaves cancelled advances out of the total owed", () => {
    state.advances = [
      advance({ id: "live", outstanding: 3000 }),
      advance({ id: "dead", status: "CANCELLED", outstanding: 9000 }),
    ];
    show();

    // The sentence is "total outstanding: X", so match the paragraph rather
    // than a bare number. What matters is that the 9,000 nobody owes any more
    // is not in it — that figure would overstate what payroll is about to take.
    const label = DICTIONARIES.fa.adv_total_owed.split("{0}")[0].trim();
    const totals = screen.getByText((_, el) => (el?.textContent ?? "").startsWith(label));
    expect(totals.textContent).not.toMatch(/9|۹/);
  });

  it("hides every write control from somebody who may only look", () => {
    state.permissions = new Set(["payroll:read"]);
    state.advances = [advance()];
    show();
    expect(screen.queryByRole("button", { name: DICTIONARIES.fa.adv_add })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: DICTIONARIES.fa.adv_cancel })).not.toBeInTheDocument();
  });
});

describe("recording one", () => {
  it("sends a blank instalment as null, not as a number", () => {
    // Number("") is 0, and a zero instalment would repay nothing forever.
    openForm();
    fireEvent.change(field(DICTIONARIES.fa.adv_employee), { target: { value: "e1" } });
    fireEvent.change(field(DICTIONARIES.fa.adv_principal), { target: { value: "5000" } });
    fireEvent.submit(document.querySelector("form.modal") as HTMLFormElement);

    return waitFor(() => {
      expect(state.created).toHaveLength(1);
      expect(state.created[0].instalment).toBeNull();
      expect(state.created[0].principal).toBe(5000);
    });
  });

  it("refuses to record one with nobody attached to it", async () => {
    openForm();
    fireEvent.change(field(DICTIONARIES.fa.adv_principal), { target: { value: "5000" } });
    fireEvent.submit(document.querySelector("form.modal") as HTMLFormElement);

    await waitFor(() =>
      expect(screen.getByText(DICTIONARIES.fa.adv_err_required)).toBeInTheDocument(),
    );
    expect(state.created).toHaveLength(0);
  });

  it("catches an instalment bigger than the advance before the server does", async () => {
    // Not a server rule — it would work, settling in one go — but it is
    // somebody misreading the field, and saying so here is cheaper.
    openForm();
    fireEvent.change(field(DICTIONARIES.fa.adv_employee), { target: { value: "e1" } });
    fireEvent.change(field(DICTIONARIES.fa.adv_principal), { target: { value: "5000" } });
    fireEvent.change(field(DICTIONARIES.fa.adv_instalment), { target: { value: "9000" } });
    fireEvent.submit(document.querySelector("form.modal") as HTMLFormElement);

    await waitFor(() =>
      expect(screen.getByText(DICTIONARIES.fa.adv_err_instalment_big)).toBeInTheDocument(),
    );
    expect(state.created).toHaveLength(0);
  });
});

describe("the form's own labels", () => {
  it("labels the note field with a label, not with the paragraph under the table", () => {
    // These were one key. The field a manager types "for medicine" into was
    // labelled with the whole explanation of when the deduction happens —
    // which every test passed, because none of them read a label.
    openForm();
    const labels = [...document.querySelectorAll("form.modal label")].map((l) => l.textContent ?? "");
    expect(labels).toContain(DICTIONARIES.fa.adv_note_field);
    for (const label of labels) {
      expect(label.length, `a label is a paragraph: "${label.slice(0, 40)}…"`).toBeLessThan(40);
    }
  });
});

describe("the three dictionaries", () => {
  it("has every advance string in all of them", () => {
    // Edited by hand: one added to Dari and forgotten in Pashto shows the raw
    // key to exactly the users least likely to report it.
    const keys = Object.keys(DICTIONARIES.fa).filter((k) => k.startsWith("adv_"));
    expect(keys.length).toBeGreaterThan(15);
    for (const lang of ["ps", "en"] as const) {
      for (const key of keys) {
        expect((DICTIONARIES[lang] as Record<string, string>)[key], `${lang} missing ${key}`)
          .toBeTruthy();
      }
    }
  });
});
