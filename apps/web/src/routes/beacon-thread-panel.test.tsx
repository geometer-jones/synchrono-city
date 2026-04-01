import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../styles.css";
import { BeaconThreadPanel } from "./beacon-thread-panel";

const queryProfileMetadata = vi.fn();
const queryAuthorKindOneNotes = vi.fn();
const isPubkeyFollowed = vi.fn();
const setPubkeyFollowed = vi.fn();

const profilesByPubkey = {
  npub1aurora: {
    pubkey: "npub1aurora",
    displayName: "Aurora Vale",
    name: "Aurora Vale",
    picture: "https://images.example.test/aurora.png",
    role: "Participant",
    status: "",
    bio: "",
    mic: false,
    cam: false,
    screenshare: false,
    deafen: false
  },
  npub1scout: {
    pubkey: "npub1scout",
    displayName: "Scout",
    name: "Scout",
    role: "Participant",
    status: "",
    bio: "",
    mic: false,
    cam: false,
    screenshare: false,
    deafen: false
  }
};

const notes = [
  {
    id: "note-1",
    geohash: "9q8yyk12",
    authorPubkey: "npub1aurora",
    content: "Meet by the fountain.",
    createdAt: "2026-03-22T20:00:00.000Z",
    replies: 0
  }
];

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width
  });
}

function findMediaStyleRule(conditionText: string, selectorText: string) {
  for (const styleSheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(styleSheet.cssRules)) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes(conditionText)) {
        continue;
      }

      for (const nestedRule of Array.from(rule.cssRules)) {
        if (nestedRule instanceof CSSStyleRule && nestedRule.selectorText === selectorText) {
          return nestedRule;
        }
      }
    }
  }

  return null;
}

vi.mock("../app-state", () => ({
  useAppState: () => ({
    activeCall: null,
    currentUser: profilesByPubkey.npub1scout,
    createPlaceNote: vi.fn(),
    getBeacon: (geohash: string) =>
      geohash === "9q8yyk12"
        ? {
            geohash,
            name: "SFV Founders",
            about: "Low-pressure founder conversations in the valley.",
            roomID: "beacon:9q8yyk12"
          }
        : undefined,
    getBeaconParticipants: () => [],
    getNote: (noteID: string) => notes.find((note) => note.id === noteID),
    getProfile: (pubkey: string) => profilesByPubkey[pubkey as keyof typeof profilesByPubkey],
    joinBeaconCall: vi.fn(),
    leaveBeaconCall: vi.fn(),
    listBeaconThreads: () => [
      {
        geohash: "9q8yyk12",
        name: "SFV Founders",
        about: "Low-pressure founder conversations in the valley.",
        noteCount: 1,
        participants: ["npub1scout", "npub1aurora"],
        ownerPubkey: "npub1scout",
        memberPubkeys: ["npub1scout", "npub1aurora"],
        unread: false,
        activeCall: false,
        roomID: "beacon:9q8yyk12"
      }
    ],
    listNotesForBeacon: () => notes,
    reactToPlaceNote: vi.fn(),
    relayOperatorPubkey: "npub1operator",
    relayURL: "ws://relay.example.test",
    isPubkeyFollowed: (...args: Parameters<typeof isPubkeyFollowed>) => isPubkeyFollowed(...args),
    setPubkeyFollowed: (...args: Parameters<typeof setPubkeyFollowed>) => setPubkeyFollowed(...args)
  })
}));

vi.mock("../nostr", async () => {
  const actual = await vi.importActual<typeof import("../nostr")>("../nostr");
  return {
    ...actual,
    queryAuthorKindOneNotes: (...args: Parameters<typeof queryAuthorKindOneNotes>) => queryAuthorKindOneNotes(...args),
    queryProfileMetadata: (...args: Parameters<typeof queryProfileMetadata>) => queryProfileMetadata(...args)
  };
});

