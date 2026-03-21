import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { ToastProvider } from "./toast";
import { WorldRoute } from "./routes/world-route";

function renderRouter(entry: string) {
  const user = userEvent.setup();
  render(
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
  return { user };
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

afterEach(() => {
  vi.restoreAllMocks();
  primeLiveKitMock();
  delete window.nostr;
});

primeLiveKitMock();

describe("app shell", () => {
  it("renders the splash route", () => {
    renderRouter("/");

    expect(screen.getByRole("button", { name: /enter the city/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /host your own/i })).toBeInTheDocument();
  });

  it("renders the world route with place metadata", () => {
    renderRouter("/app");

    expect(screen.getByText(/map-native coordination for sovereign communities/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /presence lives on the map/i })).toBeInTheDocument();
    expect(screen.getByText(/tap a marker to set your place presence and join that tile immediately/i)).toBeInTheDocument();
  });

  it("selects a marker, joins a geohash-scoped room, and shows the global call overlay", async () => {
    const { user } = renderRouter("/app");

    await user.click(screen.getByRole("button", { name: /civic plaza 9q8yyk has 3 notes and 3 live participants/i }));

    expect(await screen.findByLabelText(/selected place civic plaza/i)).toBeInTheDocument();
    expect((await screen.findAllByText(/geo:npub1operator:9q8yyk/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /leave room/i })).toBeInTheDocument();
  });

  it("upgrades a joined room with a LiveKit token and uploads place media to Blossom", async () => {
    let uploadCalled = false;

    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1operator"),
      signEvent: vi.fn().mockImplementation(async (event) => ({
        ...event,
        id: `signed-${event.created_at}`,
        pubkey: "npub1operator",
        sig: "sig"
      }))
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input));
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

      if (url.pathname === "/upload") {
        uploadCalled = true;
        expect(headers.get("Authorization")).toMatch(/^Nostr /);
        return jsonResponse({
          url: "http://localhost:3001/blossom-room-photo.png"
        });
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`);
    });

    const { user } = renderRouter("/app");

    await user.click(screen.getByRole("button", { name: /civic plaza 9q8yyk has 3 notes and 3 live participants/i }));
    expect(await screen.findByText(/livekit ready/i)).toBeInTheDocument();
    expect(await screen.findByText(/ws:\/\/livekit\.example\.test/i)).toBeInTheDocument();
    expect(liveKitMocks.connectLiveKitSessionMock).toHaveBeenCalledTimes(1);
    expect(liveKitMocks.session.setMicrophoneEnabled).toHaveBeenCalledWith(true);

    const mediaInput = screen.getByLabelText(/select media/i) as HTMLInputElement;
    const file = new File(["photo"], "room-photo.png", { type: "image/png" });
    fireEvent.change(mediaInput, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /upload to blossom/i })).toBeEnabled()
    );
    await user.click(screen.getByRole("button", { name: /upload to blossom/i }));

    await waitFor(() => expect(uploadCalled).toBe(true));
    expect(await screen.findByText(/latest upload: room-photo\.png/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /toggle cam/i }));
    expect(liveKitMocks.session.setCameraEnabled).toHaveBeenCalledWith(true);
  });

  it("publishes a place note from chats and exposes it in pulse", async () => {
    const { user } = renderRouter("/app/chats?geohash=9q8yyk");

    await user.type(screen.getByPlaceholderText(/add a place note for everyone in this tile/i), "Meet at the fountain in five.");
    await user.click(screen.getByRole("button", { name: /publish note/i }));

    expect(await screen.findByText(/meet at the fountain in five\./i)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /open in pulse/i })[0]);

    expect(await screen.findByRole("heading", { name: /relay feed projection/i })).toBeInTheDocument();
    expect((await screen.findAllByText(/meet at the fountain in five\./i)).length).toBeGreaterThan(0);
  });

  it("opens a participant profile in pulse", async () => {
    const { user } = renderRouter("/app/chats?geohash=9q8yym");

    await user.click(screen.getByRole("button", { name: /view profile/i }));

    expect(await screen.findByRole("heading", { name: /relay feed projection/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /mika hart/i })).toBeInTheDocument();
  });

  it("renders phase 5 synthesis and editorial sections in pulse", () => {
    renderRouter("/app/pulse");

    expect(screen.getByRole("heading", { name: /ai synthesis/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /operator pins/i })).toBeInTheDocument();
    expect(screen.getByText(/tenant organizing thread with a pinned logistics note and a live room\./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cite aurora vale/i })).toBeInTheDocument();
  });

  it("renders the settings route", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        status: "ok",
        relay_name: "Synchrono City Local",
        relay_url: "ws://localhost:8080",
        operator_pubkey: "npub1operator",
        timestamp: "2026-03-18T18:30:00Z"
      })
    );

    renderRouter("/app/settings");

    expect(screen.getByRole("heading", { name: /relay governance/i })).toBeInTheDocument();
    expect(await screen.findByText(/synchrono city local/i)).toBeInTheDocument();
    expect(await screen.findByText(/relay healthy/i)).toBeInTheDocument();
    expect(screen.getByText(/roles and standing management/i)).toBeInTheDocument();
  });

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

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input));
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

      throw new Error(`Unexpected fetch URL: ${url.toString()}`);
    });

    const { user } = renderRouter("/app/settings");

    await screen.findByText(/synchrono city local/i);
    await user.click(screen.getByRole("button", { name: /connect signer/i }));

    expect(await screen.findByText(/admin verified/i)).toBeInTheDocument();
    expect(await screen.findByText(/admin signer verified for npub1operator\./i)).toBeInTheDocument();
    expect(await screen.findByText(/no guest policy assignments yet\./i)).toBeInTheDocument();

    const guestCard = screen.getByRole("heading", { name: /allow relay guests/i }).closest("article");
    if (!guestCard) {
      throw new Error("guest card missing");
    }
    await user.type(within(guestCard).getByLabelText(/subject pubkey/i), "npub1guest");
    await user.click(within(guestCard).getByRole("button", { name: /add guest/i }));
    expect(await screen.findByText(/guest allow saved for npub1guest\./i)).toBeInTheDocument();

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
  });

  it("shows error when admin auth is denied (403)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/healthz") {
        return jsonResponse({ status: "ok", relay_name: "Test", relay_url: "ws://test", operator_pubkey: "npub1op", timestamp: "2026-03-20T00:00:00Z" });
      }
      if (url.pathname === "/api/v1/admin/policy/check") {
        return new Response(JSON.stringify({ message: "Insufficient standing" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1unauthorized"),
      signEvent: vi.fn().mockImplementation(async (event) => ({ ...event, id: "sig", pubkey: "npub1unauthorized", sig: "sig" }))
    };

    renderRouter("/app/settings");
    await screen.findByText(/relay healthy/i);

    await userEvent.click(screen.getByRole("button", { name: /connect signer/i }));

    expect(await screen.findByText(/insufficient standing/i)).toBeInTheDocument();
  });

  it("shows error when pubkey validation fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/healthz") {
        return jsonResponse({ status: "ok", relay_name: "Test", relay_url: "ws://test", operator_pubkey: "npub1op", timestamp: "2026-03-20T00:00:00Z" });
      }
      if (url.pathname === "/api/v1/admin/policy/check") {
        return jsonResponse({ decision: "allow", reason: "bootstrap_operator", standing: "owner", scope: "relay.admin", auth_mode: "nip98" });
      }
      if (url.pathname === "/api/v1/admin/policies" && url.searchParams.get("policy_type") === "guest") {
        return jsonResponse({ entries: [] });
      }
      throw new Error(`Unexpected URL: ${url.pathname}`);
    });

    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1operator"),
      signEvent: vi.fn().mockImplementation(async (event) => ({ ...event, id: "sig", pubkey: "npub1operator", sig: "sig" }))
    };

    const { user } = renderRouter("/app/settings");
    await screen.findByText(/relay healthy/i);
    await user.click(screen.getByRole("button", { name: /connect signer/i }));
    await screen.findByText(/admin verified/i);

    const guestCard = screen.getByRole("heading", { name: /allow relay guests/i }).closest("article");
    if (!guestCard) throw new Error("guest card missing");

    // Enter invalid pubkey (too short)
    await user.type(within(guestCard).getByLabelText(/subject pubkey/i), "invalid-key");
    await user.click(within(guestCard).getByRole("button", { name: /add guest/i }));

    expect(await screen.findByText(/pubkey must be a valid npub or 64-char hex key/i)).toBeInTheDocument();
  });

  it("shows error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/healthz") {
        return jsonResponse({ status: "ok", relay_name: "Test Relay", relay_url: "ws://test", operator_pubkey: "npub1op", timestamp: "2026-03-20T00:00:00Z" });
      }
      throw new Error("Network error");
    });

    window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("npub1operator"),
      signEvent: vi.fn().mockImplementation(async (event) => ({ ...event, id: "sig", pubkey: "npub1operator", sig: "sig" }))
    };

    renderRouter("/app/settings");
    await screen.findByText(/relay healthy/i);

    await userEvent.click(screen.getByRole("button", { name: /connect signer/i }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
