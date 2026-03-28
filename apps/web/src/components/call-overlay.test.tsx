import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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

import { CallOverlay } from "./call-overlay";

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

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="route-location">{`${location.pathname}${location.search}`}</div>;
}

describe("CallOverlay", () => {
  it("renders only remote participant tiles even when a participant has no camera track", () => {
    renderOverlay();

    const streamRegion = screen.getByLabelText(/live call media streams/i);
    const remoteCameraFallback = within(streamRegion).getByLabelText(/relay operator camera stream/i);
    const remoteScreenshare = within(streamRegion).getByLabelText(/relay operator screen share stream/i);

    expect(within(streamRegion).queryByLabelText(/scout vale camera stream/i)).not.toBeInTheDocument();
    expect(remoteCameraFallback).toHaveClass("is-camera");
    expect(remoteScreenshare).toHaveClass("is-screen-share");
    expect(remoteCameraFallback).toHaveTextContent("Camera");
    expect(remoteCameraFallback).toHaveTextContent("Relay Operator");
    expect(remoteScreenshare).toHaveTextContent("Screen share");
    expect(attachCameraTrack).not.toHaveBeenCalled();
    expect(attachScreenshareTrack).toHaveBeenCalledWith(
      within(remoteScreenshare).getByLabelText(/relay operator screen share preview/i)
    );
  });

  it("keeps the call controls in the header and hides relay token metadata", () => {
    const { container } = renderOverlay();

    const header = container.querySelector(".call-overlay-header");
    expect(header).not.toBeNull();

    expect(within(header as HTMLElement).queryByText("Live call")).not.toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("heading", { name: "Civic Plaza" })).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("link", { name: "Civic Plaza" })).toHaveAttribute(
      "href",
      "/app?beacon=9q8yyk"
    );
    expect(within(header as HTMLElement).getByRole("img", { name: "Civic Plaza" })).toHaveAttribute(
      "src",
      "https://example.com/civic-plaza.png"
    );
    expect(within(header as HTMLElement).queryByText("9q8yyk")).not.toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("button", { name: "Mic on" })).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("button", { name: "Camera off" })).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("button", { name: "Screenshare off" })).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("button", { name: "Leave call" })).toBeInTheDocument();

    expect(screen.queryByText("wss://livekit.example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-03-22T20:00:00Z")).not.toBeInTheDocument();
  });

  it("navigates to the focused beacon on the map when clicking the avatar", async () => {
    const user = userEvent.setup();

    const { container } = renderOverlay();
    const header = container.querySelector(".call-overlay-header");

    expect(header).not.toBeNull();

    await user.click(within(header as HTMLElement).getByRole("button", { name: /show civic plaza on the map/i }));

    expect(screen.getByTestId("route-location").textContent).toMatch(/^\/app\?beacon=9q8yyk&focus=/);
  });

  it("hides local preview status copy while media publish controls stay disabled", () => {
    mockState.activeCall = {
      ...mockState.activeCall,
      transport: "local",
      connectionState: "local_preview",
      statusMessage: "Signer required for LiveKit media. Room intent stays local.",
      canPublish: false
    };

    renderOverlay();

    expect(screen.queryByText(/signer required for livekit media\. room intent stays local\./i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mic on" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Camera off" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Screenshare off" })).toBeDisabled();

    mockState.activeCall = {
      ...mockState.activeCall,
      transport: "livekit",
      connectionState: "connected",
      statusMessage: "Connected",
      canPublish: true
    };
  });
});
