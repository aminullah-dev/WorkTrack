import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppNotification } from "../api/types";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { DICTIONARIES } from "../i18n/strings";

/**
 * The bell.
 *
 * What only this component can get wrong is the part between seeing something
 * and acting on it: a badge that lies about how much is unread, a panel that
 * will not close, or an item that navigates away without ever being marked
 * read so the badge stays forever.
 */

const state = vi.hoisted(() => ({
  items: [] as AppNotification[],
  unread: 0,
  markedRead: [] as string[],
  markedAll: 0,
}));

const navigate = vi.hoisted(() => ({ to: [] as string[] }));

vi.mock("react-router-dom", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => (to: string) => navigate.to.push(to) };
});

vi.mock("../api/hooks", () => ({
  useNotifications: () => ({ data: { items: state.items, unread: state.unread } }),
  useMarkNotificationRead: () => ({
    mutateAsync: async (id: string) => {
      state.markedRead.push(id);
    },
    isPending: false,
  }),
  useMarkAllNotificationsRead: () => ({
    mutateAsync: async () => {
      state.markedAll += 1;
    },
    isPending: false,
  }),
}));

const { NotificationBell } = await import("./NotificationBell");

function notification(over: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
    kind: "LEAVE_DECIDED",
    title: "رخصتی شما تأیید شد",
    body: "از ۲۰ تا ۲۲",
    link: "/leave",
    read: false,
    createdAt: "2026-09-09T05:00:00.000Z",
    ...over,
  };
}

function show(): void {
  render(
    <MemoryRouter>
      <LocaleProvider>
        <NotificationBell />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

function bell(): HTMLElement {
  return screen.getByRole("button", { name: DICTIONARIES.fa.notif_title });
}

beforeEach(() => {
  state.items = [];
  state.unread = 0;
  state.markedRead = [];
  state.markedAll = 0;
  navigate.to = [];
});

describe("the badge", () => {
  it("shows nothing when there is nothing", () => {
    show();
    expect(document.querySelector(".bell-badge")).toBeNull();
  });

  it("shows the count", () => {
    state.unread = 3;
    show();
    expect(document.querySelector(".bell-badge")?.textContent).toBe("3");
  });

  it("caps at 9+, because an exact count past nine changes nobody's behaviour", () => {
    state.unread = 47;
    show();
    expect(document.querySelector(".bell-badge")?.textContent).toBe("9+");
  });
});

describe("the panel", () => {
  it("opens and closes on the bell", () => {
    show();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(bell());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(bell());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when something else is clicked", () => {
    // Otherwise the panel sits over the page and swallows the next click.
    show();
    fireEvent.click(bell());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says so when there is nothing rather than showing an empty box", () => {
    show();
    fireEvent.click(bell());
    expect(screen.getByText(DICTIONARIES.fa.notif_empty)).toBeInTheDocument();
  });

  it("offers mark-all only when something is unread", () => {
    state.items = [notification({ read: true })];
    show();
    fireEvent.click(bell());
    expect(
      screen.queryByRole("button", { name: DICTIONARIES.fa.notif_mark_all }),
    ).not.toBeInTheDocument();

    state.unread = 1;
    fireEvent.click(bell());
    fireEvent.click(bell());
    expect(screen.getByRole("button", { name: DICTIONARIES.fa.notif_mark_all })).toBeInTheDocument();
  });

  it("marks unread ones apart from read ones", () => {
    state.items = [notification({ id: "a", read: false }), notification({ id: "b", read: true })];
    show();
    fireEvent.click(bell());
    expect(document.querySelectorAll("li.unread")).toHaveLength(1);
  });
});

describe("opening one", () => {
  it("marks it read and then goes where it points", async () => {
    // Read first, navigate second: if the navigation is what fails the person
    // has still seen it, whereas the reverse leaves a badge on something they
    // read.
    state.items = [notification({ id: "n7", link: "/leave" })];
    state.unread = 1;
    show();
    fireEvent.click(bell());
    fireEvent.click(screen.getByText("رخصتی شما تأیید شد"));

    await waitFor(() => expect(state.markedRead).toEqual(["n7"]));
    expect(navigate.to).toEqual(["/leave"]);
  });

  it("does not mark an already-read one again", async () => {
    state.items = [notification({ id: "n7", read: true })];
    show();
    fireEvent.click(bell());
    fireEvent.click(screen.getByText("رخصتی شما تأیید شد"));

    await waitFor(() => expect(navigate.to).toEqual(["/leave"]));
    expect(state.markedRead).toEqual([]);
  });

  it("still closes and marks read when there is nowhere to go", async () => {
    state.items = [notification({ id: "n7", link: null })];
    state.unread = 1;
    show();
    fireEvent.click(bell());
    fireEvent.click(screen.getByText("رخصتی شما تأیید شد"));

    await waitFor(() => expect(state.markedRead).toEqual(["n7"]));
    expect(navigate.to).toEqual([]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
