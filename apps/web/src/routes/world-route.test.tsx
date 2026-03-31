import type { ReactNode } from "react";
import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CohortBeaconMetadata } from "../beacon-metadata";
import type { CallSession, ParticipantProfile } from "../data";
import { WorldRoute } from "./world-route";

const joinBeaconCall = vi.fn();
const leaveBeaconCall = vi.fn();
const createBeacon = vi.fn();
const createPlaceNote = vi.fn();
const reactToPlaceNote = vi.fn();
const refreshPlaceNotesFromRelay = vi.fn();
const uploadBeaconPicture = vi.fn();
const grantRoomPermission = vi.fn();

type MockBeaconTile = {
  geohash: string;
  name: string;
  about: string;
  roomID: string;
  latestNote: string;
  noteCount: number;
  participants: string[];
  avatarUrl?: string;
  live: boolean;
  cohort?: CohortBeaconMetadata;
};

type MockBeaconThread = {
  geohash: string;
  name: string;
  about: string;
  noteCount: number;
  participants: string[];
  unread: boolean;
  activeCall: boolean;
  pinnedNoteId?: string;
  roomID: string;
  avatarUrl?: string;
  cohort?: CohortBeaconMetadata;
};

const defaultProfile = (pubkey: string, overrides: Partial<ParticipantProfile> = {}): ParticipantProfile => ({
  pubkey,
  displayName: "Scout",
  name: "Scout",
  role: "Participant",
  status: "",
  bio: "",
  mic: false,
  cam: false,
  screenshare: false,
  deafen: false,
  ...overrides
});

let currentUserPubkey = "npub1scout";
let activeCall: CallSession | null = null;
let profilesByPubkey: Record<string, ParticipantProfile | undefined> = {
  npub1scout: defaultProfile("npub1scout")
};
let beaconParticipantsByGeohash: Record<string, ParticipantProfile[]> = {};
const cohortMetadata: CohortBeaconMetadata = {
  isCohort: true,
  curriculum: "zero-to-hero",
  curriculumLabel: "Zero to Hero",
  level: "beginner",
  levelLabel: "Beginner",
  hybrid: true,
  weekLabel: "Week 2 of 4",
  weekIndex: 2,
  weekCount: 4,
  currentConcept: "Gradient descent intuition",
  nextSession: "Tuesday 7pm at the east tables",
  prompt: "Sketch the loss curve before you code it.",
  joinPosture: "Join muted first. Listen before you speak.",
  summary: "Week 2 focuses on gradient descent intuition and a tiny optimizer sketch.",
  artifact: {
    url: "https://example.com/week-2-notebook",
    label: "Week 2 notebook",
    noteId: "note-1",
    createdAt: "2026-03-22T20:00:00.000Z"
  },
  recentArtifacts: []
};
let beaconTiles: MockBeaconTile[] = [
  {
    geohash: "9q8yyk12",
    name: "SFV Founders",
    about: "Low-pressure founder conversations in the valley.",
    roomID: "geo:npub1operator:9q8yyk12",
    latestNote: "",
    noteCount: 0,
    participants: ["npub1scout"],
    avatarUrl: undefined,
    live: true
  }
];
let beaconThreads: MockBeaconThread[] = [
  {
    geohash: "9q8yyk12",
    name: "SFV Founders",
    about: "Low-pressure founder conversations in the valley.",
    noteCount: 1,
    participants: ["npub1scout"],
    unread: false,
    activeCall: true,
    pinnedNoteId: "note-1",
    roomID: "geo:npub1operator:9q8yyk12",
    avatarUrl: undefined
  }
];
let notesForBeacon = [
  {
    id: "note-1",
    geohash: "9q8yyk12",
    authorPubkey: "npub1scout",
    content: "Meet by the fountain.",
    createdAt: "2026-03-22T20:00:00.000Z",
    replies: 2
  }
];

function createActiveCall(overrides: Partial<CallSession> = {}): CallSession {
  return {
    geohash: "9q8yyk12",
    roomID: "geo:npub1operator:9q8yyk12",
    placeTitle: "SFV Founders",
    startedAt: "2026-03-22T20:00:00.000Z",
    participantPubkeys: ["npub1scout"],
    participantStates: [{ pubkey: "npub1scout", mic: true, cam: false, screenshare: false }],
    mediaStreams: [],
    transport: "livekit",
    connectionState: "connected",
    statusMessage: "Connected",
    identity: "npub1scout",
    liveKitURL: "wss://livekit.example.test",
    expiresAt: "2026-03-22T21:00:00.000Z",
    canPublish: true,
    canSubscribe: true,
    mic: true,
    cam: false,
    screenshare: false,
    deafen: false,
    minimized: false,
    ...overrides
  };
}

