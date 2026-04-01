import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CallSession } from "../data";

const leaveBeaconCall = vi.fn();
const toggleCallControl = vi.fn();
const attachCameraTrack = vi.fn((element: HTMLMediaElement) => element);
const detachCameraTrack = vi.fn((element: HTMLMediaElement) => element);
const attachScreenshareTrack = vi.fn((element: HTMLMediaElement) => element);
const detachScreenshareTrack = vi.fn((element: HTMLMediaElement) => element);
const mockState: {
  currentUser: {
    pubkey: string;
    displayName: string;
    name: string;
    picture?: string;
  };
  activeCall: CallSession;
  getBeacon: (geohash: string) => { avatarUrl?: string } | undefined;
  getProfile: (pubkey: string) => { pubkey: string; displayName: string; name: string; picture?: string } | undefined;
  leaveBeaconCall: typeof leaveBeaconCall;
  toggleCallControl: typeof toggleCallControl;
} = {
  currentUser: {
    pubkey: "npub1scout",
    displayName: "Scout Vale",
    name: "Scout Vale"
  },
  activeCall: {
    geohash: "9q8yyk",
    roomID: "geo:npub1operator:9q8yyk",
    placeTitle: "Civic Plaza",
    participantPubkeys: ["npub1scout", "npub1operator"],
    participantStates: [],
    mediaStreams: [
      {
        id: "npub1scout:camera",
        pubkey: "npub1scout",
        source: "camera" as const,
        isLocal: true,
        track: {
          attach: attachCameraTrack,
          detach: detachCameraTrack
        }
      },
      {
        id: "npub1operator:screen_share",
        pubkey: "npub1operator",
        source: "screen_share" as const,
        isLocal: false,
        track: {
          attach: attachScreenshareTrack,
          detach: detachScreenshareTrack
        }
      }
    ],
    transport: "livekit" as const,
    connectionState: "connected" as const,
    statusMessage: "Connected",
    identity: "npub1scout",
    liveKitURL: "wss://livekit.example.test",
    expiresAt: "2026-03-22T20:00:00Z",
    canPublish: true,
    mic: true,
    cam: false,
    screenshare: false,
    deafen: false,
    minimized: false
  },
  getBeacon: (geohash: string) =>
    geohash === "9q8yyk"
      ? {
          avatarUrl: "https://example.com/civic-plaza.png"
        }
      : undefined,
  getProfile: (pubkey: string) =>
    pubkey === "npub1operator"
      ? {
          pubkey,
          displayName: "Relay Operator",
          name: "Relay Operator"
        }
      : undefined,
  leaveBeaconCall,
  toggleCallControl
};

vi.mock("../app-state", () => ({
  useAppState: () => mockState
}));

import { ActiveCallMediaStreams, CallOverlay } from "./call-overlay";

