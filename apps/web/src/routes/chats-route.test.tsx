import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatsRoute } from "./chats-route";

let threads = [
  {
    id: "dm-aurora",
    kind: "dm" as const,
    title: "Aurora Vale",
    summary: "Sharing arrival notes.",
    participants: ["npub1aurora"],
    unread: true,
    activeCall: false
  },
  {
    id: "group-night-shift",
    kind: "group_dm" as const,
    title: "Night Shift",
    summary: "Venue coordination thread.",
    participants: ["npub1aurora", "npub1jules", "npub1sol"],
    unread: false,
    activeCall: false
  }
];

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width
  });
}

vi.mock("../app-state", () => ({
  useAppState: () => ({
    listChatThreads: () => threads
  })
}));

describe("ChatsRoute", () => {
  beforeEach(() => {
    setViewportWidth(1024);
    threads = [
      {
        id: "dm-aurora",
        kind: "dm",
        title: "Aurora Vale",
        summary: "Sharing arrival notes.",
        participants: ["npub1aurora"],
        unread: true,
        activeCall: false
      },
      {
        id: "group-night-shift",
        kind: "group_dm",
        title: "Night Shift",
        summary: "Venue coordination thread.",
        participants: ["npub1aurora", "npub1jules", "npub1sol"],
        unread: false,
        activeCall: false
      }
    ];
  });

  it("shows a dedicated thread view on narrow screens and lets the user go back", async () => {
    const user = userEvent.setup();
    setViewportWidth(480);

    render(
      <MemoryRouter initialEntries={["/app/chats"]}>
        <Routes>
          <Route path="/app/chats" element={<ChatsRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("list", { name: "Private chat threads" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Aurora Vale" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize chats panels" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Aurora Vale/i }));

    expect(screen.queryByRole("list", { name: "Private chat threads" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aurora Vale" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to chats" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to chats" }));

    expect(screen.getByRole("list", { name: "Private chat threads" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Aurora Vale" })).not.toBeInTheDocument();
  });

  it("keeps the thread list and detail side by side on wide screens", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app/chats"]}>
        <Routes>
          <Route path="/app/chats" element={<ChatsRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("list", { name: "Private chat threads" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aurora Vale" })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize chats panels" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Night Shift/i }));

    expect(screen.getByRole("list", { name: "Private chat threads" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Night Shift" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to chats" })).not.toBeInTheDocument();
  });
});