function mockRect(width: number, height = 720): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({})
  } as DOMRect;
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width
  });
}

const mockMapPreview = vi.fn(
  ({
    children,
    tiles,
    selectedGeohash,
    activeGeohash,
    pendingGeohash,
    focusRequestKey,
    onSelectTile,
    onBackgroundSelectTile,
    onDismissPendingMarker,
    markerCards
  }: {
    children?: ReactNode;
    tiles?: Array<{ geohash: string }>;
    selectedGeohash?: string;
    focusRequestKey?: string;
    activeGeohash?: string | null;
    pendingGeohash?: string;
    onSelectTile?: (geohash: string) => void;
    onBackgroundSelectTile?: (geohash: string) => void;
    onDismissPendingMarker?: () => void;
    markerCards?: Array<{ geohash: string; ariaLabel: string; content: ReactNode }>;
  }) => (
    <div>
      <div data-testid="tile-geohashes">{(tiles ?? []).map((tile) => tile.geohash).join(",")}</div>
      <div data-testid="selected-geohash">{selectedGeohash ?? ""}</div>
      <div data-testid="focus-request-key">{focusRequestKey ?? ""}</div>
      <div data-testid="active-geohash">{activeGeohash ?? ""}</div>
      <div data-testid="pending-geohash">{pendingGeohash ?? ""}</div>
      <button type="button" onClick={() => onSelectTile?.("9q8yyk12")}>
        Marker select
      </button>
      <button type="button" onClick={() => onBackgroundSelectTile?.("9q8yyk34")}>
        Background select
      </button>
      {pendingGeohash ? (
        <button type="button" aria-label="Remove pending beacon marker" onClick={() => onDismissPendingMarker?.()}>
          Remove pending beacon marker
        </button>
      ) : null}
      {markerCards?.map((card) => (
        <div key={card.geohash} aria-label={card.ariaLabel}>
          {card.content}
        </div>
      ))}
      {children}
    </div>
  )
);

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="route-location">{`${location.pathname}${location.search}`}</div>;
}

vi.mock("../components/map-preview", () => ({
  MapPreview: (props: Parameters<typeof mockMapPreview>[0]) => mockMapPreview(props)
}));

vi.mock("../admin-client", () => ({
  grantRoomPermission: (...args: Parameters<typeof grantRoomPermission>) => grantRoomPermission(...args)
}));

vi.mock("../app-state", () => ({
  useAppState: () => ({
    activeCall,
    currentUser: profilesByPubkey[currentUserPubkey] ?? defaultProfile(currentUserPubkey),
    createBeacon,
    createPlaceNote,
    reactToPlaceNote,
    getBeacon: (geohash: string) =>
      beaconTiles.find((tile) => tile.geohash === geohash)
        ? {
            geohash,
            name: beaconTiles.find((tile) => tile.geohash === geohash)?.name ?? geohash,
            about: beaconTiles.find((tile) => tile.geohash === geohash)?.about ?? "",
            pinnedNoteId: beaconThreads.find((thread) => thread.geohash === geohash)?.pinnedNoteId,
            roomID: `geo:npub1operator:${geohash}`,
            cohort: beaconTiles.find((tile) => tile.geohash === geohash)?.cohort
          }
        : undefined,
    getBeaconParticipants: (geohash: string) => beaconParticipantsByGeohash[geohash] ?? [],
    getNote: (noteID: string) => notesForBeacon.find((note) => note.id === noteID),
    getProfile: (pubkey: string) => profilesByPubkey[pubkey],
    joinBeaconCall,
    leaveBeaconCall,
    listBeaconThreads: () => beaconThreads,
    listBeaconTiles: () => beaconTiles,
    listNotesForBeacon: (geohash: string) => notesForBeacon.filter((note) => note.geohash === geohash),
    relayOperatorPubkey: "npub1operator",
    refreshPlaceNotesFromRelay,
    uploadBeaconPicture
  })
}));

