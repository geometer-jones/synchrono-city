import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./routes/app-shell";
import { ChatsRoute } from "./routes/chats-route";
import { PulseRoute } from "./routes/pulse-route";
import { SettingsRoute } from "./routes/settings-route";
import { SplashRoute } from "./routes/splash-route";
import { WorldRoute } from "./routes/world-route";

function renderRouter(entry: string) {
  const user = userEvent.setup();
  render(
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
  );
  return { user };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.nostr;
});

describe("app shell", () => {
  it("renders the splash route", () => {
    renderRouter("/");

    expect(screen.getByRole("button", { name: /enter the city/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /host your own/i })).toBeInTheDocument();
  });

  it("renders the world route with place metadata", () => {
    renderRouter("/app");

    expect(
      screen.getByRole("heading", { name: /map-native coordination for sovereign communities/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /world places/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /civic plaza · 9q8yyk/i })).toBeInTheDocument();
  });

  it("joins a geohash-scoped room from world and shows the global call overlay", async () => {
    const { user } = renderRouter("/app");

    await user.click(screen.getAllByRole("button", { name: /join room/i })[0]);

    expect((await screen.findAllByText(/geo:npub1operator:9q8yyk/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /leave room/i })).toBeInTheDocument();
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

  it("connects a nostr signer and runs phase 3 governance workflows", async () => {
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

    expect((await screen.findAllByText(/standing\.record\.created/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/npub1guest/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/npub1blocked/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/npub1room/i)).length).toBeGreaterThan(0);
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
