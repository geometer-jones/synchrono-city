import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const liveKitMocks = vi.hoisted(() => {
  const session = {
    disconnect: vi.fn(),
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) => enabled),
    setCameraEnabled: vi.fn(async (enabled: boolean) => enabled),
    setScreenShareEnabled: vi.fn(async (enabled: boolean) => enabled),
    setDeafenEnabled: vi.fn()
  };

  return {
    connectLiveKitSessionMock: vi.fn(),
    session
  };
});

vi.mock("./livekit-session", () => ({
  connectLiveKitSession: liveKitMocks.connectLiveKitSessionMock
}));

import { AppShell } from "./routes/app-shell";
import { ChatsRoute } from "./routes/chats-route";
import { PulseRoute } from "./routes/pulse-route";
import { SettingsRoute } from "./routes/settings-route";
import { SplashRoute } from "./routes/splash-route";
import { importLocalKeyMaterial } from "./key-manager";
import type { BootstrapPayload } from "./social-payload";
import { ToastProvider } from "./toast";
import { WorldRoute } from "./routes/world-route";

type PlacePayload = NonNullable<BootstrapPayload["places"]>[number];
type ProfilePayload = NonNullable<BootstrapPayload["profiles"]>[number];
type NotePayload = NonNullable<BootstrapPayload["notes"]>[number];
type FeedSegmentPayload = NonNullable<BootstrapPayload["feed_segments"]>[number];
type RelayListPayload = NonNullable<BootstrapPayload["relay_list"]>[number];
type CrossRelayItemPayload = NonNullable<BootstrapPayload["cross_relay_items"]>[number];

function createBootstrapPayload(overrides: Partial<BootstrapPayload> = {}): BootstrapPayload {
  return {
    relay_name: "Synchrono City Local",
    relay_operator_pubkey: "npub1operator",
    current_user_pubkey: "npub1scout",
    relay_url: "ws://localhost:8080",
    relay_list: [
      {
        name: "Synchrono City Local",
        url: "ws://localhost:8080",
        inbox: true,
        outbox: true
      }
    ],
    places: [],
    profiles: [],
    notes: [],
    feed_segments: [],
    cross_relay_items: [],
    ...overrides
  };
}

function createPlace(place: Partial<PlacePayload> & Pick<PlacePayload, "geohash" | "title">): PlacePayload {
  return {
    geohash: place.geohash,
    title: place.title,
    neighborhood: place.neighborhood ?? "",
    description: place.description ?? "",
    activitySummary: place.activitySummary ?? "",
    tags: place.tags ?? [],
    capacity: place.capacity ?? 8,
    occupantPubkeys: place.occupantPubkeys ?? [],
    unread: place.unread ?? false,
    pinnedNoteId: place.pinnedNoteId
  };
}

function createProfile(
  profile: Partial<ProfilePayload> & Pick<ProfilePayload, "pubkey" | "displayName">
): ProfilePayload {
  return {
    pubkey: profile.pubkey,
    displayName: profile.displayName,
    name: profile.name,
    picture: profile.picture,
    role: profile.role ?? "Participant",
    status: profile.status ?? "",
    bio: profile.bio ?? "",
    homeGeohash: profile.homeGeohash,
    mic: profile.mic ?? false,
    cam: profile.cam ?? false,
    screenshare: profile.screenshare ?? false,
    deafen: profile.deafen ?? false
  };
}

function createNote(note: NotePayload): NotePayload {
  return note;
}

function createFeedSegment(segment: FeedSegmentPayload): FeedSegmentPayload {
  return segment;
}

function createRelayListEntry(entry: RelayListPayload): RelayListPayload {
  return entry;
}

function createCrossRelayItem(item: CrossRelayItemPayload): CrossRelayItemPayload {
  return item;
}

function createWorldBootstrap(): BootstrapPayload {
  return createBootstrapPayload({
    places: [
      createPlace({
        geohash: "9q8yyk",
        title: "Civic plaza",
        neighborhood: "Market steps",
        activitySummary: "Tenant organizing thread with a pinned logistics note and a live room.",
        occupantPubkeys: ["npub1aurora", "npub1jules", "npub1sol"],
        unread: true,
        pinnedNoteId: "note-plaza-pinned"
      }),
      createPlace({
        geohash: "9q8yym",
        title: "Warehouse annex",
        neighborhood: "Harbor side",
        activitySummary: "The venue lead moved the afterparty indoors and is guiding arrivals.",
        occupantPubkeys: ["npub1mika"]
      }),
      createPlace({
        geohash: "9q8yyt",
        title: "Audio fallback",
        neighborhood: "Transit corridor",
        activitySummary: "Late arrivals are using the room as a rendezvous channel.",
        occupantPubkeys: ["npub1river"]
      })
    ],
    notes: [
      createNote({
        id: "note-plaza-pinned",
        geohash: "9q8yyk",
        authorPubkey: "npub1aurora",
        content: "Sunset meetup is shifting to the east stairs.",
        createdAt: "2026-03-18T18:20:00Z",
        replies: 4
      }),
      createNote({
        id: "note-plaza-access",
        geohash: "9q8yyk",
        authorPubkey: "npub1jules",
        content: "North gate is clear again. Wheelchair route is the left ramp.",
        createdAt: "2026-03-18T18:08:00Z",
        replies: 2
      }),
      createNote({
        id: "note-plaza-stream",
        geohash: "9q8yyk",
        authorPubkey: "npub1sol",
        content: "Screenshare is live for anyone still walking over.",
        createdAt: "2026-03-18T17:58:00Z",
        replies: 1
      })
    ],
    profiles: [
      createProfile({
        pubkey: "npub1scout",
        displayName: "Field Scout",
        name: "Field Scout",
        role: "Local member",
        picture: "https://images.example.test/field-scout.png",
        mic: true
      }),
      createProfile({
        pubkey: "npub1aurora",
        displayName: "Aurora Vale",
        name: "Aurora Vale",
        role: "Tenant organizer",
        picture: "https://images.example.test/aurora-vale.png",
        mic: true
      }),
      createProfile({
        pubkey: "npub1jules",
        displayName: "Jules Mercer",
        name: "Jules Mercer",
        role: "Neighborhood volunteer",
        picture: "https://images.example.test/jules-mercer.png",
        mic: true,
        cam: true
      }),
      createProfile({
        pubkey: "npub1sol",
        displayName: "Sol Marin",
        name: "Sol Marin",
        role: "Event host",
        picture: "https://images.example.test/sol-marin.png",
        cam: true,
        screenshare: true
      }),
      createProfile({
        pubkey: "npub1mika",
        displayName: "Mika Hart",
        name: "Mika Hart",
        role: "Venue lead"
      })
    ]
  });
}

function createPulseBootstrap(): BootstrapPayload {
  return createBootstrapPayload({
    places: [
      createPlace({
        geohash: "9q8yyk",
        title: "Civic plaza",
        activitySummary: "Tenant organizing thread with a pinned logistics note and a live room.",
        occupantPubkeys: ["npub1aurora", "npub1jules"],
        pinnedNoteId: "note-plaza-pinned"
      }),
      createPlace({
        geohash: "9q8yym",
        title: "Warehouse annex",
        activitySummary: "Venue spillover is being coordinated indoors."
      })
    ],
    profiles: [
      createProfile({
        pubkey: "npub1aurora",
        displayName: "Aurora Vale",
        role: "Tenant organizer"
      }),
      createProfile({
        pubkey: "npub1jules",
        displayName: "Jules Mercer",
        role: "Neighborhood volunteer"
      })
    ],
    notes: [
      createNote({
        id: "note-plaza-pinned",
        geohash: "9q8yyk",
        authorPubkey: "npub1aurora",
        content: "Tenant organizing thread with a pinned logistics note and a live room.",
        createdAt: "2026-03-18T18:20:00Z",
        replies: 4
      })
    ],
    feed_segments: [
      createFeedSegment({ name: "Following", description: "Followed activity." }),
      createFeedSegment({ name: "Local", description: "Active relay activity." }),
      createFeedSegment({ name: "For You", description: "Discovered relay activity." })
    ],
    cross_relay_items: [
      createCrossRelayItem({
        id: "cross-relay-plaza",
        relayName: "Mission Mesh",
        relayUrl: "wss://mission-mesh.example/relay",
        authorPubkey: "npub1tala",
        authorName: "Tala North",
        geohash: "9q8yyk",
        placeTitle: "Civic plaza",
        content: "March overflow is heading for the east stairs.",
        publishedAt: "2026-03-18T18:12:00Z",
        sourceLabel: "Direct follow",
        whyVisible: "Same public tile."
      }),
      createCrossRelayItem({
        id: "cross-relay-annex",
        relayName: "Harbor Dispatch",
        relayUrl: "wss://harbor-dispatch.example/relay",
        authorPubkey: "npub1ines",
        authorName: "Ines Park",
        geohash: "9q8yym",
        placeTitle: "Warehouse annex",
        content: "Venue queue is clear from the alley entrance.",
        publishedAt: "2026-03-18T18:06:00Z",
        sourceLabel: "Relay list",
        whyVisible: "Configured relay surfaced a matching logistics thread."
      })
    ]
  });
}