describe("WorldRoute", () => {
  beforeEach(() => {
    setViewportWidth(1024);
    currentUserPubkey = "npub1scout";
    activeCall = null;
    profilesByPubkey = {
      npub1scout: defaultProfile("npub1scout"),
      npub1operator: defaultProfile("npub1operator", {
        displayName: "Relay Operator",
        name: "Relay Operator",
        role: "Operator"
      })
    };
    beaconParticipantsByGeohash = {
      "9q8yyk12": [defaultProfile("npub1scout", { mic: true })]
    };
    joinBeaconCall.mockClear();
    leaveBeaconCall.mockClear();
    createBeacon.mockClear();
    createPlaceNote.mockClear();
    reactToPlaceNote.mockClear();
    refreshPlaceNotesFromRelay.mockClear();
    uploadBeaconPicture.mockClear();
    grantRoomPermission.mockClear();
    mockMapPreview.mockClear();
    beaconTiles = [
      {
        geohash: "9q8yyk12",
        name: "SFV Founders",
        about: "Low-pressure founder conversations in the valley.",
        roomID: "geo:npub1operator:9q8yyk12",
        latestNote: "",
        noteCount: 0,
        participants: ["npub1scout"],
        avatarUrl: undefined,
        live: true
      }
    ];
    beaconThreads = [
      {
        geohash: "9q8yyk12",
        name: "SFV Founders",
        about: "Low-pressure founder conversations in the valley.",
        noteCount: 1,
        participants: ["npub1scout"],
        unread: false,
        activeCall: true,
        pinnedNoteId: "note-1",
        roomID: "geo:npub1operator:9q8yyk12",
        avatarUrl: undefined
      }
    ];
    notesForBeacon = [
      {
        id: "note-1",
        geohash: "9q8yyk12",
        authorPubkey: "npub1scout",
        content: "Meet by the fountain.",
        createdAt: "2026-03-22T20:00:00.000Z",
        replies: 2
      }
    ];
    createPlaceNote.mockReturnValue({
      id: "note-2",
      geohash: "9q8yyk12",
      authorPubkey: "npub1scout",
      content: "Fresh note",
      createdAt: "2026-03-22T21:00:00.000Z",
      replies: 0
    });
    createBeacon.mockResolvedValue({
      created: true,
      beacon: {
        geohash: "9q8yyk34",
        title: "Lantern Point",
        neighborhood: "Newly lit beacon",
        description: "Meet after sunset.",
        activitySummary: "Freshly lit beacon.",
        picture: "https://example.com/beacon.png",
        tags: ["beacon", "geohash8"],
        capacity: 8,
        occupantPubkeys: [],
        unread: false
      }
    });
    uploadBeaconPicture.mockResolvedValue("https://example.com/beacon.png");
  });

  it("opens the Light Beacon flow from the background map callback without auto-joining the call", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /background select/i }));

    expect(joinBeaconCall).not.toHaveBeenCalled();
    expect(screen.getByRole("separator", { name: "Resize world panels" })).toBeInTheDocument();
    expect(screen.getByTestId("selected-geohash")).toHaveTextContent("");
    expect(screen.getByTestId("pending-geohash")).toHaveTextContent("9q8yyk34");
    expect(screen.getByRole("button", { name: /light beacon/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        "A beacon anchors an online community to a geolocation. As a beacon admin, you will be able to delete posts, kick users, and appoint mods within your beacon."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/chosen place/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no beacon is lit here yet\./i)).not.toBeInTheDocument();
  });

  it("removes the pending beacon marker when it is clicked", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /background select/i }));

    expect(screen.getByTestId("pending-geohash")).toHaveTextContent("9q8yyk34");

    fireEvent.click(screen.getByRole("button", { name: /remove pending beacon marker/i }));

    expect(screen.getByTestId("pending-geohash")).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: /light beacon/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/synchrono city manifesto/i)).toBeInTheDocument();
  });

  it("renders the manifesto in the right panel when no beacon is selected", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/synchrono city manifesto/i)).toBeInTheDocument();
    expect(screen.getByText(/amid exploding sovereign debt/i)).toBeInTheDocument();
    expect(screen.getByText("1. Human connection is the scarce good")).toBeInTheDocument();
  });

  it("opens the right panel when the map marker is selected", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("separator", { name: "Resize world panels" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /marker select/i }));

    expect(screen.getByTestId("selected-geohash")).toHaveTextContent("9q8yyk12");
    expect(screen.getByPlaceholderText(/message sfv founders/i)).toBeInTheDocument();
  });

  it("defaults the desktop world split close to halfway", async () => {
    setViewportWidth(1200);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => mockRect(1200));

    try {
      render(
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<WorldRoute />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole("separator", { name: "Resize world panels" })).toHaveAttribute("aria-valuenow", "600");
      });
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("submits a new beacon from the Light Beacon sheet and opens it", async () => {
    const user = userEvent.setup();
    createBeacon.mockImplementation(
      async (geohash: string, details: { name: string; picture: string; about: string; tags: string[] }) => {
        beaconTiles = [
          ...beaconTiles,
          {
            geohash,
            name: details.name,
            about: details.about,
            roomID: `geo:npub1operator:${geohash}`,
            latestNote: "",
            noteCount: 0,
            participants: [],
            avatarUrl: details.picture,
            live: false
          }
        ];
        beaconThreads = [
          ...beaconThreads,
          {
            geohash,
            name: details.name,
            about: details.about,
            noteCount: 0,
            participants: [],
            unread: false,
            activeCall: false,
            roomID: `geo:npub1operator:${geohash}`,
            avatarUrl: details.picture
          }
        ];
        notesForBeacon = [];

        return {
          created: true,
          beacon: {
            geohash,
            title: details.name,
            neighborhood: "Newly lit beacon",
            description: details.about,
            activitySummary: "Freshly lit beacon.",
            picture: details.picture,
            tags: ["beacon", "geohash8", ...details.tags],
            capacity: 8,
            occupantPubkeys: [],
            unread: false
          }
        };
      }
    );

    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /background select/i }));
    fireEvent.click(screen.getByRole("button", { name: /light beacon/i }));

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Lantern Point" }
    });
    await user.upload(
      screen.getByLabelText(/upload image/i),
      new File(["image"], "beacon.png", { type: "image/png" })
    );
    await waitFor(() => expect(uploadBeaconPicture).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/^about$/i), {
      target: { value: "Meet after sunset." }
    });
    fireEvent.change(screen.getByLabelText(/^tags$/i), {
      target: { value: "cohort, curriculum:zero-to-hero, level:beginner, hybrid" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^light beacon$/i }));

    await waitFor(() =>
      expect(createBeacon).toHaveBeenCalledWith("9q8yyk34", {
        name: "Lantern Point",
        picture: "https://example.com/beacon.png",
        about: "Meet after sunset.",
        tags: ["cohort", "curriculum:zero-to-hero", "level:beginner", "hybrid"]
      })
    );

    expect(screen.getByTestId("tile-geohashes")).toHaveTextContent("9q8yyk12,9q8yyk34");
    expect(await screen.findByPlaceholderText(/message lantern point/i)).toBeInTheDocument();
  });

  it("renders beacon cards by default, removes card action buttons, and opens from the title link", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const beaconCard = screen.getByLabelText(/beacon card sfv founders/i);
    expect(within(beaconCard).queryByRole("img", { name: /sfv founders/i })).not.toBeInTheDocument();
    expect(within(beaconCard).queryByRole("button", { name: /open/i })).not.toBeInTheDocument();
    expect(within(beaconCard).queryByRole("button", { name: /join call/i })).not.toBeInTheDocument();

    fireEvent.click(within(beaconCard).getByRole("link", { name: /sfv founders/i }));
    expect(screen.getByTestId("selected-geohash")).toHaveTextContent("9q8yyk12");
    expect(screen.getByPlaceholderText(/message sfv founders/i)).toBeInTheDocument();
  });

  it("shows the live participant count under the marker title and hides the participant roster", () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(new Date("2026-03-22T20:01:05.000Z").getTime());
    activeCall = createActiveCall();

    try {
      render(
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<WorldRoute />} />
          </Routes>
        </MemoryRouter>
      );

      const beaconCard = screen.getByLabelText(/beacon card sfv founders/i);
      const title = within(beaconCard).getByRole("link", { name: /sfv founders/i });
      const liveIndicator = within(beaconCard).getByText("1 LIVE - 01:05");
      const about = within(beaconCard).getByText(/low-pressure founder conversations in the valley\./i);

      expect(about).toHaveClass("marker-card-about");
      expect(title.compareDocumentPosition(liveIndicator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(liveIndicator.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(beaconCard).queryByText("Scout")).not.toBeInTheDocument();
      expect(within(beaconCard).queryByText(/npub1scout/i)).not.toBeInTheDocument();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("reads the beacon query parameter and renders the opened beacon panel", () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<><WorldRoute /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("route-location")).toHaveTextContent("/app?beacon=9q8yyk12");
    expect(screen.getByPlaceholderText(/message sfv founders/i)).toBeInTheDocument();
  });

  it("renders cohort beacon context and a listener-first join label", () => {
    beaconTiles = [{ ...beaconTiles[0], cohort: cohortMetadata }];
    beaconThreads = [{ ...beaconThreads[0], cohort: cohortMetadata }];
    notesForBeacon = [
      {
        id: "note-1",
        geohash: "9q8yyk12",
        authorPubkey: "npub1scout",
        content:
          "Week: 2/4\nConcept: Gradient descent intuition\nNext: Tuesday 7pm at the east tables\nArtifact: Week 2 notebook https://example.com/week-2-notebook\n\nWeek 2 focuses on gradient descent intuition and a tiny optimizer sketch.",
        createdAt: "2026-03-22T20:00:00.000Z",
        replies: 2
      }
    ];

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const cohortPanel = screen.getByText(/cohort beacon/i).closest("section");
    expect(cohortPanel).not.toBeNull();
    expect(screen.getByRole("heading", { name: /zero to hero/i })).toBeInTheDocument();
    expect(within(cohortPanel as HTMLElement).getByText(/^gradient descent intuition$/i)).toBeInTheDocument();
    expect(within(cohortPanel as HTMLElement).getByText(/^tuesday 7pm at the east tables$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join as listener/i })).toBeInTheDocument();
  });

  it("does not render the beacon about text in the right-panel header", () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const header = screen.getByRole("button", { name: /join call/i }).closest(".world-chat-header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).queryByText(/low-pressure founder conversations in the valley\./i)).not.toBeInTheDocument();
  });

  it("keeps the right-panel header free of the beacon name text", () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const header = screen.getByRole("button", { name: /join call/i }).closest(".world-chat-header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).queryByText(/^sfv founders$/i)).not.toBeInTheDocument();
  });

  it("renders a settings action to the left of join call in the right-panel header", () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const header = screen.getByRole("button", { name: /join call/i }).closest(".world-chat-header");
    expect(header).not.toBeNull();

    const actions = within(header as HTMLElement).getByRole("link", { name: /open settings/i }).closest(".world-chat-header-actions");
    expect(actions).not.toBeNull();

    const settingsLink = within(actions as HTMLElement).getByRole("link", { name: /open settings/i });
    const joinButton = within(actions as HTMLElement).getByRole("button", { name: /join call/i });

    expect(settingsLink).toHaveAttribute("href", "/app/settings");
    expect(Array.from((actions as HTMLElement).children)).toEqual([settingsLink, joinButton]);
  });

  it("swaps the join action to leave call for the active beacon room", async () => {
    activeCall = createActiveCall({ roomID: "geo:npub1operator:9q8yyk12" });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: /join call/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /leave call/i }));

    expect(leaveBeaconCall).toHaveBeenCalledTimes(1);
    expect(joinBeaconCall).not.toHaveBeenCalled();
  });

  it("renders beacon call media above the text chat when the selected room is active", () => {
    activeCall = createActiveCall({
      roomID: "geo:npub1operator:9q8yyk12",
      participantPubkeys: ["npub1scout", "npub1operator"],
      participantStates: [
        { pubkey: "npub1scout", mic: true, cam: false, screenshare: false },
        { pubkey: "npub1operator", mic: true, cam: false, screenshare: false }
      ]
    });

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const mediaRegion = screen.getByLabelText(/beacon call media streams/i);
    const messageList = screen.getByText("Meet by the fountain.").closest(".world-chat-messages");

    expect(mediaRegion).toBeInTheDocument();
    expect(within(mediaRegion).getByLabelText(/scout camera stream/i)).toBeInTheDocument();
    expect(within(mediaRegion).getByLabelText(/relay operator camera stream/i)).toBeInTheDocument();
    expect(messageList).not.toBeNull();
    expect(mediaRegion.compareDocumentPosition(messageList as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses the active call room id for host controls even when it differs from the beacon projection", async () => {
    currentUserPubkey = "npub1operator";
    beaconTiles = [{ ...beaconTiles[0], cohort: cohortMetadata }];
    beaconThreads = [{ ...beaconThreads[0], cohort: cohortMetadata }];
    profilesByPubkey.npub1guest = defaultProfile("npub1guest", {
      displayName: "Guest Listener",
      name: "Guest Listener"
    });
    activeCall = createActiveCall({
      roomID: "geo:npub1operator:9q8yyk12",
      participantPubkeys: ["npub1operator", "npub1guest"],
      participantStates: [
        { pubkey: "npub1operator", mic: true, cam: false, screenshare: false },
        { pubkey: "npub1guest", mic: false, cam: false, screenshare: false }
      ]
    });
    grantRoomPermission.mockResolvedValue({
      subject_pubkey: "npub1guest",
      room_id: "geo:npub1operator:9q8yyk12",
      can_join: true,
      can_publish: true,
      can_subscribe: true,
      granted_by_pubkey: "npub1operator",
      revoked: false
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: /allow mic\/cam/i }));

    await waitFor(() =>
      expect(grantRoomPermission).toHaveBeenCalledWith("npub1guest", "geo:npub1operator:9q8yyk12", {
        canJoin: true,
        canPublish: true,
        canSubscribe: true
      })
    );
  });

  it("lets the relay operator promote a connected participant from the world panel", async () => {
    currentUserPubkey = "npub1operator";
    beaconTiles = [{ ...beaconTiles[0], cohort: cohortMetadata }];
    beaconThreads = [{ ...beaconThreads[0], cohort: cohortMetadata }];
    profilesByPubkey.npub1guest = defaultProfile("npub1guest", {
      displayName: "Guest Listener",
      name: "Guest Listener"
    });
    activeCall = createActiveCall({
      participantPubkeys: ["npub1operator", "npub1guest"],
      participantStates: [
        { pubkey: "npub1operator", mic: true, cam: false, screenshare: false },
        { pubkey: "npub1guest", mic: false, cam: false, screenshare: false }
      ]
    });
    grantRoomPermission.mockResolvedValue({
      subject_pubkey: "npub1guest",
      room_id: "geo:npub1operator:9q8yyk12",
      can_join: true,
      can_publish: true,
      can_subscribe: true,
      granted_by_pubkey: "npub1operator",
      revoked: false
    });

    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /live room moderation/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /allow mic\/cam/i }));

    await waitFor(() =>
      expect(grantRoomPermission).toHaveBeenCalledWith("npub1guest", "geo:npub1operator:9q8yyk12", {
        canJoin: true,
        canPublish: true,
        canSubscribe: true
      })
    );
  });

  it("focuses the selected beacon on the map when clicking the header avatar", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<><WorldRoute /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("focus-request-key")).toHaveTextContent("");

    await user.click(screen.getByRole("button", { name: /show sfv founders on the map/i }));

    expect(screen.getByTestId("route-location").textContent).toMatch(/^\/app\?beacon=9q8yyk12&focus=/);
    expect(screen.getByTestId("focus-request-key").textContent).toMatch(/\S+/);
  });

  it("submits a new beacon message from the right panel with Enter and removes the send button", () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const composer = screen.getByPlaceholderText(/message sfv founders/i) as HTMLTextAreaElement;

    fireEvent.change(composer, {
      target: { value: "Fresh note" }
    });

    const enterEvent = createEvent.keyDown(composer, {
      key: "Enter",
      code: "Enter",
      charCode: 13
    });
    fireEvent(composer, enterEvent);

    expect(createPlaceNote).toHaveBeenCalledWith("9q8yyk12", "Fresh note");
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(screen.queryByRole("button", { name: /^send$/i })).not.toBeInTheDocument();
  });

  it("keeps Shift+Enter available for newlines in the right-panel composer", () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const composer = screen.getByPlaceholderText(/message sfv founders/i) as HTMLTextAreaElement;
    fireEvent.change(composer, {
      target: { value: "Fresh note" }
    });

    const shiftEnterEvent = createEvent.keyDown(composer, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
      shiftKey: true
    });
    fireEvent(composer, shiftEnterEvent);

    expect(createPlaceNote).not.toHaveBeenCalled();
    expect(shiftEnterEvent.defaultPrevented).toBe(false);
  });

  it("starts the beacon composer at one line and caps auto-growth at a max height", async () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const composer = screen.getByPlaceholderText(/message sfv founders/i) as HTMLTextAreaElement;
    expect(composer).toHaveAttribute("rows", "1");

    Object.defineProperty(composer, "scrollHeight", {
      configurable: true,
      get: () => (composer.value.includes("\n") ? 260 : 44)
    });

    fireEvent.change(composer, {
      target: { value: "Fresh note" }
    });

    await waitFor(() => {
      expect(composer.style.height).toBe("44px");
      expect(composer.style.overflowY).toBe("hidden");
    });

    fireEvent.change(composer, {
      target: { value: "Fresh note\nSecond line\nThird line" }
    });

    await waitFor(() => {
      expect(composer.style.height).toBe("176px");
      expect(composer.style.overflowY).toBe("auto");
    });
  });

  it("groups consecutive beacon messages from the same author under one header", () => {
    notesForBeacon = [
      {
        id: "note-1",
        geohash: "9q8yyk12",
        authorPubkey: "npub1scout",
        content: "First message",
        createdAt: "2026-03-22T20:00:00.000Z",
        replies: 0
      },
      {
        id: "note-2",
        geohash: "9q8yyk12",
        authorPubkey: "npub1scout",
        content: "Second message",
        createdAt: "2026-03-22T20:03:00.000Z",
        replies: 0
      }
    ];

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByRole("link", { name: /scout/i })).toHaveLength(1);
    expect(screen.getAllByText("npub1scout").length).toBeGreaterThan(0);
    expect(screen.getByText("First message")).toBeInTheDocument();
    expect(screen.getByText("Second message")).toBeInTheDocument();
  });

  it("adds ellipses after abbreviated npub labels", () => {
    const longNpub = "npub1abcdefghijklmnopqrstuvwxyz0123456789";
    delete profilesByPubkey[longNpub];
    notesForBeacon = [
      {
        id: "note-1",
        geohash: "9q8yyk12",
        authorPubkey: longNpub,
        content: "Long key message",
        createdAt: "2026-03-22T20:00:00.000Z",
        replies: 0
      }
    ];

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByText("npub1abcdefg...").length).toBeGreaterThan(0);
  });

  it("renders react and reply controls for each beacon message row", () => {
    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const messageRow = screen.getByText("Meet by the fountain.").closest(".world-chat-message");
    expect(messageRow).not.toBeNull();
    expect(within(messageRow as HTMLElement).getByRole("button", { name: /^react$/i })).toBeInTheDocument();
    expect(within(messageRow as HTMLElement).getByRole("button", { name: /^reply$/i })).toBeInTheDocument();
  });

  it("opens an emoji picker and publishes a reaction from the beacon thread", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const messageRow = screen.getByText("Meet by the fountain.").closest(".world-chat-message");
    expect(messageRow).not.toBeNull();

    await user.click(within(messageRow as HTMLElement).getByRole("button", { name: /^react$/i }));
    await user.click(screen.getByRole("button", { name: /react with 🔥/i }));

    expect(reactToPlaceNote).toHaveBeenCalledWith("note-1", "🔥");
  });

  it("shows reply context in the composer and sends a tagged reply against the selected note", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    const messageRow = screen.getByText("Meet by the fountain.").closest(".world-chat-message");
    expect(messageRow).not.toBeNull();

    await user.click(within(messageRow as HTMLElement).getByRole("button", { name: /^reply$/i }));
    expect(screen.getByLabelText(/reply target/i)).toHaveTextContent(/replying to scout/i);

    await user.type(screen.getByPlaceholderText(/message sfv founders/i), "On my way{enter}");

    expect(createPlaceNote).toHaveBeenCalledWith(
      "9q8yyk12",
      "On my way",
      expect.objectContaining({
        replyTo: expect.objectContaining({ id: "note-1" })
      })
    );
  });

  it("keeps the narrow beacon panel free of close and back buttons", () => {
    setViewportWidth(540);

    render(
      <MemoryRouter initialEntries={["/app?beacon=9q8yyk12"]}>
        <Routes>
          <Route path="/app" element={<WorldRoute />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole("separator", { name: "Resize world panels" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^back$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join call/i })).toBeInTheDocument();
  });
});