describe("BeaconThreadPanel", () => {
  beforeEach(() => {
    setViewportWidth(1024);
    queryProfileMetadata.mockReset();
    queryAuthorKindOneNotes.mockReset();
    isPubkeyFollowed.mockReset();
    setPubkeyFollowed.mockReset();
    isPubkeyFollowed.mockReturnValue(false);
    queryProfileMetadata.mockResolvedValue(
      new Map([
        [
          "npub1aurora",
          {
            name: "Aurora Vale",
            about: "Organizing founder walks around the valley.",
            picture: "https://images.example.test/aurora.png",
            nip05: "aurora@example.com",
            website: "https://aurora.example.com"
          }
        ]
      ])
    );
    queryAuthorKindOneNotes.mockResolvedValue([
      {
        id: "relay-note-1",
        geohash: "9q8yyk",
        authorPubkey: "npub1aurora",
        content: "Fresh relay post from Aurora.",
        createdAt: "2026-03-22T21:00:00.000Z",
        replies: 0
      }
    ]);
  });

  it("opens a dialog with the user's kind 0 metadata when the author row is clicked", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BeaconThreadPanel
          beaconGeohash="9q8yyk12"
          avatarActionLabel="Open SFV Founders in World"
          onActivateBeacon={vi.fn()}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /aurora vale/i }));

    expect(await screen.findByRole("dialog", { name: /aurora vale/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(queryProfileMetadata).toHaveBeenCalledWith("ws://relay.example.test", ["npub1aurora"])
    );
    await waitFor(() =>
      expect(queryAuthorKindOneNotes).toHaveBeenCalledWith("ws://relay.example.test", "npub1aurora", { limit: 3 })
    );
    expect(await screen.findByText(/"nip05": "aurora@example.com"/i)).toBeInTheDocument();
    expect(await screen.findByText(/fresh relay post from aurora\./i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /latest kind 1 posts/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open pulse profile/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /follow/i })).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: /follow/i }));
    expect(setPubkeyFollowed).toHaveBeenCalledWith("npub1aurora", true);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /aurora vale/i })).not.toBeInTheDocument();
    });
  });

  it("opens a people dialog from the beacon header with the member roster", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BeaconThreadPanel
          beaconGeohash="9q8yyk12"
          avatarActionLabel="Open SFV Founders in World"
          onActivateBeacon={vi.fn()}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /open people/i }));

    const dialog = await screen.findByRole("dialog", { name: /people in sfv founders/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Scout")).toBeInTheDocument();
    expect(within(dialog).getByText("Aurora Vale")).toBeInTheDocument();
    expect(within(dialog).getByText("Owner")).toBeInTheDocument();
    expect(within(dialog).getByText("Member")).toBeInTheDocument();
  });

  it("opens beacon settings from the header instead of navigating to app settings", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <BeaconThreadPanel
          beaconGeohash="9q8yyk12"
          avatarActionLabel="Open SFV Founders in World"
          onActivateBeacon={vi.fn()}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /open beacon settings/i }));

    expect(await screen.findByRole("dialog", { name: /beacon settings for sfv founders/i })).toBeInTheDocument();
    expect(screen.getByText("beacon:9q8yyk12")).toBeInTheDocument();
    expect(screen.getByText("Meet by the fountain.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open settings/i })).not.toBeInTheDocument();
  });

  it("reveals message actions after a long press in narrow viewports", async () => {
    setViewportWidth(540);

    render(
      <MemoryRouter>
        <BeaconThreadPanel
          beaconGeohash="9q8yyk12"
          avatarActionLabel="Open SFV Founders in World"
          onActivateBeacon={vi.fn()}
        />
      </MemoryRouter>
    );

    const messageRow = screen.getByText("Meet by the fountain.").closest(".world-chat-message");
    expect(messageRow).not.toBeNull();
    const row = messageRow as HTMLElement;
    const actionGroup = row.querySelector(".world-chat-message-actions");

    expect(actionGroup).not.toBeNull();
    expect(actionGroup).not.toBeVisible();

    fireEvent.pointerDown(row, {
      button: 0,
      clientX: 24,
      clientY: 32,
      pointerType: "touch"
    });

    await waitFor(
      () => {
        expect(row).toHaveClass("is-actions-open");
        expect(actionGroup).toBeVisible();
      },
      { timeout: 800 }
    );

    const [, replyButton] = within(row).getAllByRole("button", { hidden: true });
    fireEvent.click(replyButton);

    expect(screen.getByLabelText(/reply target/i)).toHaveTextContent(/replying to aurora vale/i);
    setViewportWidth(1024);
  });

  it("keeps mobile message actions hidden until the open state is applied in the narrow-layout stylesheet", () => {
    const mobileActionRule = findMediaStyleRule("(max-width: 860px)", ".world-chat-message-actions");
    const mobileOpenRule = findMediaStyleRule(
      "(max-width: 860px)",
      ".world-chat-message.is-actions-open .world-chat-message-actions"
    );

    expect(mobileActionRule).not.toBeNull();
    expect(mobileActionRule?.style.display).toBe("none");
    expect(mobileOpenRule).not.toBeNull();
    expect(mobileOpenRule?.style.display).toBe("flex");
  });
});
