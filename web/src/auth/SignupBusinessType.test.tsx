import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BUSINESS_TYPES } from "../api/businessTypes";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { ThemeProvider } from "../ui/ThemeProvider";
import { DICTIONARIES } from "../i18n/strings";

/**
 * The one question signup asks about the work itself.
 *
 * What the server does with the answer is tested there. What only the form can
 * get wrong is asking badly: a required question that blocks a signup, a name
 * that shows as a raw key because one of three dictionaries was missed, or an
 * empty answer sent as "" where the server expects nothing at all.
 */

// ThemeProvider asks the platform whether the system is dark; jsdom has no
// matchMedia.
window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const sent = vi.hoisted(() => ({ bodies: [] as Record<string, unknown>[] }));

vi.mock("../api/client", () => ({
  ApiError: class extends Error {
    code = "X";
  },
  signupCompany: async (body: Record<string, unknown>) => {
    sent.bodies.push(body);
    return { companyId: "c1", employeeId: "e1" };
  },
}));

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: async () => ({ user: {} }),
  sendEmailVerification: async () => {},
  signOut: async () => {},
}));

vi.mock("../firebase", () => ({ auth: {}, firebaseConfigured: true }));
vi.mock("./AuthProvider", () => ({ useAuth: () => ({ signIn: vi.fn() }) }));

const { LoginPage } = await import("./LoginPage");

function openSignup(): void {
  render(
    <MemoryRouter>
      <LocaleProvider>
        <ThemeProvider>
          <LoginPage />
        </ThemeProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText(DICTIONARIES.fa.signup_no_account));
}

function typeInto(label: string, value: string): void {
  const field = screen.getByText(label).closest(".field") as HTMLElement;
  fireEvent.change(field.querySelector("input")!, { target: { value } });
}

function typeSelect(): HTMLSelectElement {
  const field = screen.getByText(DICTIONARIES.fa.signup_business_type).closest(".field") as HTMLElement;
  return field.querySelector("select") as HTMLSelectElement;
}

beforeEach(() => {
  sent.bodies = [];
});

describe("the fifteen names", () => {
  it("has one in every language, so nobody sees a raw key", () => {
    // Three dictionaries edited by hand: a name added to Dari and forgotten in
    // Pashto shows as "biz_clinic" to exactly the users least likely to report
    // it.
    for (const lang of ["fa", "ps", "en"] as const) {
      for (const id of BUSINESS_TYPES) {
        const key = `biz_${id.toLowerCase()}`;
        const value = (DICTIONARIES[lang] as Record<string, string>)[key];
        expect(value, `${lang} is missing ${key}`).toBeTruthy();
        expect(value).not.toBe(key);
      }
    }
  });

  it("offers every type the server knows about", () => {
    openSignup();
    const options = [...typeSelect().options].map((o) => o.value).filter(Boolean);
    expect(options).toEqual([...BUSINESS_TYPES]);
  });
});

describe("asking without blocking", () => {
  it("starts unanswered and can be left that way", () => {
    openSignup();
    expect(typeSelect().value).toBe("");
    expect(typeSelect().required).toBe(false);
  });

  it("sends nothing at all when it was not answered", async () => {
    // "" is not the same as absent: the server reads absent as "give them the
    // product defaults".
    openSignup();
    typeInto(DICTIONARIES.fa.signup_company, "Kabul Traders");
    typeInto(DICTIONARIES.fa.signup_admin_first, "Ahmad");
    typeInto(DICTIONARIES.fa.signup_admin_last, "Karimi");
    typeInto(DICTIONARIES.fa.login_email, "a@example.com");
    typeInto(DICTIONARIES.fa.login_password, "Passw0rd!");
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(sent.bodies).toHaveLength(1));
    expect(sent.bodies[0].businessType).toBeUndefined();
  });

  it("sends the choice when one is made", async () => {
    openSignup();
    typeInto(DICTIONARIES.fa.signup_company, "Darulaman Construction");
    typeInto(DICTIONARIES.fa.signup_admin_first, "Ahmad");
    typeInto(DICTIONARIES.fa.signup_admin_last, "Karimi");
    typeInto(DICTIONARIES.fa.login_email, "b@example.com");
    typeInto(DICTIONARIES.fa.login_password, "Passw0rd!");
    fireEvent.change(typeSelect(), { target: { value: "CONSTRUCTION" } });
    fireEvent.submit(document.querySelector("form")!);

    await waitFor(() => expect(sent.bodies).toHaveLength(1));
    expect(sent.bodies[0].businessType).toBe("CONSTRUCTION");
  });
});
