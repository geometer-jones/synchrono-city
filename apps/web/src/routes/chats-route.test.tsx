import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../styles.css";
import { ChatsRoute } from "./chats-route";

type MockBeaconThread = {
  geohash: string;
  name: string;
  about: string;
  noteCount: number;
  createdAt?: string;
  participants: string[];
  ownerPubkey?: string;
  memberPubkeys?: string[];
  unread: boolean;
  activeCall: boolean;
  roomID: string;
  avatarUrl?: string;
};

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

let beaconThreads: MockBeaconThread[] = [
  {
    geohash: "9q8yyk12",
    name: "SFV Founders",
    about: "Low-pressure founder conversations in the valley.",
    noteCount: 2,
    participants: ["npub1scout", "npub1aurora"],
    ownerPubkey: "npub1scout",
    memberPubkeys: ["npub1scout"],
    unread: true,
    activeCall: true,
    roomID: "beacon:9q8yyk12",
    avatarUrl: "https://images.example.test/sfv-founders.png"
  }
];

let notesByBeacon: Record<string, Array<{ id: string; geohash: string; authorPubkey: string; content: string; createdAt: string; replies: number }>> = {
  "9q8yyk12": [
    {
      id: "note-sfv-1",
      geohash: "9q8yyk12",
      authorPubkey: "npub1scout",
      content: "Meet by the fountain.",
      createdAt: "2026-03-28T10:00:00.000Z",
      replies: 0
    }
  ]
};

const profilesByPubkey: Record<string, { displayName?: string; name?: string; picture?: string }> = {
  npub1aurora: {
    displayName: "Aurora Vale",
    name: "Aurora Vale",
    picture: "https://images.example.test/aurora.png"
  },
  npub1jules: {
    displayName: "Jules Mercer",
    name: "Jules Mercer"
  },
  npub1sol: {
    displayName: "Sol Marin",
    name: "Sol Marin"
  }
};

function findStyleRule(selectorText: string) {
  for (const styleSheet of Array.from(document.styleSheets)) {
    const cssRules = Array.from(styleSheet.cssRules);

    for (const rule of cssRules) {
      if (rule instanceof CSSStyleRule && rule.selectorText === selectorText) {
        return rule;
      }
    }
  }

  return null;
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width
  });
}