function createOperatorBootstrap(): BootstrapPayload {
  return createBootstrapPayload({
    current_user_pubkey: "npub1operator",
    profiles: [createProfile({ pubkey: "npub1operator", displayName: "Operator", role: "Owner" })]
  });
}

function renderRouter(
  entry: string,
  options?: {
    bootstrapPayload?: BootstrapPayload;
    handler?: (url: URL, init?: RequestInit) => Promise<Response | undefined> | Response | undefined;
  }
) {
  if (!vi.isMockFunction(globalThis.fetch)) {
    ensureBootstrapFetchMock(options?.handler, options?.bootstrapPayload);
  }
  const user = userEvent.setup();
  const view = render(
    <ToastProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<SplashRoute />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<WorldRoute />} />
            <Route path="chats" element={<ChatsRoute />} />
            <Route path="pulse" element={<PulseRoute />} />
            <Route path="settings" element={<SettingsRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  );
  return { user, ...view };
}

function resolveRequestURL(input: RequestInfo | URL) {
  if (input instanceof Request) {
    return new URL(input.url);
  }
  return new URL(String(input), window.location.origin);
}

function ensureBootstrapFetchMock(
  handler?: (url: URL, init?: RequestInit) => Promise<Response | undefined> | Response | undefined,
  bootstrapPayload: BootstrapPayload = createBootstrapPayload()
) {
  if (!vi.isMockFunction(globalThis.fetch)) {
    vi.spyOn(globalThis, "fetch");
  }

  return vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
    const url = resolveRequestURL(input);

    if (handler) {
      const response = await handler(url, init);
      if (response) {
        return response;
      }
    }

    if (url.pathname === "/api/v1/social/bootstrap") {
      return jsonResponse(bootstrapPayload);
    }

    throw new Error(`Unexpected fetch URL: ${url.toString()}`);
  });
}

function mockFetchWithBootstrap(
  handler: (url: URL, init?: RequestInit) => Promise<Response | undefined> | Response | undefined,
  bootstrapPayload?: BootstrapPayload
) {
  return ensureBootstrapFetchMock(handler, bootstrapPayload);
}

function primeLiveKitMock() {
  liveKitMocks.session.disconnect.mockReset();
  liveKitMocks.session.setMicrophoneEnabled.mockReset();
  liveKitMocks.session.setCameraEnabled.mockReset();
  liveKitMocks.session.setScreenShareEnabled.mockReset();
  liveKitMocks.session.setDeafenEnabled.mockReset();
  liveKitMocks.connectLiveKitSessionMock.mockReset();
  liveKitMocks.connectLiveKitSessionMock.mockImplementation(async (options) => {
    options.onConnectionStatus("connected", "LiveKit room connected.");
    options.onParticipantsChanged([
      {
        identity: "npub1scout",
        mic: true,
        cam: false,
        screenshare: false,
        isSpeaking: false,
        isLocal: true
      },
      {
        identity: "npub1aurora",
        mic: true,
        cam: false,
        screenshare: false,
        isSpeaking: true,
        isLocal: false
      }
    ]);
    return liveKitMocks.session;
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function createRelayWebSocketMock(options?: {
  profileMetadataByAuthorHex?: Record<string, Array<{ createdAt: number; content: Record<string, string> }>>;
}) {
  const instances: Array<{
    url: string;
    sentMessages: string[];
    deliverMessage: (payload: unknown) => void;
  }> = [];
  const publishedEvents: NostrSignedEvent[] = [];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    url: string;
    sentMessages: string[] = [];
    private listeners = new Map<string, Set<(event?: { data?: string }) => void>>();

    constructor(url: string) {
      this.url = url;
      instances.push({
        url: this.url,
        sentMessages: this.sentMessages,
        deliverMessage: (payload) => {
          this.emit("message", {
            data: JSON.stringify(payload)
          });
        }
      });
      queueMicrotask(() => {
        this.readyState = MockWebSocket.OPEN;
        this.emit("open");
      });
    }

    addEventListener(type: string, listener: (event?: { data?: string }) => void) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: (event?: { data?: string }) => void) {
      this.listeners.get(type)?.delete(listener);
    }

    send(data: string) {
      this.sentMessages.push(data);
      const payload = JSON.parse(data) as unknown;
      if (!Array.isArray(payload)) {
        return;
      }

      if (payload[0] === "EVENT" && typeof payload[1] === "object" && payload[1]) {
        const event = payload[1] as Partial<NostrSignedEvent>;
        if (typeof event.id !== "string") {
          return;
        }

        if (event.kind === 1 && typeof event.pubkey === "string" && typeof event.sig === "string") {
          publishedEvents.unshift(event as NostrSignedEvent);
        }

        queueMicrotask(() => {
          this.emit("message", {
            data: JSON.stringify(["OK", event.id, true, ""])
          });
        });
        return;
      }

      if (payload[0] !== "REQ") {
        return;
      }

      const subscriptionID = String(payload[1] ?? "");
      const filter = payload[2] as { authors?: string[]; ["#g"]?: string[] } | undefined;
      const authors = Array.isArray(filter?.authors) ? filter.authors : [];
      const geohashes = Array.isArray(filter?.["#g"])
        ? filter["#g"].map((geohash) => geohash.trim().toLowerCase()).filter(Boolean)
        : [];
      const matchingPublishedEvents = publishedEvents.filter((event) => {
        const geohash = extractGeohashTag(event.tags);
        return geohash ? geohashes.includes(geohash) : false;
      });
      const hasProfileMetadataResponses = authors.some((author) => {
        return (options?.profileMetadataByAuthorHex?.[author]?.length ?? 0) > 0;
      });

      if (!hasProfileMetadataResponses && matchingPublishedEvents.length === 0) {
        return;
      }

      queueMicrotask(() => {
        for (const author of authors) {
          for (const response of options?.profileMetadataByAuthorHex?.[author] ?? []) {
            this.emit("message", {
              data: JSON.stringify([
                "EVENT",
                subscriptionID,
                {
                  id: `kind0-${author}-${response.createdAt}`,
                  pubkey: author,
                  created_at: response.createdAt,
                  kind: 0,
                  tags: [],
                  content: JSON.stringify(response.content),
                  sig: `sig-${author}-${response.createdAt}`
                }
              ])
            });
          }
        }

        for (const event of matchingPublishedEvents) {
          this.emit("message", {
            data: JSON.stringify(["EVENT", subscriptionID, event])
          });
        }

        this.emit("message", {
          data: JSON.stringify(["EOSE", subscriptionID])
        });
      });
    }

    close() {
      this.readyState = MockWebSocket.CLOSED;
      queueMicrotask(() => {
        this.emit("close");
      });
    }

    private emit(type: string, event?: { data?: string }) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event);
      }
    }
  }

  return {
    instances,
    WebSocket: MockWebSocket as unknown as typeof WebSocket
  };
}

function extractGeohashTag(tags: string[][]) {
  for (const tag of tags) {
    if (tag[0] === "g" && typeof tag[1] === "string" && tag[1].trim()) {
      return tag[1].trim().toLowerCase();
    }
  }

  return null;
}

afterEach(() => {
  vi.restoreAllMocks();
  primeLiveKitMock();
  if (typeof window.localStorage === "object" && window.localStorage && typeof window.localStorage.clear === "function") {
    window.localStorage.clear();
  }
  delete window.nostr;
});

primeLiveKitMock();