function renderOverlay() {
  return render(
    <MemoryRouter initialEntries={["/app/chats"]}>
      <Routes>
        <Route
          path="/app/*"
          element={
            <>
              <CallOverlay />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function renderOverlayHarness() {
  return render(
    <MemoryRouter initialEntries={["/app/chats"]}>
      <Routes>
        <Route
          path="/app/*"
          element={
            <>
              <OverlayHarness />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function OverlayHarness() {
  const [, setTick] = useState(0);

  return (
    <>
      <button type="button" onClick={() => setTick((value) => value + 1)}>
        Rerender overlay
      </button>
      <CallOverlay />
    </>
  );
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="route-location">{`${location.pathname}${location.search}`}</div>;
}

describe("CallOverlay", () => {
  beforeEach(() => {
    leaveBeaconCall.mockClear();
    toggleCallControl.mockClear();
    attachCameraTrack.mockClear();
    detachCameraTrack.mockClear();
    attachScreenshareTrack.mockClear();
    detachScreenshareTrack.mockClear();
    mockState.activeCall = {
      geohash: "9q8yyk",
      roomID: "geo:npub1operator:9q8yyk",
      placeTitle: "Civic Plaza",
      participantPubkeys: ["npub1scout", "npub1operator"],
      participantStates: [],
      mediaStreams: [
        {
          id: "npub1scout:camera",
          pubkey: "npub1scout",
          source: "camera" as const,
          isLocal: true,
          track: {
            attach: attachCameraTrack,
            detach: detachCameraTrack
          }
        },
        {
          id: "npub1operator:screen_share",
          pubkey: "npub1operator",
          source: "screen_share" as const,
          isLocal: false,
          track: {
            attach: attachScreenshareTrack,
            detach: detachScreenshareTrack
          }
        }
      ],
      transport: "livekit" as const,
      connectionState: "connected" as const,
      statusMessage: "Connected",
      identity: "npub1scout",
      liveKitURL: "wss://livekit.example.test",
      expiresAt: "2026-03-22T20:00:00Z",
      canPublish: true,
      mic: true,
      cam: false,
      screenshare: false,
      deafen: false,
      minimized: false
    };
  });

  it("does not render media tiles in the overlay", () => {
    renderOverlay();

    expect(screen.queryByLabelText(/live call media streams/i)).not.toBeInTheDocument();
    expect(attachCameraTrack).not.toHaveBeenCalled();
    expect(attachScreenshareTrack).not.toHaveBeenCalled();
  });

  it("stays hidden until the LiveKit room reaches connected state", () => {
    mockState.activeCall = {
      ...mockState.activeCall,
      connectionState: "connecting"
    };

    renderOverlay();

    expect(screen.queryByLabelText(/live call bar/i)).not.toBeInTheDocument();
  });

  it("lights up only the speaking participant camera tile", () => {
    mockState.activeCall = {
      ...mockState.activeCall,
      participantStates: [
        { pubkey: "npub1scout", mic: true, cam: true, screenshare: false, isSpeaking: false },
        { pubkey: "npub1operator", mic: true, cam: true, screenshare: false, isSpeaking: true }
      ],
      mediaStreams: [
        {
          id: "npub1scout:camera",
          pubkey: "npub1scout",
          source: "camera",
          isLocal: true,
          track: {
            attach: attachCameraTrack,
            detach: detachCameraTrack
          }
        },
        {
          id: "npub1operator:camera",
          pubkey: "npub1operator",
          source: "camera",
          isLocal: false,
          track: {
            attach: attachCameraTrack,
            detach: detachCameraTrack
          }
        }
      ]
    };

    render(<ActiveCallMediaStreams includeLocal />);

    expect(screen.getByLabelText(/relay operator camera stream/i)).toHaveClass("is-speaking");
    expect(screen.getByLabelText(/scout vale camera stream/i)).not.toHaveClass("is-speaking");
  });

  it("keeps the overlay header focused on the active place and hides relay token metadata", () => {
    const { container } = renderOverlay();

    const header = container.querySelector(".call-overlay-header");
    expect(header).not.toBeNull();

    expect(within(header as HTMLElement).queryByText("Live call")).not.toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("img", { name: "Civic Plaza" })).toHaveAttribute(
      "src",
      "https://example.com/civic-plaza.png"
    );
    expect(within(header as HTMLElement).queryByRole("heading", { name: "Civic Plaza" })).not.toBeInTheDocument();
    expect(within(header as HTMLElement).queryByRole("link", { name: "Civic Plaza" })).not.toBeInTheDocument();
    expect(within(header as HTMLElement).queryByText("9q8yyk")).not.toBeInTheDocument();
    const micButton = within(header as HTMLElement).getByRole("button", { name: "Mic on" });
    const cameraButton = within(header as HTMLElement).getByRole("button", { name: "Camera off" });
    const screenshareButton = within(header as HTMLElement).getByRole("button", { name: "Screenshare off" });
    const leaveButton = within(header as HTMLElement).getByRole("button", { name: "Leave call" });

    expect(micButton).toBeInTheDocument();
    expect(cameraButton).toBeInTheDocument();
    expect(screenshareButton).toBeInTheDocument();
    expect(leaveButton).toBeInTheDocument();
    expect(micButton).not.toHaveAttribute("title");
    expect(cameraButton).not.toHaveAttribute("title");
    expect(screenshareButton).not.toHaveAttribute("title");
    expect(leaveButton).not.toHaveAttribute("title");

    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("wss://livekit.example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-03-22T20:00:00Z")).not.toBeInTheDocument();
  });

  it("does not render a separate footer control region", () => {
    const { container } = renderOverlay();
    const footer = container.querySelector(".call-overlay-footer");

    expect(footer).toBeNull();
  });

  it("navigates to the focused beacon on the map when clicking the avatar", async () => {
    const user = userEvent.setup();

    const { container } = renderOverlay();
    const header = container.querySelector(".call-overlay-header");

    expect(header).not.toBeNull();

    await user.click(within(header as HTMLElement).getByRole("button", { name: /show civic plaza on the map/i }));

    expect(screen.getByTestId("route-location").textContent).toMatch(/^\/app\?beacon=9q8yyk&focus=/);
  });

  it("does not attach media tracks across unrelated rerenders", async () => {
    const user = userEvent.setup();

    renderOverlayHarness();

    expect(attachCameraTrack).not.toHaveBeenCalled();
    expect(attachScreenshareTrack).not.toHaveBeenCalled();
    expect(detachScreenshareTrack).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /rerender overlay/i }));

    expect(attachCameraTrack).not.toHaveBeenCalled();
    expect(attachScreenshareTrack).not.toHaveBeenCalled();
    expect(detachScreenshareTrack).not.toHaveBeenCalled();
  });

  it("stays hidden for local preview call state", () => {
    mockState.activeCall = {
      ...mockState.activeCall,
      transport: "local",
      connectionState: "local_preview",
      statusMessage: "Signer required for LiveKit media. Room intent stays local.",
      canPublish: false
    };

    renderOverlay();

    expect(screen.queryByLabelText(/live call bar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signer required for livekit media\. room intent stays local\./i)).not.toBeInTheDocument();
    expect(toggleCallControl).not.toHaveBeenCalled();

    mockState.activeCall = {
      ...mockState.activeCall,
      transport: "livekit",
      connectionState: "connected",
      statusMessage: "Connected",
      canPublish: true
    };
  });
});