vi.mock("../app-state", () => ({
  useAppState: () => ({
    activeCall: null,
    currentUser: { pubkey: "npub1scout" },
    createPlaceNote: vi.fn(),
    reactToPlaceNote: vi.fn(),
    getBeacon: (geohash: string) =>
      beaconThreads.find((thread) => thread.geohash === geohash)
        ? {
            geohash,
            name: beaconThreads.find((thread) => thread.geohash === geohash)?.name ?? geohash,
            about: beaconThreads.find((thread) => thread.geohash === geohash)?.about ?? "",
            avatarUrl: beaconThreads.find((thread) => thread.geohash === geohash)?.avatarUrl,
            ownerPubkey: beaconThreads.find((thread) => thread.geohash === geohash)?.ownerPubkey,
            memberPubkeys: beaconThreads.find((thread) => thread.geohash === geohash)?.memberPubkeys,
            unread: beaconThreads.find((thread) => thread.geohash === geohash)?.unread ?? false,
            roomID: "beacon:9q8yyk12"
          }
        : undefined,
    getBeaconParticipants: (geohash: string) =>
      (beaconThreads.find((thread) => thread.geohash === geohash)?.participants ?? []).map((pubkey) => ({
        pubkey,
        displayName: profilesByPubkey[pubkey]?.displayName ?? pubkey,
        name: profilesByPubkey[pubkey]?.name,
        picture: profilesByPubkey[pubkey]?.picture,
        role: "member",
        status: "",
        bio: "",
        mic: false,
        cam: false,
        screenshare: false,
        deafen: false
      })),
    getNote: (noteID: string) => Object.values(notesByBeacon).flat().find((note) => note.id === noteID),
    getProfile: (pubkey: string) =>
      profilesByPubkey[pubkey]
        ? {
            pubkey,
            displayName: profilesByPubkey[pubkey]?.displayName ?? pubkey,
            name: profilesByPubkey[pubkey]?.name,
            picture: profilesByPubkey[pubkey]?.picture,
            role: "member",
            status: "",
            bio: "",
            mic: false,
            cam: false,
            screenshare: false,
            deafen: false
          }
        : undefined,
    joinBeaconCall: vi.fn(),
    leaveBeaconCall: vi.fn(),
    listBeaconThreads: () => beaconThreads,
    listChatThreads: () => threads,
    listNotesForBeacon: (geohash: string) => notesByBeacon[geohash] ?? [],
    relayOperatorPubkey: "npub1operator"
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
    beaconThreads = [
      {
        geohash: "9q8yyk12",
        name: "SFV Founders",
        about: "Low-pressure founder conversations in the valley.",
        noteCount: 2,
        createdAt: "2026-03-20T10:00:00.000Z",
        participants: ["npub1scout", "npub1aurora"],
        ownerPubkey: "npub1scout",
        memberPubkeys: ["npub1scout"],
        unread: true,
        activeCall: true,
        roomID: "beacon:9q8yyk12",
        avatarUrl: "https://images.example.test/sfv-founders.png"
      }
    ];
    notesByBeacon = {
      "9q8yyk12": [
        {
          id: "note-sfv-1",
          geohash: "9q8yyk12",
          authorPubkey: "npub1scout",
          content: "Meet by the fountain.",
          createdAt: "2026-03-28T10:00:00.000Z",
          replies: 0
        }
      ]
    };
  });

  it("shows a dedicated beacon view on narrow screens and lets the user go back", async () => {
    const user = userEvent.setup();
    setViewportWidth(480);

    render(
      <MemoryRouter initialEntries={["/app/chats"]}>
        <Routes>
          <Route path="/app/chats" element={<ChatsRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("list", { name: "Chat inbox" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/message sfv founders/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize chats panels" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /SFV Founders/i }));

    expect(screen.queryByRole("list", { name: "Chat inbox" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message sfv founders/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to chats" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to chats" }));

    expect(screen.getByRole("list", { name: "Chat inbox" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/message sfv founders/i)).not.toBeInTheDocument();
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

    expect(screen.getByRole("list", { name: "Chat inbox" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/message sfv founders/i)).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize chats panels" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Night Shift/i }));

    expect(screen.getByRole("list", { name: "Chat inbox" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Night Shift" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to chats" })).not.toBeInTheDocument();
  });

  it("keeps the beacon detail pane on a full-height flex chain so the composer can stay bottom-aligned", () => {
    const detailPanelRule = findStyleRule(".thread-scroll-panel-detail");
    const detailPanelChildRule = findStyleRule(".thread-scroll-panel-detail > *");
    const detailStackRule = findStyleRule(".thread-detail-stack");
    const chatThreadRule = findStyleRule(".thread-detail.world-chat-thread");

    expect(detailPanelRule).not.toBeNull();
    expect(detailPanelChildRule).not.toBeNull();
    expect(detailStackRule).not.toBeNull();
    expect(chatThreadRule).not.toBeNull();

    expect(detailPanelRule?.style.getPropertyValue("display")).toBe("flex");
    expect(detailPanelRule?.style.getPropertyValue("flex-direction")).toBe("column");
    expect(detailPanelChildRule?.style.getPropertyValue("flex")).toBe("1 1 auto");
    expect(detailPanelChildRule?.style.getPropertyValue("min-height")).toBe("0");
    expect(detailStackRule?.style.getPropertyValue("flex")).toBe("1 1 auto");
    expect(detailStackRule?.style.getPropertyValue("min-height")).toBe("0");
    expect(chatThreadRule?.style.getPropertyValue("flex")).toBe("1 1 auto");
    expect(chatThreadRule?.style.getPropertyValue("min-height")).toBe("0");
  });

  it("uses the beacon query parameter to keep a beacon selected in chats", () => {
    render(
      <MemoryRouter initialEntries={["/app/chats?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app/chats" element={<ChatsRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText(/message sfv founders/i)).toBeInTheDocument();
    const beaconSection = screen.getByLabelText("Beacon chats");
    expect(within(beaconSection).getByRole("button", { name: /SFV Founders/i })).toHaveClass("active");
  });

  it("shows the latest beacon message preview directly under the title", () => {
    render(
      <MemoryRouter initialEntries={["/app/chats"]}>
        <Routes>
          <Route path="/app/chats" element={<ChatsRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const beaconSection = screen.getByLabelText("Beacon chats");
    const beaconButton = within(beaconSection).getByRole("button", { name: /SFV Founders/i });
    expect(within(beaconButton).getByText("Meet by the fountain.")).toBeInTheDocument();
    expect(within(beaconButton).queryByText(/Low-pressure founder conversations in the valley\./i)).not.toBeInTheDocument();
  });

  it("shows owned beacons even without notes, live participants, or active calls", () => {
    beaconThreads = [
      ...beaconThreads,
      {
        geohash: "9q8yyk34",
        name: "Sunset Commons",
        about: "A quiet planning room.",
        noteCount: 0,
        createdAt: "2026-03-28T12:00:00.000Z",
        participants: [],
        ownerPubkey: "npub1scout",
        memberPubkeys: ["npub1scout"],
        unread: false,
        activeCall: false,
        roomID: "beacon:9q8yyk34"
      }
    ];
    notesByBeacon["9q8yyk34"] = [];

    render(
      <MemoryRouter initialEntries={["/app/chats"]}>
        <Routes>
          <Route path="/app/chats" element={<ChatsRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const beaconSection = screen.getByLabelText("Beacon chats");
    expect(within(beaconSection).getByRole("button", { name: /Sunset Commons/i })).toBeInTheDocument();
    expect(within(beaconSection).getAllByRole("button")[0]).toHaveTextContent("Sunset Commons");
  });
});
