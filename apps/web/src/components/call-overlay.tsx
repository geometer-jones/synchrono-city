import { useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { type CallMediaStream, type ParticipantProfile } from "../data";
import { useAppState } from "../app-state";
import { buildBeaconMapSearch, createBeaconMapFocusKey } from "../beacon-map-focus";

type ToggleControlButtonProps = {
  active: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

type ActionControlButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

type ActiveCallControlsProps = {
  className?: string;
  includeLeaveButton?: boolean;
};

type ActiveCallMediaStreamsProps = {
  className?: string;
  includeLocal?: boolean;
  includeParticipantTiles?: boolean;
  regionLabel?: string;
};

type CallDisplayTile = {
  id: string;
  pubkey: string;
  source: "camera" | "screen_share";
  isLocal: boolean;
  stream?: CallMediaStream;
  participantLabel: string;
  participantPicture?: string;
};

export function ActiveCallControls({
  className = "call-controls",
  includeLeaveButton = true
}: ActiveCallControlsProps) {
  const { activeCall, leaveBeaconCall, toggleCallControl } = useAppState();

  if (!activeCall) {
    return null;
  }

  return (
    <div className={className}>
      <ToggleControlButton
        active={activeCall.mic}
        label="Mic"
        onClick={() => toggleCallControl("mic")}
        icon={activeCall.mic ? <MicOnIcon /> : <MicOffIcon />}
      />
      <ToggleControlButton
        active={activeCall.cam}
        label="Camera"
        onClick={() => toggleCallControl("cam")}
        icon={activeCall.cam ? <CamOnIcon /> : <CamOffIcon />}
      />
      <ToggleControlButton
        active={activeCall.screenshare}
        label="Screenshare"
        onClick={() => toggleCallControl("screenshare")}
        icon={activeCall.screenshare ? <ShareOnIcon /> : <ShareOffIcon />}
      />
      {includeLeaveButton ? <ActionControlButton label="Leave call" onClick={leaveBeaconCall} icon={<LeaveCallIcon />} /> : null}
    </div>
  );
}

export function CallOverlay() {
  const { activeCall, getBeacon } = useAppState();
  const navigate = useNavigate();

  if (!activeCall) {
    return null;
  }

  const beacon = getBeacon(activeCall.geohash);
  const beaconLabel = activeCall.placeTitle.trim() || activeCall.geohash;

  return (
    <aside className="call-overlay" aria-label="Live call bar">
      <div className="call-overlay-header">
        <div className="call-overlay-title-row">
          <button
            className="beacon-avatar-button"
            type="button"
            aria-label={`Show ${beaconLabel} on the map`}
            onClick={() => navigate({ pathname: "/app", search: buildBeaconMapSearch(activeCall.geohash, createBeaconMapFocusKey()) })}
          >
            <CallOverlayBeaconAvatar picture={beacon?.avatarUrl} label={beaconLabel} />
          </button>
          <ActiveCallControls className="call-controls call-controls-inline" />
        </div>
      </div>

      <ActiveCallMediaStreams includeParticipantTiles={false} />
    </aside>
  );
}

export function ActiveCallMediaStreams({
  className = "call-stream-grid",
  includeLocal = false,
  includeParticipantTiles = true,
  regionLabel = "Live call media streams"
}: ActiveCallMediaStreamsProps) {
  const { activeCall, currentUser, getProfile } = useAppState();

  if (!activeCall) {
    return null;
  }

  const displayTiles = buildCallDisplayTiles(activeCall, currentUser, getProfile, { includeLocal, includeParticipantTiles });

  if (displayTiles.length === 0) {
    return null;
  }

  return (
    <section className={className} aria-label={regionLabel}>
      {displayTiles.map((tile) => (
        <CallStreamTile key={tile.id} tile={tile} />
      ))}
    </section>
  );
}

function CallOverlayBeaconAvatar({ picture, label }: { picture?: string; label: string }) {
  if (picture) {
    return <img className="beacon-avatar call-overlay-beacon-avatar" src={picture} alt={label} loading="lazy" />;
  }

  const initials = resolveParticipantInitials(label);

  return (
    <div className="beacon-avatar call-overlay-beacon-avatar participant-avatar-fallback" aria-hidden="true">
      {initials}
    </div>
  );
}

type CallStreamTileProps = {
  tile: CallDisplayTile;
};

function CallStreamTile({ tile }: CallStreamTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stream = tile.stream;
  const isLocal = tile.isLocal;

  useEffect(() => {
    if (!stream) {
      return undefined;
    }

    const element = videoRef.current;
    if (!element) {
      return undefined;
    }

    element.autoplay = true;
    element.defaultMuted = isLocal;
    element.muted = isLocal;
    element.playsInline = true;

    const attachedElement = stream.track.attach(element) as HTMLVideoElement;
    attachedElement.autoplay = true;
    attachedElement.defaultMuted = isLocal;
    attachedElement.muted = isLocal;
    attachedElement.playsInline = true;
    const userAgent = attachedElement.ownerDocument.defaultView?.navigator.userAgent ?? "";

    if (!/jsdom/i.test(userAgent)) {
      try {
        const playPromise = attachedElement.play();
        if (playPromise && typeof playPromise.catch === "function") {
          void playPromise.catch(() => {
            // LiveKit may require a user gesture to start playback.
          });
        }
      } catch {
        // Some browsers reject programmatic playback.
      }
    }

    return () => {
      stream.track.detach(attachedElement);
      attachedElement.srcObject = null;
    };
  }, [isLocal, stream]);

  return (
    <article
      className={
        tile.source === "screen_share" ? "call-stream-card is-screen-share" : "call-stream-card is-camera"
      }
      aria-label={`${tile.participantLabel} ${tile.source === "screen_share" ? "screen share" : "camera"} stream`}
    >
      <div className="call-stream-card-header">
        <div className="call-stream-meta">
          <p className="call-stream-kicker">{tile.source === "screen_share" ? "Screen share" : "Camera"}</p>
          <strong>{tile.participantLabel}</strong>
        </div>
        {tile.isLocal ? <span className="call-stream-chip">You</span> : null}
      </div>
      {tile.stream ? (
        <video
          ref={videoRef}
          aria-label={`${tile.participantLabel} ${tile.source === "screen_share" ? "screen share" : "camera"} preview`}
          className={tile.source === "screen_share" ? "call-stream-video is-screen-share" : "call-stream-video"}
        />
      ) : (
        <div
          className={tile.source === "screen_share" ? "call-stream-fallback is-screen-share" : "call-stream-fallback"}
          aria-label={`${tile.participantLabel} ${tile.source === "screen_share" ? "screen share" : "camera"} preview`}
        >
          {tile.participantPicture ? (
            <img className="call-stream-fallback-avatar" src={tile.participantPicture} alt={tile.participantLabel} loading="lazy" />
          ) : (
            <div className="call-stream-fallback-avatar call-stream-fallback-avatar-initials" aria-hidden="true">
              {resolveParticipantInitials(tile.participantLabel)}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function buildCallDisplayTiles(
  activeCall: NonNullable<ReturnType<typeof useAppState>["activeCall"]>,
  currentUser: ParticipantProfile,
  getProfile: ReturnType<typeof useAppState>["getProfile"],
  options?: {
    includeLocal?: boolean;
    includeParticipantTiles?: boolean;
  }
) {
  const includeLocal = options?.includeLocal ?? false;
  const includeParticipantTiles = options?.includeParticipantTiles ?? true;
  const cameraStreamsByPubkey = new Map<string, CallMediaStream>();
  const screenShareStreams: CallMediaStream[] = [];

  for (const stream of activeCall.mediaStreams) {
    if (stream.source === "screen_share") {
      screenShareStreams.push(stream);
      continue;
    }

    if (!cameraStreamsByPubkey.has(stream.pubkey)) {
      cameraStreamsByPubkey.set(stream.pubkey, stream);
    }
  }

  const participantPubkeys = Array.from(
    new Set([...activeCall.participantPubkeys, ...activeCall.mediaStreams.map((stream) => stream.pubkey)])
  );

  const participantTiles: CallDisplayTile[] = includeParticipantTiles
    ? participantPubkeys
        .filter((pubkey) => includeLocal || pubkey !== currentUser.pubkey)
        .map((pubkey) => {
          const isLocal = pubkey === currentUser.pubkey;
          const profile = isLocal ? currentUser : getProfile(pubkey);
          const stream = cameraStreamsByPubkey.get(pubkey);

          return {
            id: `camera:${pubkey}`,
            pubkey,
            source: "camera",
            isLocal,
            stream,
            participantLabel: resolveParticipantLabel(profile, pubkey),
            participantPicture: profile?.picture
          };
        })
    : [];

  const screenTiles: CallDisplayTile[] = screenShareStreams
    .filter((stream) => includeLocal || stream.pubkey !== currentUser.pubkey)
    .map((stream) => {
      const isLocal = stream.pubkey === currentUser.pubkey;
      const profile = isLocal ? currentUser : getProfile(stream.pubkey);

      return {
        id: stream.id,
        pubkey: stream.pubkey,
        source: "screen_share",
        isLocal,
        stream,
        participantLabel: resolveParticipantLabel(profile, stream.pubkey),
        participantPicture: profile?.picture
      };
    });

  return [...participantTiles, ...screenTiles];
}

function ToggleControlButton({ active, disabled = false, icon, label, onClick }: ToggleControlButtonProps) {
  return (
    <button
      className={active ? "call-control-button active" : "call-control-button"}
      type="button"
      aria-label={`${label} ${active ? "on" : "off"}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="call-control-icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

function ActionControlButton({ icon, label, onClick }: ActionControlButtonProps) {
  return (
    <button className="call-control-button danger" type="button" aria-label={label} onClick={onClick}>
      <span className="call-control-icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

function resolveParticipantLabel(participant: ParticipantProfile | undefined, pubkey: string) {
  const label = participant?.displayName || participant?.name;

  if (label?.trim()) {
    return label;
  }

  return abbreviateParticipantPubkey(pubkey);
}

function resolveParticipantInitials(label: string) {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "SC";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function abbreviateParticipantPubkey(pubkey: string) {
  if (pubkey.length <= 16) {
    return pubkey;
  }

  return `${pubkey.slice(0, 8)}...${pubkey.slice(-6)}`;
}

function MicOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 7 5.92" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

function CamOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

function ShareOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M12 20v-8" />
      <path d="M8.5 10.5L12 7l3.5 3.5" />
      <path d="M8 20h8" />
    </svg>
  );
}

function ShareOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

function LeaveCallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l6 6-6 6" />
      <path d="M21 12H9" />
      <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    </svg>
  );
}
