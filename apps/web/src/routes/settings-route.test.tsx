import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const relayDiagnosticsMocks = vi.hoisted(() => ({
  describeRelayConnectionIssue: vi.fn()
}));

vi.mock("../relay-url-diagnostics", () => ({
  describeRelayConnectionIssue: relayDiagnosticsMocks.describeRelayConnectionIssue
}));

import { AppearanceProvider } from "../appearance";
import { AppStateProvider } from "../app-state";
import { importLocalKeyMaterial, storeLocalKeyring } from "../key-manager";
import type { BootstrapPayload } from "../social-payload";
import { ToastProvider } from "../toast";
import { SettingsRoute } from "./settings-route";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

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
  places: [],
  profiles: [],
  notes: [],
  cross_relay_items: []
};

function renderSettingsRoute(initialEntry: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppearanceProvider>
          <ToastProvider>
            <AppStateProvider>
              <SettingsRoute />
            </AppStateProvider>
          </ToastProvider>
        </AppearanceProvider>
      </MemoryRouter>
    </StrictMode>
  );
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1280
  });
  relayDiagnosticsMocks.describeRelayConnectionIssue.mockReset();
  relayDiagnosticsMocks.describeRelayConnectionIssue.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SettingsRoute OAuth key status", () => {
  it("hides the oauth key verification panel for now", async () => {
    const originalLocalStorage = window.localStorage;
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
        }
      }
    });

    const localKey = importLocalKeyMaterial("1111111111111111111111111111111111111111111111111111111111111111");
    let oauthStatusCalls = 0;
    let oauthStartCalls = 0;

    try {
      storeLocalKeyring({
        activePublicKeyNpub: localKey.publicKeyNpub,
        keys: [localKey]
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = new URL(String(input), window.location.origin);

        if (url.pathname === "/api/v1/social/bootstrap") {
          return jsonResponse(bootstrapPayload);
        }

        if (url.pathname === "/healthz") {
          return jsonResponse({
            status: "ok",
            relay_name: "Synchrono City Local",
            relay_url: "ws://localhost:8080",
            operator_pubkey: "npub1operator",
            timestamp: "2026-04-01T12:00:00Z"
          });
        }

        if (url.pathname === "/api/v1/me/proofs") {
          oauthStatusCalls += 1;
          return jsonResponse({
            entries: [
              {
                subject_pubkey: localKey.publicKeyHex,
                proof_type: "oauth",
                proof_value: "https://issuer.example#user-123",
                granted_by_pubkey: localKey.publicKeyHex,
                revoked: false,
                metadata: {
                  subject: "user-123",
                  issuer: "https://issuer.example"
                },
                created_at: "2026-04-01T11:50:00Z"
              }
            ]
          });
        }

        if (url.pathname === "/api/v1/oauth/start") {
          oauthStartCalls += 1;
          return jsonResponse({
            authorization_url: "https://issuer.example/authorize?state=test-state",
            proof_type: "oauth",
            subject_pubkey: localKey.publicKeyHex
          });
        }

        throw new Error(`Unexpected fetch URL: ${url.toString()}`);
      });

      renderSettingsRoute(`/app/settings?key=${encodeURIComponent(localKey.publicKeyNpub)}`);

      expect(await screen.findByText(/local key active/i)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /oauth status for call access/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/pubkey is your primary nostr identity/i)).not.toBeInTheDocument();
      expect(oauthStatusCalls).toBe(0);
      expect(oauthStartCalls).toBe(0);
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalLocalStorage
      });
    }
  });
});

describe("SettingsRoute relay health", () => {
  it("shows the relay URL warning when diagnostics flag the configured relay", async () => {
    relayDiagnosticsMocks.describeRelayConnectionIssue.mockReturnValue(
      "Relay URL ws://localhost:8080 points to localhost. Browsers on app.example.test cannot reach it. Set PRIMARY_RELAY_URL to a reachable relay host."
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);

      if (url.pathname === "/api/v1/social/bootstrap") {
        return jsonResponse(bootstrapPayload);
      }

      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-04-01T12:00:00Z"
        });
      }

      if (url.pathname === "/api/v1/me/proofs") {
        return jsonResponse({ entries: [] });
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`);
    });

    renderSettingsRoute("/app/settings");

    const adminLockedHeading = await screen.findByRole("heading", { name: /operator pubkey required/i });
    const adminLockedCard = adminLockedHeading.closest("article");
    if (!adminLockedCard) {
      throw new Error("admin locked card missing");
    }

    await waitFor(() => {
      expect(
        within(adminLockedCard).getByText(
          /relay url ws:\/\/localhost:8080 points to localhost\. browsers on app\.example\.test cannot reach it\./i
        )
      ).toBeInTheDocument();
    });

    expect(relayDiagnosticsMocks.describeRelayConnectionIssue).toHaveBeenCalledWith(
      "ws://localhost:8080",
      expect.any(String)
    );
  });
});

describe("SettingsRoute relay removal dialog", () => {
  it("renders the remove relay dialog outside the scrollable settings surface", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input), window.location.origin);

      if (url.pathname === "/api/v1/social/bootstrap") {
        return jsonResponse(bootstrapPayload);
      }

      if (url.pathname === "/healthz") {
        return jsonResponse({
          status: "ok",
          relay_name: "Synchrono City Local",
          relay_url: "ws://localhost:8080",
          operator_pubkey: "npub1operator",
          timestamp: "2026-04-01T12:00:00Z"
        });
      }

      if (url.pathname === "/api/v1/me/proofs") {
        return jsonResponse({ entries: [] });
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`);
    });

    const user = userEvent.setup();
    const { container } = renderSettingsRoute("/app/settings");

    expect(await screen.findByLabelText(/relay name/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/relay name/i), "Mission Mesh");
    await user.type(screen.getByLabelText(/relay url/i), "wss://mission.example/relay");
    await user.click(screen.getByRole("button", { name: /add relay/i }));
    await user.click(screen.getByRole("button", { name: /remove mission mesh/i }));

    const removeDialog = await screen.findByRole("dialog", { name: /remove relay\?/i });
    const settingsSurface = container.querySelector(".route-surface-settings");
    if (!settingsSurface) {
      throw new Error("settings surface not rendered");
    }

    expect(document.body).toContainElement(removeDialog);
    expect(settingsSurface).not.toContainElement(removeDialog);
  });
});