describe("app shell", () => {
  it("renders the splash route", () => {
    renderRouter("/");

    expect(screen.getByRole("button", { name: /enter the city/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /host your own/i })).toBeInTheDocument();
  });

  it("renders the world route with beacon metadata", async () => {
    renderRouter("/app", { bootstrapPayload: createWorldBootstrap() });

    expect(screen.getByRole("heading", { name: /synchrono\.city/i })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /civic plaza 9q8yyk has 3 notes and 3 live participants/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /warehouse annex 9q8yym has 0 notes and 1 live participants/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /audio fallback 9q8yyt has 0 notes and 1 live participants/i })).toBeInTheDocument();
    expect(screen.getByText(/select a beacon on the map\./i)).toBeInTheDocument();
    expect(screen.getByLabelText(/beacon card civic plaza/i)).toBeInTheDocument();
  });

  it("queries relay kind 1 notes when opening a beacon", async () => {
    const relaySocketMock = createRelayWebSocketMock();
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = relaySocketMock.WebSocket;
    const author = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );

    try {
      const { user } = renderRouter("/app", { bootstrapPayload: createWorldBootstrap() });

      await user.click(
        await screen.findByRole("button", {
          name: /warehouse annex 9q8yym has 0 notes and 1 live participants/i
        })
      );

      await waitFor(() => expect(relaySocketMock.instances.length).toBeGreaterThan(0));

      const annexRequest = JSON.parse(String(relaySocketMock.instances[0]?.sentMessages[0])) as [
        string,
        string,
        { kinds?: number[]; "#g"?: string[] }
      ];
      expect(annexRequest).toEqual([
        "REQ",
        expect.any(String),
        {
          kinds: [1],
          "#g": ["9q8yym"]
        }
      ]);

      relaySocketMock.instances[0]?.deliverMessage([
        "EVENT",
        annexRequest[1],
        {
          id: "relay-note-annex",
          pubkey: author.publicKeyHex,
          created_at: 200,
          kind: 1,
          tags: [["g", "9q8yym"]],
          content: "Annex note from relay",
          sig: "relay-sig"
        }
      ]);
      relaySocketMock.instances[0]?.deliverMessage(["EOSE", annexRequest[1]]);

      const chatPanel = document.querySelector(".world-chat-thread");
      expect(chatPanel).not.toBeNull();
      await waitFor(() => {
        expect(within(chatPanel as HTMLElement).getByText("Annex note from relay")).toBeInTheDocument();
      });
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("selects a marker and shows the beacon card before join", async () => {
    const { user } = renderRouter("/app", { bootstrapPayload: createWorldBootstrap() });

    await user.click(
      await screen.findByRole("button", {
        name: /civic plaza 9q8yyk has 3 notes and 3 live participants/i
      })
    );

    const markerCard = await screen.findByLabelText(/beacon card civic plaza/i);
    expect(within(markerCard).getByText(/tenant organizing thread with a pinned logistics note and a live room\./i)).toBeInTheDocument();
    expect(within(markerCard).queryByRole("button", { name: /join call/i })).not.toBeInTheDocument();
    expect(within(markerCard).queryByRole("button", { name: /leave call/i })).not.toBeInTheDocument();
    expect(within(markerCard).queryByRole("link", { name: /open place/i })).not.toBeInTheDocument();
    expect(within(markerCard).queryByText(/latest kind 1/i)).not.toBeInTheDocument();
    expect(within(markerCard).queryByText(/livekit room/i)).not.toBeInTheDocument();
    expect(within(markerCard).queryByText(/geo:npub1operator:9q8yyk/i)).not.toBeInTheDocument();

    expect((await screen.findAllByRole("heading", { name: /civic plaza/i })).length).toBeGreaterThan(0);
    expect(screen.queryByText(/geo:npub1operator:9q8yyk/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /leave call/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/selected place civic plaza/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join call/i })).toBeInTheDocument();

    const callBar = document.querySelector(".call-overlay");
    expect(callBar).toBeNull();
  });

  it("upgrades a joined room with a LiveKit token while keeping the marker card visible", async () => {
    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1operator"),
      signEvent: vi.fn().mockImplementation(async (event) => ({
        ...event,
        id: `signed-${event.created_at}`,
        pubkey: "npub1operator",
        sig: "sig"
      }))
    };

    mockFetchWithBootstrap(async (url, init) => {
      const headers = new Headers(init?.headers);

      if (url.pathname === "/api/v1/token") {
        expect(headers.get("Authorization")).toMatch(/^Nostr /);
        return jsonResponse({
          decision: "allow",
          reason: "room_permission",
          token: {
            token: "jwt-token",
            identity: "npub1operator",
            room_id: "geo:npub1operator:9q8yyk",
            livekit_url: "ws://livekit.example.test",
            expires_at: "2026-03-20T12:10:00Z",
            grants: {
              room_join: true,
              can_publish: true,
              can_subscribe: true
            }
          }
        });
      }

      return undefined;
    }, createWorldBootstrap());

    const { user } = renderRouter("/app", { bootstrapPayload: createWorldBootstrap() });

    await user.click(
      await screen.findByRole("button", {
        name: /civic plaza 9q8yyk has 3 notes and 3 live participants/i
      })
    );
    const markerCard = await screen.findByLabelText(/beacon card civic plaza/i);
    await user.click(screen.getByRole("button", { name: /join call/i }));

    expect(markerCard).toBeInTheDocument();
    expect(await screen.findByLabelText(/live call bar/i)).toBeInTheDocument();
    expect(liveKitMocks.connectLiveKitSessionMock).toHaveBeenCalledTimes(1);
    expect(liveKitMocks.session.setMicrophoneEnabled).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole("button", { name: /camera off/i }));
    expect(liveKitMocks.session.setCameraEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: /camera on/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not label ad-hoc room fallback as server unavailable on call-intent client errors", async () => {
    mockFetchWithBootstrap(async (url) => {
      if (url.pathname === "/api/v1/social/call-intent") {
        return jsonResponse(
          {
            error: "invalid_request",
            message: "unknown place"
          },
          404
        );
      }

      return undefined;
    }, createWorldBootstrap());

    const { user } = renderRouter("/app", { bootstrapPayload: createWorldBootstrap() });

    await user.click(
      await screen.findByRole("button", {
        name: /civic plaza 9q8yyk has 3 notes and 3 live participants/i
      })
    );
    await screen.findByLabelText(/beacon card civic plaza/i);
    await user.click(screen.getByRole("button", { name: /join call/i }));

    expect(await screen.findByRole("button", { name: /leave call/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/using fallback room\. server unavailable\./i)).not.toBeInTheDocument()
    );
  });

  it("publishes a beacon note from world and keeps it out of pulse", async () => {
    const { user } = renderRouter("/app?beacon=9q8yyk", {
      bootstrapPayload: createBootstrapPayload({
        places: [createPlace({ geohash: "9q8yyk", title: "Civic plaza", activitySummary: "Open thread." })]
      })
    });

    await user.type(await screen.findByPlaceholderText(/message civic plaza/i), "Meet at the fountain in five.{enter}");

    expect((await screen.findAllByText(/meet at the fountain in five\./i)).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("link", { name: /^pulse$/i })[0]);

    expect(await screen.findByRole("heading", { name: /relay feed projection/i })).toBeInTheDocument();
    expect(await screen.findByText(/no feed activity yet\./i)).toBeInTheDocument();
    expect(screen.queryByText(/meet at the fountain in five\./i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open note/i })).not.toBeInTheDocument();
  });

  it("keeps a posted beacon note singular after reopening the beacon from navigation", async () => {
    const relaySocketMock = createRelayWebSocketMock();
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = relaySocketMock.WebSocket;

    const localKey = importLocalKeyMaterial("1111111111111111111111111111111111111111111111111111111111111111");
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        }
      }
    });
    window.localStorage.setItem(
      "synchrono-city.local-keyring",
      JSON.stringify({
        activePublicKeyNpub: localKey.publicKeyNpub,
        keys: [localKey]
      })
    );

    mockFetchWithBootstrap(async (url, init) => {
      if (url.pathname === "/api/v1/social/notes") {
        const payload = JSON.parse(String(init?.body)) as {
          geohash: string;
          author_pubkey: string;
          content: string;
        };

        return jsonResponse({
          id: "note-server-1",
          geohash: payload.geohash,
          author_pubkey: payload.author_pubkey,
          content: payload.content,
          created_at: new Date().toISOString(),
          replies: 0
        }, 201);
      }

      return undefined;
    }, createBootstrapPayload({
      current_user_pubkey: localKey.publicKeyNpub,
      places: [createPlace({ geohash: "9q8yyk", title: "Civic plaza", activitySummary: "Open thread." })]
    }));

    try {
      const { user } = renderRouter("/app?beacon=9q8yyk");
      await waitFor(() => {
        expect(
          relaySocketMock.instances.some((instance) =>
            instance.sentMessages[0]?.includes('"#g":["9q8yyk"]')
          )
        ).toBe(true);
      });

      const initialQueryInstance = relaySocketMock.instances.find((instance) =>
        instance.sentMessages[0]?.includes('"#g":["9q8yyk"]')
      );
      const initialRequest = JSON.parse(String(initialQueryInstance?.sentMessages[0])) as [string, string];
      initialQueryInstance?.deliverMessage(["EOSE", initialRequest[1]]);

      await user.type(await screen.findByPlaceholderText(/message civic plaza/i), "Meet at the fountain in five.{enter}");

      const worldChatThread = document.querySelector(".world-chat-thread");
      if (!(worldChatThread instanceof HTMLElement)) {
        throw new Error("world chat thread missing");
      }

      await waitFor(() => {
        expect(within(worldChatThread).getAllByText("Meet at the fountain in five.")).toHaveLength(1);
      });

      await user.click(screen.getAllByRole("link", { name: /^pulse$/i })[0]);
      await screen.findByRole("heading", { name: /relay feed projection/i });
      await user.click(screen.getAllByRole("link", { name: /^world$/i })[0]);

      const reopenedThread = document.querySelector(".world-chat-thread");
      if (!(reopenedThread instanceof HTMLElement)) {
        throw new Error("reopened world chat thread missing");
      }

      await waitFor(() => {
        expect(within(reopenedThread).getAllByText("Meet at the fountain in five.")).toHaveLength(1);
      });
      expect(
        relaySocketMock.instances.filter((instance) => instance.sentMessages[0]?.includes('"#g":["9q8yyk"]')).length
      ).toBe(2);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it("normalizes snake_case note responses after posting from world", async () => {
    mockFetchWithBootstrap(async (url, init) => {
      if (url.pathname === "/api/v1/social/notes") {
        const payload = JSON.parse(String(init?.body)) as {
          geohash: string;
          author_pubkey: string;
          content: string;
        };

        return jsonResponse({
          id: "note-server-snake-case",
          geohash: payload.geohash,
          author_pubkey: payload.author_pubkey,
          content: payload.content,
          created_at: "2026-03-18T18:30:00Z",
          replies: 0
        }, 201);
      }

      return undefined;
    }, createBootstrapPayload({
      places: [createPlace({ geohash: "9q8yyk", title: "Civic plaza", activitySummary: "Open thread." })]
    }));

    const { user } = renderRouter("/app?beacon=9q8yyk");

    await user.type(await screen.findByPlaceholderText(/message civic plaza/i), "Meet at the fountain in five.{enter}");

    const worldChatThread = document.querySelector(".world-chat-thread");
    if (!(worldChatThread instanceof HTMLElement)) {
      throw new Error("world chat thread missing");
    }

    const worldChat = within(worldChatThread);
    expect(await worldChat.findByText("Meet at the fountain in five.")).toBeInTheDocument();
    expect(worldChat.getAllByText(/npub1scout/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens the relay connection when publishing a world note with a local signer", async () => {
    const relaySocketMock = createRelayWebSocketMock();
    const originalWebSocket = globalThis.WebSocket;
    const originalLocalStorage = window.localStorage;
    globalThis.WebSocket = relaySocketMock.WebSocket;

    const localKey = importLocalKeyMaterial("1111111111111111111111111111111111111111111111111111111111111111");
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        }
      }
    });
    window.localStorage.setItem(
      "synchrono-city.local-keyring",
      JSON.stringify({
        activePublicKeyNpub: localKey.publicKeyNpub,
        keys: [localKey]
      })
    );

    mockFetchWithBootstrap(async (url, init) => {
      if (url.pathname === "/api/v1/social/notes") {
        const payload = JSON.parse(String(init?.body)) as {
          geohash: string;
          author_pubkey: string;
          content: string;
        };

        expect(payload).toEqual({
          geohash: "9q8yyk",
          author_pubkey: localKey.publicKeyNpub,
          content: "Meet at the fountain in five."
        });

        return jsonResponse({
          id: "note-server-1",
          geohash: payload.geohash,
          authorPubkey: payload.author_pubkey,
          content: payload.content,
          createdAt: "2026-03-18T18:30:00Z",
          replies: 0
        }, 201);
      }

      return undefined;
    }, createBootstrapPayload({
      current_user_pubkey: localKey.publicKeyNpub,
      places: [createPlace({ geohash: "9q8yyk", title: "Civic plaza", activitySummary: "Open thread." })]
    }));

    try {
      const { user } = renderRouter("/app?beacon=9q8yyk");

      await user.type(await screen.findByPlaceholderText(/message civic plaza/i), "Meet at the fountain in five.{enter}");

      await waitFor(() =>
        expect(relaySocketMock.instances.some((instance) => instance.sentMessages[0]?.startsWith("[\"EVENT\""))).toBe(true)
      );

      const publishInstance = relaySocketMock.instances.find((instance) => instance.sentMessages[0]?.startsWith("[\"EVENT\""));
      expect(publishInstance).toBeTruthy();

      expect(publishInstance?.url).toBe("ws://localhost:8080/");
      const eventMessage = JSON.parse(String(publishInstance?.sentMessages[0])) as [
        string,
        NostrSignedEvent
      ];
      expect(eventMessage[0]).toBe("EVENT");
      expect(eventMessage[1].kind).toBe(1);
      expect(eventMessage[1].tags).toEqual([["g", "9q8yyk"]]);
      expect(eventMessage[1].content).toBe("Meet at the fountain in five.");
    } finally {
      globalThis.WebSocket = originalWebSocket;
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
  });

  it("keeps chats as a private-only inbox even when a geohash query is present", async () => {
    renderRouter("/app/chats?geohash=9q8yym", {
      bootstrapPayload: createBootstrapPayload({
        places: [createPlace({ geohash: "9q8yym", title: "Warehouse annex", occupantPubkeys: ["npub1mika"] })],
        profiles: [createProfile({ pubkey: "npub1mika", displayName: "Mika Hart", role: "Venue lead" })]
      })
    });

    expect(await screen.findByText(/no private chats yet\./i)).toBeInTheDocument();
    expect(screen.getByText(/direct messages and group dms/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view profile/i })).not.toBeInTheDocument();
  });

  it("does not render an open place link in a world beacon card", async () => {
    renderRouter("/app", { bootstrapPayload: createWorldBootstrap() });

    await userEvent.setup().click(
      await screen.findByRole("button", {
        name: /civic plaza 9q8yyk has 3 notes and 3 live participants/i
      })
    );
    const civicPlazaCard = await screen.findByLabelText(/beacon card civic plaza/i);
    expect(within(civicPlazaCard).queryByRole("link", { name: /open place/i })).not.toBeInTheDocument();
    expect(within(civicPlazaCard).queryByRole("button", { name: /join call/i })).not.toBeInTheDocument();
    expect(within(civicPlazaCard).queryByRole("button", { name: /leave call/i })).not.toBeInTheDocument();
  });

  it("renders a merged phase 6 feed alongside synthesis and editorial sections in pulse", async () => {
    renderRouter("/app/pulse", { bootstrapPayload: createPulseBootstrap() });

    expect(await screen.findByRole("heading", { name: /ai synthesis/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /cross-relay merge/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /operator pins/i })).toBeInTheDocument();
    expect(screen.getAllByText(/tenant organizing thread with a pinned logistics note and a live room\./i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/local relay/i)).not.toBeInTheDocument();
    expect(screen.getByText(/mission mesh/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /source beacon · aurora vale/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open note/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view author/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /compare local beacon/i })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /open relay/i })).toHaveLength(2);
  });

  it("renders explicit empty states when bootstrap data is empty", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/api/v1/social/bootstrap") {
        return jsonResponse(createBootstrapPayload());
      }

      return undefined;
    });

    renderRouter("/app");
    await waitFor(() => expect(screen.queryByText(/no live tiles yet\./i)).not.toBeInTheDocument());

    renderRouter("/app/chats");
    expect(await screen.findByText(/no private chats yet\./i)).toBeInTheDocument();
    expect(await screen.findByText(/dms and group dms land here\./i)).toBeInTheDocument();

    renderRouter("/app/pulse");
    expect(await screen.findByText(/no feed activity yet\./i)).toBeInTheDocument();
  });

  it("renders the settings route", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      return undefined;
    });

    renderRouter("/app/settings");

    expect(screen.getByRole("button", { name: /toggle keys section/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /toggle relays section/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /toggle admin section/i })).toHaveAttribute("aria-expanded", "false");
    expect((await screen.findAllByText(/synchrono city local/i)).length).toBeGreaterThan(0);
    expect(await screen.findByRole("heading", { name: /1 relay configured/i })).toBeInTheDocument();
    expect(screen.getByText(/connect or switch to the relay operator pubkey to unlock admin controls and review relay health/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /synchrono city local inbox/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /synchrono city local outbox/i })).toBeChecked();
  });

  it("renders relay cards with inbox and outbox flags in settings", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      return undefined;
    }, createBootstrapPayload({
      relay_list: [
        createRelayListEntry({
          name: "Synchrono City Local",
          url: "ws://localhost:8080",
          inbox: true,
          outbox: true
        }),
        createRelayListEntry({
          name: "Mission Mesh",
          url: "wss://mission.example",
          inbox: true,
          outbox: false
        })
      ]
    }));

    renderRouter("/app/settings");

    expect(await screen.findByRole("heading", { name: /2 relays configured/i })).toBeInTheDocument();
    expect(screen.getAllByText("ws://localhost:8080").length).toBeGreaterThan(0);
    expect(screen.getByText("wss://mission.example")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /mission mesh inbox/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /mission mesh outbox/i })).not.toBeChecked();
  });

  it("adds and removes relays from the settings relay list", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      return undefined;
    });

    const { user } = renderRouter("/app/settings");

    expect(await screen.findByRole("heading", { name: /1 relay configured/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/relay name/i), "Mission Mesh");
    await user.type(screen.getByLabelText(/relay url/i), "wss://mission.example/relay");
    await user.click(screen.getByRole("button", { name: /add relay/i }));

    expect(await screen.findByRole("heading", { name: /2 relays configured/i })).toBeInTheDocument();
    expect(screen.getByText("wss://mission.example/relay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove mission mesh/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /remove mission mesh/i }));

    expect(await screen.findByRole("heading", { name: /1 relay configured/i })).toBeInTheDocument();
    expect(screen.queryByText("wss://mission.example/relay")).not.toBeInTheDocument();
  });

  it("loads stored relay list additions on mount", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      return undefined;
    });

    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
        clear: () => {
          storage.clear();
        }
      }
    });

    window.localStorage.setItem(
      "synchrono-city.relay-list-overrides.v1",
      JSON.stringify({
        added: [
          {
            name: "Mission Mesh",
            url: "wss://mission.example/relay",
            inbox: true,
            outbox: true
          }
        ],
        removed: []
      })
    );

    renderRouter("/app/settings");

    expect(await screen.findByRole("heading", { name: /2 relays configured/i })).toBeInTheDocument();
    expect(screen.getByText("wss://mission.example/relay")).toBeInTheDocument();
  });

  it("toggles settings sections independently for the operator session", async () => {
    const operatorBootstrap = createOperatorBootstrap();

    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      return undefined;
    }, operatorBootstrap);

    const { user } = renderRouter("/app/settings");

    const keysToggle = screen.getByRole("button", { name: /toggle keys section/i });
    const relaysToggle = screen.getByRole("button", { name: /toggle relays section/i });
    const adminToggle = screen.getByRole("button", { name: /toggle admin section/i });

    if (adminToggle.getAttribute("aria-expanded") !== "true") {
      await user.click(adminToggle);
    }
    if (adminToggle.getAttribute("aria-expanded") !== "true") {
      await user.click(adminToggle);
    }
    await waitFor(() => expect(adminToggle).toHaveAttribute("aria-expanded", "true"));
    expect(await screen.findByText(/allow relay guests/i)).toBeInTheDocument();
    expect(adminToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(keysToggle);
    expect(keysToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /generate keys/i })).not.toBeInTheDocument();
    expect(relaysToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: /intelligence surface/i })).toBeInTheDocument();

    await user.click(adminToggle);
    expect(adminToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/allow relay guests/i)).not.toBeInTheDocument();

    await user.click(relaysToggle);
    expect(relaysToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("heading", { name: /intelligence surface/i })).not.toBeInTheDocument();
  });

  it("supports generating and importing local keys from the keys section", async () => {
    const importedKeys = importLocalKeyMaterial("1111111111111111111111111111111111111111111111111111111111111111");
    const confirmSpy = vi.spyOn(window, "confirm");
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      return undefined;
    });

    const { user } = renderRouter("/app/settings");

    expect(await screen.findByRole("heading", { name: /1 relay configured/i })).toBeInTheDocument();
    const keysSection = screen.getByRole("button", { name: /toggle keys section/i }).closest("section");
    if (!keysSection) {
      throw new Error("keys section missing");
    }

    expect(
      within(keysSection).getByText(
        /manage browser-local keypairs and profile metadata; the active key controls note authorship and place presence/i
      )
    ).toBeInTheDocument();
    expect(within(keysSection).getByText(/no local keypairs stored in this browser/i)).toBeInTheDocument();
    expect(within(keysSection).queryByRole("button", { name: /remove key/i })).not.toBeInTheDocument();

    await user.click(within(keysSection).getByRole("button", { name: /generate keys/i }));
    const generatedDetailPanel = within(keysSection).getByText(/^Pubkey$/i).closest("article");
    if (!generatedDetailPanel) {
      throw new Error("generated detail panel missing");
    }

    const generatedPubkey = within(within(generatedDetailPanel).getByText(/^Pubkey$/i).closest("tr") as HTMLElement)
      .getByText(/^[0-9a-f]{64}$/i)
      .textContent;
    const generatedNpub = within(generatedDetailPanel).getAllByText(/^npub1/i)[0]?.textContent;
    if (!generatedPubkey) {
      throw new Error("generated pubkey missing");
    }
    if (!generatedNpub) {
      throw new Error("generated npub missing");
    }

    const generatedKeyCard = within(keysSection)
      .getByText(`${generatedPubkey.slice(0, 8)}...${generatedPubkey.slice(-8)}`)
      .closest("article");
    if (!generatedKeyCard) {
      throw new Error("generated key card missing");
    }

    expect(within(generatedKeyCard).getByText(/^active$/i)).toBeInTheDocument();
    expect(within(generatedKeyCard).queryByRole("button", { name: /^active key$/i })).not.toBeInTheDocument();
    expect(within(generatedDetailPanel).queryByText(/^active$/i)).not.toBeInTheDocument();
    expect(within(generatedDetailPanel).getByText(/^active key$/i)).toBeInTheDocument();
    expect(within(generatedDetailPanel).queryByRole("button", { name: /^active key$/i })).not.toBeInTheDocument();
    expect(within(generatedDetailPanel).getByRole("button", { name: /remove key/i })).toBeInTheDocument();
    expect(within(generatedKeyCard).queryAllByText(generatedNpub)).toHaveLength(0);
    expect(within(generatedKeyCard).getByText(`${generatedPubkey.slice(0, 8)}...${generatedPubkey.slice(-8)}`)).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByText(/generated · just now/i)).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByText(/^Pubkey$/i)).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByText(/^Npub$/i)).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByText(/^Secret key$/i)).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByText(/^Nsec$/i)).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByRole("button", { name: /copy pubkey/i })).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByRole("button", { name: /copy npub/i })).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByRole("button", { name: /copy secret key/i })).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByRole("button", { name: /copy nsec/i })).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByLabelText(/^name$/i)).toHaveValue("");
    expect(within(generatedDetailPanel).getByText(/upload an image to blossom/i)).toBeInTheDocument();
    expect(within(generatedDetailPanel).getByLabelText(/^about$/i)).toHaveValue("");
    expect(within(generatedDetailPanel).queryByText(/^nsec1/i)).not.toBeInTheDocument();

    expect(within(keysSection).queryByLabelText(/import private key/i)).not.toBeInTheDocument();
    await user.click(within(keysSection).getByRole("button", { name: /^import keys$/i }));
    expect(within(keysSection).queryByRole("button", { name: /generate keys/i })).not.toBeInTheDocument();
    expect(within(keysSection).queryByText(/import private key/i)).not.toBeInTheDocument();
    const importField = within(keysSection).getByPlaceholderText(/paste nsec1\.\.\. or 64-char hex private key/i);
    await user.type(importField, "abcdef");
    await user.click(within(keysSection).getByRole("button", { name: /cancel/i }));
    expect(within(keysSection).queryByLabelText(/import private key/i)).not.toBeInTheDocument();
    expect(within(keysSection).getByRole("button", { name: /generate keys/i })).toBeInTheDocument();

    await user.click(within(keysSection).getByRole("button", { name: /^import keys$/i }));
    expect(within(keysSection).queryByRole("button", { name: /generate keys/i })).not.toBeInTheDocument();
    expect(within(keysSection).queryByText(/import private key/i)).not.toBeInTheDocument();
    const reopenedImportField = within(keysSection).getByPlaceholderText(/paste nsec1\.\.\. or 64-char hex private key/i);
    expect(reopenedImportField).toHaveValue("");
    await user.clear(reopenedImportField);
    await user.type(reopenedImportField, "1111111111111111111111111111111111111111111111111111111111111111");
    await user.click(within(keysSection).getByRole("button", { name: /import keys/i }));

    const importedKeyCard = within(keysSection)
      .getByText(`${importedKeys.publicKeyHex.slice(0, 8)}...${importedKeys.publicKeyHex.slice(-8)}`)
      .closest("article");
    if (!importedKeyCard) {
      throw new Error("imported key card missing");
    }

    const importedDetailPanel = within(keysSection).getByText(/imported · just now/i).closest("article");
    if (!importedDetailPanel) {
      throw new Error("imported detail panel missing");
    }

    expect(within(importedKeyCard).queryByText(importedKeys.privateKeyHex)).not.toBeInTheDocument();
    expect(within(importedKeyCard).queryByText(importedKeys.privateKeyNsec)).not.toBeInTheDocument();
    expect(within(importedDetailPanel).getByRole("button", { name: /copy nsec/i })).toBeInTheDocument();
    expect(within(importedDetailPanel).getByLabelText(/^name$/i)).toHaveValue("");
    expect(within(importedKeyCard).getByText(/^active$/i)).toBeInTheDocument();
    expect(within(importedKeyCard).queryByRole("button", { name: /^active key$/i })).not.toBeInTheDocument();
    expect(within(importedDetailPanel).queryByText(/^active$/i)).not.toBeInTheDocument();
    expect(within(importedDetailPanel).getByText(/^active key$/i)).toBeInTheDocument();
    expect(within(importedDetailPanel).queryByRole("button", { name: /^active key$/i })).not.toBeInTheDocument();
    expect(within(importedDetailPanel).getByRole("button", { name: /remove key/i })).toBeInTheDocument();
    expect(within(keysSection).queryByLabelText(/import private key/i)).not.toBeInTheDocument();

    await user.click(within(generatedKeyCard).getByRole("button", { name: /^use key$/i }));
    const reselectedGeneratedCard = within(keysSection).getByText(`${generatedPubkey.slice(0, 8)}...${generatedPubkey.slice(-8)}`).closest("article");
    if (!reselectedGeneratedCard) {
      throw new Error("reselected generated key card missing");
    }
    expect(within(reselectedGeneratedCard).getByText(/^active$/i)).toBeInTheDocument();
    expect(within(reselectedGeneratedCard).queryByRole("button", { name: /^active key$/i })).not.toBeInTheDocument();
    expect(within(importedKeyCard).getByRole("button", { name: /^use key$/i })).toBeInTheDocument();

    confirmSpy.mockReturnValueOnce(false);
    await user.click(within(keysSection).getByRole("button", { name: /remove key/i }));
    expect(confirmSpy).toHaveBeenLastCalledWith(
      expect.stringMatching(/remove key .* from this browser\? this deletes the stored private key and cannot be undone\./i)
    );
    expect(within(keysSection).queryByText(/no local keypairs stored in this browser/i)).not.toBeInTheDocument();

    confirmSpy.mockReturnValueOnce(true);
    await user.click(within(keysSection).getByRole("button", { name: /remove key/i }));
    expect(confirmSpy).toHaveBeenLastCalledWith(
      expect.stringMatching(/remove key .* from this browser\? this deletes the stored private key and cannot be undone\./i)
    );

    confirmSpy.mockReturnValueOnce(true);
    await user.click(within(keysSection).getByRole("button", { name: /remove key/i }));
    expect(confirmSpy).toHaveBeenLastCalledWith(
      expect.stringMatching(/remove key .* from this browser\? this deletes the stored private key and cannot be undone\./i)
    );
    expect(await within(keysSection).findByText(/no local keypairs stored in this browser/i)).toBeInTheDocument();
    expect(within(keysSection).queryByRole("button", { name: /remove key/i })).not.toBeInTheDocument();
  }, 30000);

  it("publishes kind 0 metadata for a local keypair with a Blossom-hosted picture", async () => {
    const relaySocketMock = createRelayWebSocketMock();
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = relaySocketMock.WebSocket;

    mockFetchWithBootstrap(async (url, init) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      if (url.pathname === "/upload") {
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toMatch(/^Nostr /);
        return jsonResponse({
          url: "https://blossom.example.test/avatar.png"
        });
      }

      return undefined;
    });

    try {
      const { user } = renderRouter("/app/settings");

      expect(await screen.findByRole("heading", { name: /1 relay configured/i })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /generate keys/i }));

      const publishButton = await screen.findByRole("button", { name: /publish metadata/i });
      const keypairCard = publishButton.closest("article");
      if (!keypairCard) {
        throw new Error("keypair card missing");
      }

      await user.type(within(keypairCard).getByLabelText(/^name$/i), "Signal Weaver");
      await user.type(within(keypairCard).getByLabelText(/about/i), "Coordinates neighborhood logistics.");
      await user.upload(
        within(keypairCard).getByLabelText(/upload picture/i),
        new File(["avatar"], "avatar.png", { type: "image/png" })
      );

      expect(await within(keypairCard).findByText("https://blossom.example.test/avatar.png")).toBeInTheDocument();
      expect(within(keypairCard).getByAltText(/profile picture preview/i)).toHaveAttribute(
        "src",
        "https://blossom.example.test/avatar.png"
      );

      await user.click(publishButton);

      await waitFor(() =>
        expect(relaySocketMock.instances.some((instance) => instance.sentMessages[0]?.startsWith("[\"EVENT\""))).toBe(true)
      );

      const publishInstance = relaySocketMock.instances.find((instance) => instance.sentMessages[0]?.startsWith("[\"EVENT\""));
      expect(publishInstance?.url).toBe("ws://localhost:8080/");

      const sentPayload = publishInstance?.sentMessages[0];
      expect(sentPayload).toBeTruthy();

      const eventMessage = JSON.parse(String(sentPayload)) as [string, NostrSignedEvent];
      expect(eventMessage[0]).toBe("EVENT");
      expect(eventMessage[1].kind).toBe(0);
      expect(JSON.parse(eventMessage[1].content)).toEqual({
        name: "Signal Weaver",
        picture: "https://blossom.example.test/avatar.png",
        about: "Coordinates neighborhood logistics."
      });
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  }, 15000);

  it("loads the latest kind 0 metadata for local device keys on app start", async () => {
    const relaySocketMock = createRelayWebSocketMock();
    const originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = relaySocketMock.WebSocket;
    const localKey = importLocalKeyMaterial(
      "1111111111111111111111111111111111111111111111111111111111111111"
    );

    window.localStorage.setItem(
      "synchrono-city.local-keyring",
      JSON.stringify({
        activePublicKeyNpub: localKey.publicKeyNpub,
        keys: [localKey]
      })
    );

    mockFetchWithBootstrap(async (url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      return undefined;
    });

    try {
      renderRouter("/app/settings");

      await waitFor(() =>
        expect(relaySocketMock.instances.some((instance) => instance.sentMessages[0]?.startsWith("[\"REQ\""))).toBe(true)
      );

      const requestInstance = relaySocketMock.instances.find((instance) => instance.sentMessages[0]?.startsWith("[\"REQ\""));
      expect(requestInstance).toBeTruthy();

      const requestMessage = requestInstance?.sentMessages[0];
      expect(requestMessage).toBeTruthy();

      const requestPayload = JSON.parse(String(requestMessage)) as [string, string, { authors?: string[]; kinds?: number[] }];
      expect(requestPayload[0]).toBe("REQ");
      expect(requestPayload[2].authors).toEqual([localKey.publicKeyHex]);
      expect(requestPayload[2].kinds).toEqual([0]);

      requestInstance?.deliverMessage([
        "EVENT",
        requestPayload[1],
        {
          id: "old-kind-0",
          pubkey: localKey.publicKeyHex,
          created_at: 10,
          kind: 0,
          tags: [],
          content: JSON.stringify({
            name: "Old Handle",
            about: "Superseded metadata."
          }),
          sig: "old-sig"
        }
      ]);
      requestInstance?.deliverMessage([
        "EVENT",
        requestPayload[1],
        {
          id: "latest-kind-0",
          pubkey: localKey.publicKeyHex,
          created_at: 20,
          kind: 0,
          tags: [],
          content: JSON.stringify({
            name: "Signal Weaver",
            picture: "https://blossom.example.test/avatar.png",
            about: "Coordinates neighborhood logistics."
          }),
          sig: "latest-sig"
        }
      ]);
      requestInstance?.deliverMessage(["EOSE", requestPayload[1]]);

      const keypairCard = (await screen.findByLabelText(/^name$/i)).closest("article");
      if (!keypairCard) {
        throw new Error("keypair card missing");
      }

      await waitFor(() => {
        expect(within(keypairCard).getByLabelText(/^name$/i)).toHaveValue("Signal Weaver");
      });
      expect(within(keypairCard).getByAltText(/profile picture preview/i)).toHaveAttribute(
        "src",
        "https://blossom.example.test/avatar.png"
      );
      expect(within(keypairCard).getByText("https://blossom.example.test/avatar.png")).toBeInTheDocument();
      expect(within(keypairCard).getByLabelText(/^about$/i)).toHaveValue("Coordinates neighborhood logistics.");
      expect(within(keypairCard).queryByText("Old Handle")).not.toBeInTheDocument();
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  }, 15000);

  it("connects a nostr signer and runs phase 5 governance workflows", async () => {
    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1operator"),
      signEvent: vi.fn().mockImplementation(async (event) => ({
        ...event,
        id: `signed-${event.created_at}`,
        pubkey: "npub1operator",
        sig: "sig"
      }))
    };

    let nextID = 1;
    const guestEntries: Array<Record<string, unknown>> = [];
    const blockEntries: Array<Record<string, unknown>> = [];
    const standingEntries: Array<Record<string, unknown>> = [];
    const roomEntries: Array<Record<string, unknown>> = [];
    const proofEntries: Array<Record<string, unknown>> = [];
    const gateEntries: Array<Record<string, unknown>> = [];
    const pinEntries: Array<Record<string, unknown>> = [];
    const auditEntries: Array<Record<string, unknown>> = [
      {
        id: 7,
        actor_pubkey: "npub1operator",
        action: "standing.record.created",
        target_pubkey: "npub1seed",
        scope: "relay",
        metadata: { standing: "member" },
        created_at: "2026-03-18T18:31:00Z"
      }
    ];

    const fetchMock = mockFetchWithBootstrap(async (url, init) => {
      const headers = new Headers(init?.headers);

      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-03-18T18:30:00Z"
        });
      }

      expect(headers.get("Authorization")).toMatch(/^Nostr /);

      if (url.pathname === "/api/v1/admin/policy/check") {
        return jsonResponse({
          decision: "allow",
          reason: "bootstrap_operator",
          standing: "owner",
          scope: "relay.admin",
          auth_mode: "nip98"
        });
      }

      if (url.pathname === "/api/v1/admin/policies" && init?.method === "GET") {
        const policyType = url.searchParams.get("policy_type");
        return jsonResponse({
          entries: policyType === "guest" ? guestEntries : blockEntries
        });
      }

      if (url.pathname === "/api/v1/admin/policies" && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          subject_pubkey: string;
          policy_type: string;
          revoked: boolean;
          metadata?: Record<string, string>;
        };
        const record = {
          id: nextID++,
          subject_pubkey: body.subject_pubkey,
          policy_type: body.policy_type,
          scope: "relay",
          granted_by_pubkey: "npub1operator",
          revoked: body.revoked,
          metadata: body.metadata,
          created_at: "2026-03-18T18:31:00Z"
        };
        if (body.policy_type === "guest") {
          guestEntries.unshift(record);
        } else {
          blockEntries.unshift(record);
        }
        auditEntries.unshift({
          id: nextID++,
          actor_pubkey: "npub1operator",
          action: "policy.assignment.created",
          target_pubkey: body.subject_pubkey,
          scope: "relay",
          metadata: { policy_type: body.policy_type },
          created_at: "2026-03-18T18:31:00Z"
        });
        return jsonResponse(record, 201);
      }

      if (url.pathname === "/api/v1/admin/standing" && init?.method === "GET") {
        return jsonResponse({ entries: standingEntries });
      }

      if (url.pathname === "/api/v1/admin/standing" && init?.method === "POST") {
        const body = String(init?.body ?? "");
        const record = {
          id: nextID++,
          subject_pubkey: body.includes('"subject_pubkey":"npub1member"') ? "npub1member" : "npub1unknown",
          standing: "member",
          scope: "relay",
          granted_by_pubkey: "npub1operator",
          revoked: body.includes('"revoked":true'),
          created_at: "2026-03-18T18:31:00Z"
        };
        standingEntries.unshift(record);
        auditEntries.unshift({
          id: nextID++,
          actor_pubkey: "npub1operator",
          action: "standing.record.created",
          target_pubkey: record.subject_pubkey,
          scope: "relay",
          metadata: { standing: "member" },
          created_at: "2026-03-18T18:31:00Z"
        });
        return jsonResponse(record, 201);
      }

      if (url.pathname === "/api/v1/admin/room-permissions" && init?.method === "GET") {
        return jsonResponse({
          entries: roomEntries
        });
      }

      if (url.pathname === "/api/v1/admin/room-permissions" && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          subject_pubkey: string;
          room_id: string;
          can_join: boolean;
          can_publish: boolean;
          can_subscribe: boolean;
          revoked: boolean;
        };
        const record = {
          id: nextID++,
          subject_pubkey: body.subject_pubkey,
          room_id: body.room_id,
          can_join: body.can_join,
          can_publish: body.can_publish,
          can_subscribe: body.can_subscribe,
          granted_by_pubkey: "npub1operator",
          revoked: body.revoked,
          created_at: "2026-03-18T18:31:00Z"
        };
        roomEntries.unshift(record);
        auditEntries.unshift({
          id: nextID++,
          actor_pubkey: "npub1operator",
          action: "room.permission.created",
          target_pubkey: body.subject_pubkey,
          scope: body.room_id,
          metadata: { can_join: String(body.can_join) },
          created_at: "2026-03-18T18:31:00Z"
        });
        return jsonResponse(record, 201);
      }

      if (url.pathname === "/api/v1/admin/proofs" && init?.method === "GET") {
        return jsonResponse({ entries: proofEntries });
      }

      if (url.pathname === "/api/v1/admin/proofs" && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          subject_pubkey: string;
          proof_type: string;
          proof_value: string;
          revoked: boolean;
        };
        const record = {
          id: nextID++,
          subject_pubkey: body.subject_pubkey,
          proof_type: body.proof_type,
          proof_value: body.proof_value,
          granted_by_pubkey: "npub1operator",
          revoked: body.revoked,
          created_at: "2026-03-18T18:31:00Z"
        };
        proofEntries.unshift(record);
        auditEntries.unshift({
          id: nextID++,
          actor_pubkey: "npub1operator",
          action: "proof.verification.created",
          target_pubkey: body.subject_pubkey,
          scope: body.proof_type,
          metadata: { proof_type: body.proof_type },
          created_at: "2026-03-18T18:31:00Z"
        });
        return jsonResponse(record, 201);
      }

      if (url.pathname === "/api/v1/admin/gates" && init?.method === "GET") {
        return jsonResponse({ entries: gateEntries });
      }

      if (url.pathname === "/api/v1/admin/gates" && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          capability: string;
          scope: string;
          require_guest: boolean;
          proof_types: string[];
          revoked: boolean;
        };
        const record = {
          id: nextID++,
          capability: body.capability,
          scope: body.scope,
          require_guest: body.require_guest,
          proof_types: body.proof_types,
          granted_by_pubkey: "npub1operator",
          revoked: body.revoked,
          created_at: "2026-03-18T18:31:00Z"
        };
        gateEntries.unshift(record);
        auditEntries.unshift({
          id: nextID++,
          actor_pubkey: "npub1operator",
          action: "gate.policy.created",
          target_pubkey: "",
          scope: body.capability,
          metadata: { proof_types: body.proof_types.join(",") },
          created_at: "2026-03-18T18:31:00Z"
        });
        return jsonResponse(record, 201);
      }

      if (url.pathname === "/api/v1/admin/editorial/pins" && init?.method === "GET") {
        return jsonResponse({ entries: pinEntries });
      }

      if (url.pathname === "/api/v1/admin/editorial/pins" && init?.method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          geohash: string;
          note_id: string;
          label: string;
          revoked: boolean;
        };
        const record = {
          id: nextID++,
          geohash: body.geohash,
          note_id: body.note_id,
          label: body.label,
          granted_by_pubkey: "npub1operator",
          revoked: body.revoked,
          created_at: "2026-03-18T18:31:00Z"
        };
        pinEntries.unshift(record);
        auditEntries.unshift({
          id: nextID++,
          actor_pubkey: "npub1operator",
          action: "editorial.pin.created",
          target_pubkey: "",
          scope: body.geohash,
          metadata: { note_id: body.note_id },
          created_at: "2026-03-18T18:31:00Z"
        });
        return jsonResponse(record, 201);
      }

      if (url.pathname === "/api/v1/admin/audit") {
        return jsonResponse({
          entries: auditEntries,
          next_cursor: ""
        });
      }

      return undefined;
    });

    const { user } = renderRouter("/app/settings");

    expect((await screen.findAllByText(/synchrono city local/i)).length).toBeGreaterThan(0);
    const governanceToggle = screen.getByRole("button", { name: /toggle admin section/i });
    if (governanceToggle.getAttribute("aria-expanded") !== "true") {
      await user.click(governanceToggle);
    }
    await user.click(screen.getByRole("button", { name: /connect signer/i }));

    expect(await screen.findByText(/browser signer verified/i)).toBeInTheDocument();
    expect(await screen.findByText(/admin signer verified for npub1operator\./i)).toBeInTheDocument();
    expect(await screen.findByText(/no guest policy assignments yet\./i)).toBeInTheDocument();

    const guestCard = screen.getByRole("heading", { name: /allow relay guests/i }).closest("article");
    if (!guestCard) {
      throw new Error("guest card missing");
    }
    await user.type(within(guestCard).getByLabelText(/subject pubkey/i), "npub1guest");
    await user.click(within(guestCard).getByRole("button", { name: /add guest/i }));
    expect((await screen.findAllByText(/npub1guest/i)).length).toBeGreaterThan(0);

    const blockCard = screen.getByRole("heading", { name: /block relay access/i }).closest("article");
    if (!blockCard) {
      throw new Error("block card missing");
    }
    await user.type(within(blockCard).getByLabelText(/subject pubkey/i), "npub1blocked");
    await user.type(within(blockCard).getByLabelText(/reason/i), "spam");
    await user.click(within(blockCard).getByRole("button", { name: /block pubkey/i }));
    expect(await screen.findByText(/block saved for npub1blocked\./i)).toBeInTheDocument();

    const standingCard = screen.getByRole("heading", { name: /assign local role/i }).closest("form");
    if (!standingCard) {
      throw new Error("standing card missing");
    }
    await user.type(within(standingCard).getByLabelText(/subject pubkey/i), "npub1member");
    await user.click(within(standingCard).getByRole("button", { name: /save standing/i }));
    expect(await screen.findByText(/standing member saved for npub1member\./i)).toBeInTheDocument();

    const roomCard = screen.getByRole("heading", { name: /grant room access/i }).closest("form");
    if (!roomCard) {
      throw new Error("room card missing");
    }
    await user.type(within(roomCard).getByLabelText(/subject pubkey/i), "npub1room");
    await user.type(within(roomCard).getAllByLabelText(/room id/i)[0], "geo:npub1operator:9q8yyk");
    await user.click(within(roomCard).getByRole("button", { name: /save room permission/i }));
    expect(await screen.findByText(/room permission saved for npub1room on geo:npub1operator:9q8yyk\./i)).toBeInTheDocument();

    const proofCard = screen.getByRole("heading", { name: /verify oauth and social proofs/i }).closest("article");
    if (!proofCard) {
      throw new Error("proof card missing");
    }
    await user.type(within(proofCard).getByLabelText(/subject pubkey/i), "npub1proof");
    await user.type(within(proofCard).getByLabelText(/proof value/i), "github:proof");
    await user.click(within(proofCard).getByRole("button", { name: /verify proof/i }));
    expect(await screen.findByText(/proof oauth verified for npub1proof\./i)).toBeInTheDocument();

    const gateCard = screen.getByRole("heading", { name: /require proofs before publish/i }).closest("article");
    if (!gateCard) {
      throw new Error("gate card missing");
    }
    await user.click(within(gateCard).getByLabelText(/require guest allowlist/i));
    await user.click(within(gateCard).getByLabelText(/require oauth proof/i));
    await user.click(within(gateCard).getByRole("button", { name: /save gate policy/i }));
    expect(await screen.findByText(/gate policy saved for relay\.publish\./i)).toBeInTheDocument();

    const pinCard = screen.getByRole("heading", { name: /pin relay notes into pulse/i }).closest("article");
    if (!pinCard) {
      throw new Error("pin card missing");
    }
    await user.type(within(pinCard).getByLabelText(/^geohash$/i), "9q8yyk");
    await user.type(within(pinCard).getByLabelText(/note id/i), "note-plaza-pinned");
    await user.click(within(pinCard).getByRole("button", { name: /^pin note$/i }));
    expect(await screen.findByText(/editorial pin saved for 9q8yyk -> note-plaza-pinned\./i)).toBeInTheDocument();

    expect((await screen.findAllByText(/standing\.record\.created/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/npub1guest/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/npub1blocked/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/npub1room/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/npub1proof/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/note-plaza-pinned/i)).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalled();
  }, 15000);

  it("shows error when admin auth is denied (403)", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({ status: "ok", relay_name: "Test", relay_url: "ws://test", operator_pubkey: "npub1op", timestamp: "2026-03-20T00:00:00Z" });
      }
      if (url.pathname === "/api/v1/admin/policy/check") {
        return new Response(JSON.stringify({ message: "Insufficient standing" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      return undefined;
    });

    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1unauthorized"),
      signEvent: vi.fn().mockImplementation(async (event) => ({ ...event, id: "sig", pubkey: "npub1unauthorized", sig: "sig" }))
    };

    renderRouter("/app/settings");
    await screen.findByRole("heading", { name: /1 relay configured/i });

    const deniedAdminToggle = screen.getByRole("button", { name: /toggle admin section/i });
    if (deniedAdminToggle.getAttribute("aria-expanded") !== "true") {
      await userEvent.click(deniedAdminToggle);
    }
    await userEvent.click(screen.getByRole("button", { name: /connect signer/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/insufficient standing|request failed with status 403/i);
  });

  it("shows error when pubkey validation fails", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({ status: "ok", relay_name: "Test", relay_url: "ws://test", operator_pubkey: "npub1op", timestamp: "2026-03-20T00:00:00Z" });
      }
      if (url.pathname === "/api/v1/admin/policy/check") {
        return jsonResponse({ decision: "allow", reason: "bootstrap_operator", standing: "owner", scope: "relay.admin", auth_mode: "nip98" });
      }
      if (url.pathname === "/api/v1/admin/policies" && url.searchParams.get("policy_type") === "guest") {
        return jsonResponse({ entries: [] });
      }
      return undefined;
    });

    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1operator"),
      signEvent: vi.fn().mockImplementation(async (event) => ({ ...event, id: "sig", pubkey: "npub1operator", sig: "sig" }))
    };

    const { user } = renderRouter("/app/settings");
    await screen.findByRole("heading", { name: /1 relay configured/i });
    const validationAdminToggle = screen.getByRole("button", { name: /toggle admin section/i });
    if (validationAdminToggle.getAttribute("aria-expanded") !== "true") {
      await user.click(validationAdminToggle);
    }
    await user.click(screen.getByRole("button", { name: /connect signer/i }));
    await screen.findByText(/browser signer verified/i);

    const guestCard = screen.getByRole("heading", { name: /allow relay guests/i }).closest("article");
    if (!guestCard) throw new Error("guest card missing");

    // Enter invalid pubkey (too short)
    await user.type(within(guestCard).getByLabelText(/subject pubkey/i), "invalid-key");
    await user.click(within(guestCard).getByRole("button", { name: /add guest/i }));

    expect(await screen.findByText(/pubkey must be a valid npub or 64-char hex key/i)).toBeInTheDocument();
  });

  it("shows error on network failure", async () => {
    mockFetchWithBootstrap((url) => {
      if (url.pathname === "/healthz") {
        return jsonResponse({ status: "ok", relay_name: "Test Relay", relay_url: "ws://test", operator_pubkey: "npub1op", timestamp: "2026-03-20T00:00:00Z" });
      }
      if (url.pathname !== "/api/v1/social/bootstrap") {
        throw new Error("Network error");
      }
      return undefined;
    });

    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1operator"),
      signEvent: vi.fn().mockImplementation(async (event) => ({ ...event, id: "sig", pubkey: "npub1operator", sig: "sig" }))
    };

    renderRouter("/app/settings");
    await screen.findByRole("heading", { name: /1 relay configured/i });

    const failureAdminToggle = screen.getByRole("button", { name: /toggle admin section/i });
    if (failureAdminToggle.getAttribute("aria-expanded") !== "true") {
      await userEvent.click(failureAdminToggle);
    }
    await userEvent.click(screen.getByRole("button", { name: /connect signer/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/network error/i);
  });
});
