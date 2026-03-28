import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

import { AppStateProvider, useAppState } from "./app-state";
import type { BootstrapPayload } from "./social-payload";
import { ToastProvider } from "./toast";

const bootstrapPayload: BootstrapPayload = {
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
  places: [
    {
      geohash: "9q8yyk",
      title: "Civic plaza",
      neighborhood: "Market steps",
      description: "",
      activitySummary: "",
      tags: [],
      capacity: 8,
      occupantPubkeys: ["npub1aurora"],
      unread: false
    }
  ],
  profiles: [
    {
      pubkey: "npub1scout",
      displayName: "Field Scout",
      name: "Field Scout",
      role: "Local member",
      status: "",
      bio: "",
      mic: true,
      cam: false,
      screenshare: false,
      deafen: false
    }
  ],
  notes: [],
  feed_segments: [],
  cross_relay_items: []
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
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
      }
    ]);
    options.onMediaStreamsChanged([]);
    return liveKitMocks.session;
  });
}

function Harness() {
  const { activeCall, getPlace, joinPlaceCall, toggleCallControl } = useAppState();
  const ready = Boolean(getPlace("9q8yyk"));

  return (
    <div>
      <p>{ready ? "ready" : "loading"}</p>
      <p>{activeCall?.transport ?? "idle"}</p>
      <p>{activeCall?.statusMessage ?? "no-status"}</p>
      <button type="button" onClick={() => joinPlaceCall("9q8yyk")} disabled={!ready}>
        Join room
      </button>
      <button type="button" onClick={() => toggleCallControl("screenshare")} disabled={activeCall?.transport !== "livekit"}>
        Share screen
      </button>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  primeLiveKitMock();
  delete window.nostr;
});

primeLiveKitMock();

describe("AppStateProvider", () => {
  it("invokes the screen share setter once per click in strict mode", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);

      if (url.pathname === "/api/v1/social/bootstrap") {
        return jsonResponse(bootstrapPayload);
      }

      if (url.pathname === "/api/v1/token") {
        const body = JSON.parse(String(init?.body)) as { room_id: string };
        expect(body.room_id).toBe("beacon:9q8yyk");

        return jsonResponse({
          decision: "allow",
          reason: "room_permission",
          token: {
            token: "jwt-token",
            identity: "npub1scout",
            room_id: "beacon:9q8yyk",
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

      throw new Error(`Unexpected fetch URL: ${url.toString()}`);
    });

    window.nostr = {
      getPublicKey: vi.fn(async () => "npub1scout"),
      signEvent: vi.fn(async (event) => ({ ...event, id: "sig", pubkey: "npub1scout", sig: "sig" }))
    };

    const user = userEvent.setup();

    render(
      <StrictMode>
        <ToastProvider>
          <AppStateProvider>
            <Harness />
          </AppStateProvider>
        </ToastProvider>
      </StrictMode>
    );

    await screen.findByText("ready");

    await user.click(screen.getByRole("button", { name: /join room/i }));

    await waitFor(() => expect(screen.getByText("livekit")).toBeInTheDocument());
    liveKitMocks.session.setScreenShareEnabled.mockClear();

    await user.click(screen.getByRole("button", { name: /share screen/i }));

    await waitFor(() => {
      expect(liveKitMocks.session.setScreenShareEnabled).toHaveBeenCalledTimes(1);
    });
    expect(liveKitMocks.session.setScreenShareEnabled).toHaveBeenCalledWith(true);
  });

  it("unlocks publish controls after a live permission promotion without requiring rejoin", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(String(input), window.location.origin);

      if (url.pathname === "/api/v1/social/bootstrap") {
        return jsonResponse(bootstrapPayload);
      }

      if (url.pathname === "/api/v1/token") {
        const body = JSON.parse(String(init?.body)) as { room_id: string };
        expect(body.room_id).toBe("beacon:9q8yyk");

        return jsonResponse({
          decision: "allow",
          reason: "room_default_listener",
          token: {
            token: "jwt-token",
            identity: "npub1scout",
            room_id: "beacon:9q8yyk",
            livekit_url: "ws://livekit.example.test",
            expires_at: "2026-03-20T12:10:00Z",
            grants: {
              room_join: true,
              can_publish: false,
              can_subscribe: true
            }
          }
        });
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`);
    });

    window.nostr = {
      getPublicKey: vi.fn(async () => "npub1scout"),
      signEvent: vi.fn(async (event) => ({ ...event, id: "sig", pubkey: "npub1scout", sig: "sig" }))
    };

    const user = userEvent.setup();

    render(
      <StrictMode>
        <ToastProvider>
          <AppStateProvider>
            <Harness />
          </AppStateProvider>
        </ToastProvider>
      </StrictMode>
    );

    await screen.findByText("ready");
    await user.click(screen.getByRole("button", { name: /join room/i }));

    await waitFor(() => expect(screen.getByText("livekit")).toBeInTheDocument());
    expect(screen.getByText(/connected in listen-only mode/i)).toBeInTheDocument();

    liveKitMocks.session.setScreenShareEnabled.mockClear();
    await user.click(screen.getByRole("button", { name: /share screen/i }));
    expect(liveKitMocks.session.setScreenShareEnabled).not.toHaveBeenCalled();

    const connectOptions = liveKitMocks.connectLiveKitSessionMock.mock.calls[0]?.[0];
    expect(connectOptions).toBeDefined();

    await act(async () => {
      connectOptions.onPermissionsChanged({ canPublish: true, canSubscribe: true });
    });

    expect(screen.getByText(/live publish controls enabled/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /share screen/i }));

    await waitFor(() => {
      expect(liveKitMocks.session.setScreenShareEnabled).toHaveBeenCalledTimes(1);
    });
    expect(liveKitMocks.session.setScreenShareEnabled).toHaveBeenCalledWith(true);
  });
});
