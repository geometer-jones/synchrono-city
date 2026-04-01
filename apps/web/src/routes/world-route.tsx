import { useEffect, useEffectEvent, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { MapPreview } from "../components/map-preview";
import { ResizablePanels } from "../components/resizable-panels";
import { useAppState } from "../app-state";
import { buildBeaconMapSearch, createBeaconMapFocusKey, readBeaconMapFocusKey } from "../beacon-map-focus";
import { isConnectedLiveKitCall, type GeoNote } from "../data";
import { useNarrowViewport } from "../hooks/use-viewport";
import { BeaconThreadPanel, type RelativeDateFilter } from "./beacon-thread-panel";

type PendingBeaconDraft = {
  geohash: string;
  name: string;
  picture: string;
  about: string;
  tags: string;
  step: "prompt" | "form";
  pictureUploading: boolean;
  submitting: boolean;
  error: string | null;
};

const relativeDateFilterWindowMs: Record<Exclude<RelativeDateFilter, "all">, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000
};

const defaultDesktopWorldSplitRatio = 0.5;
const worldBeaconExplainer =
  "A beacon anchors an online community to a geolocation. As a beacon admin, you will be able to delete posts, kick users, and appoint mods within your beacon.";
const worldOverviewParagraphs = [
  "synchrono.city is an open source stack that establishes a standard for bundling these open source protocols together.",
  "The client serves as a relay manager as well, if you decide to operate your own relay.",
  "Avoid online serfdom, hold your own keys, host your own relay."
] as const;
const worldStackItems = [
  {
    label: "Nostr",
    title: "Nostr",
    description:
      "Nostr lets you store your social data across multiple backends instead of trapping your identity, notes, and follows inside one company database. That matters because durability, portability, and censorship resistance only get real when your data can survive a single host failing or turning hostile. To make that work, Nostr relies on public key cryptography: your private key signs what you publish, your public key identifies you to everyone else, and other clients can verify that your data actually came from you. Once you understand the keypair, the obvious next move is to host your own relay so your social presence is not downstream of somebody else's server policy.",
    links: [
      { label: "Protocol", href: "https://github.com/nostr-protocol/nostr" },
      { label: "Guide", href: "https://nostr.org" }
    ]
  },
  {
    label: "LiveKit",
    title: "LiveKit",
    description:
      "LiveKit provides the realtime voice and video layer. It turns a beacon from a text thread into a place where people can actually drop in, talk, and hang out.",
    links: [
      { label: "Website", href: "https://livekit.com" },
      { label: "GitHub", href: "https://github.com/livekit/livekit" }
    ]
  },
  {
    label: "Blossom",
    title: "Blossom",
    description:
      "Blossom stores uploaded media. It gives the stack a simple way to attach images and files to social context without hiding the storage layer behind a proprietary app.",
    links: [{ label: "Spec", href: "https://github.com/hzrd149/blossom" }]
  },
  {
    label: "Concierge",
    title: "Concierge",
    description:
      "Concierge is synchrono.city's contribution to the stack. Its role is to assist relay operators and relay users by handling relay-local policy, permissions, moderation, and the glue code that ties identity, media, calls, and map-native social behavior into one hostable system.",
    links: [{ label: "GitHub", href: "https://github.com/geometer-jones/synchrono-city" }]
  }
] as const;

type StackExplainer = (typeof worldStackItems)[number];

function matchesRelativeDateFilter(note: GeoNote, filter: RelativeDateFilter) {
  if (filter === "all") {
    return true;
  }

  const createdAt = Date.parse(note.createdAt);
  if (!Number.isFinite(createdAt)) {
    return false;
  }

  return createdAt >= Date.now() - relativeDateFilterWindowMs[filter];
}

function formatMarkerLiveLabel(participantCount: number, duration?: string | null) {
  if (duration) {
    return `${participantCount} LIVE - ${duration}`;
  }

  return `${participantCount} LIVE`;
}

function formatCallDuration(startedAt?: string, now = Date.now()) {
  if (!startedAt) {
    return null;
  }

  const startedAtTimestamp = Date.parse(startedAt);
  if (!Number.isFinite(startedAtTimestamp)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - startedAtTimestamp) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function WorldRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const relativeDateFilter: RelativeDateFilter = "all";
  const isNarrowViewport = useNarrowViewport();
  const [isNarrowBeaconOpen, setIsNarrowBeaconOpen] = useState(false);
  const [pendingBeacon, setPendingBeacon] = useState<PendingBeaconDraft | null>(null);
  const [callTimerNow, setCallTimerNow] = useState(() => Date.now());
  const [openStackExplainer, setOpenStackExplainer] = useState<StackExplainer | null>(null);
  const {
    activeCall,
    createBeacon,
    getBeacon,
    listBeaconTiles,
    listNotesForBeacon,
    refreshPlaceNotesFromRelay,
    uploadBeaconPicture
  } = useAppState();

  const beaconTiles = listBeaconTiles();
  const filteredBeaconTiles = beaconTiles
    .map((tile) => {
      const filteredNotes = listNotesForBeacon(tile.geohash).filter((note) =>
        matchesRelativeDateFilter(note, relativeDateFilter)
      );

      return {
        ...tile,
        latestNote: filteredNotes[0]?.content ?? tile.latestNote,
        noteCount: filteredNotes.length
      };
    });

  const selectedBeaconGeohash = searchParams.get("beacon") ?? "";
  const mapFocusKey = readBeaconMapFocusKey(searchParams);
  const selectedBeacon = selectedBeaconGeohash ? getBeacon(selectedBeaconGeohash) : undefined;
  const connectedActiveCall = isConnectedLiveKitCall(activeCall) ? activeCall : null;
  const isCreationSheetVisible = Boolean(pendingBeacon);
  // Keep the desktop chat rail mounted while the pending beacon sheet is open.
  // Swapping out the split layout remounts MapPreview and forces a full map reload.
  const isChatVisible = !isNarrowViewport || (!isCreationSheetVisible && isNarrowBeaconOpen);
  const shouldShowMap = isCreationSheetVisible || !isNarrowViewport || !isNarrowBeaconOpen;
  const activeCallDuration = formatCallDuration(connectedActiveCall?.startedAt, callTimerNow);
  const activeCallParticipantCount = useMemo(
    () =>
      Array.from(new Set(connectedActiveCall?.participantPubkeys.map((pubkey) => pubkey.trim()).filter(Boolean) ?? [])).length,
    [connectedActiveCall?.participantPubkeys]
  );
  const liveBeaconTiles = useMemo(
    () =>
      filteredBeaconTiles.filter((tile) => {
        const liveParticipantCount =
          connectedActiveCall?.geohash === tile.geohash && activeCallParticipantCount > 0
            ? activeCallParticipantCount
            : tile.participants.length;

        return liveParticipantCount > 0;
      }),
    [connectedActiveCall?.geohash, activeCallParticipantCount, filteredBeaconTiles]
  );
  const visibleNoteCount = useMemo(
    () => filteredBeaconTiles.reduce((sum, tile) => sum + tile.noteCount, 0),
    [filteredBeaconTiles]
  );
  const defaultWorldPrimaryPanelSize = resolveDefaultWorldPrimaryPanelSize(
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  const markerCards = useMemo(() => {
    return filteredBeaconTiles.map((tile) => {
      const liveParticipantCount =
        connectedActiveCall?.geohash === tile.geohash && activeCallParticipantCount > 0
          ? activeCallParticipantCount
          : tile.participants.length;
      const showCallTimer = connectedActiveCall?.geohash === tile.geohash && Boolean(activeCallDuration);
      const liveLabel = formatMarkerLiveLabel(liveParticipantCount, showCallTimer ? activeCallDuration : null);

      return {
        geohash: tile.geohash,
        ariaLabel: `Beacon card ${tile.name}`,
        content: (
          <article className="marker-card-shell">
            <div className="marker-card-beacon-copy">
              <div className="marker-card-beacon-meta">
                <h3>
                  <Link
                    className="marker-card-title-link"
                    to={`?beacon=${encodeURIComponent(tile.geohash)}`}
                    onClick={() => setPendingBeacon(null)}
                  >
                    {tile.name}
                  </Link>
                </h3>
                {liveParticipantCount > 0 ? <p className="marker-call-timer">{liveLabel}</p> : null}
              </div>
              {tile.cohort ? (
                <div className="route-header-meta">
                  <span className="thread-pill">Cohort</span>
                  {tile.cohort.levelLabel ? <span className="thread-pill">{tile.cohort.levelLabel}</span> : null}
                  {tile.cohort.weekLabel ? <span className="thread-pill live">{tile.cohort.weekLabel}</span> : null}
                </div>
              ) : null}
              <p className="marker-card-about">{tile.cohort?.summary ?? tile.about}</p>
              {tile.cohort?.nextSession ? (
                <p className="tile-kicker">Next: {truncateDetailLine(tile.cohort.nextSession)}</p>
              ) : null}
            </div>
          </article>
        )
      };
    });
  }, [connectedActiveCall?.geohash, activeCallDuration, activeCallParticipantCount, filteredBeaconTiles]);

  useEffect(() => {
    if (!connectedActiveCall?.startedAt) {
      return undefined;
    }

    setCallTimerNow(Date.now());

    const timer = window.setInterval(() => {
      setCallTimerNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [connectedActiveCall?.startedAt]);

  useEffect(() => {
    if (!isNarrowViewport) {
      setIsNarrowBeaconOpen(false);
    }
  }, [isNarrowViewport]);

  useEffect(() => {
    if (isNarrowViewport && selectedBeaconGeohash) {
      setIsNarrowBeaconOpen(true);
    }
  }, [isNarrowViewport, selectedBeaconGeohash]);

  useEffect(() => {
    if (isNarrowViewport && !selectedBeaconGeohash) {
      setIsNarrowBeaconOpen(false);
    }
  }, [isNarrowViewport, selectedBeaconGeohash]);

  useEffect(() => {
    if (!isNarrowViewport || !selectedBeaconGeohash || !mapFocusKey) {
      return;
    }

    setIsNarrowBeaconOpen(false);
  }, [isNarrowViewport, mapFocusKey, selectedBeaconGeohash]);

  const refreshSelectedBeaconNotes = useEffectEvent((geohash: string) => {
    void refreshPlaceNotesFromRelay(geohash);
  });

  useEffect(() => {
    if (!selectedBeaconGeohash) {
      return;
    }

    refreshSelectedBeaconNotes(selectedBeaconGeohash);
  }, [selectedBeaconGeohash]);

  function openBeacon(geohash: string) {
    setPendingBeacon(null);
    setSearchParams({ beacon: geohash });
    if (isNarrowViewport) {
      setIsNarrowBeaconOpen(true);
    }
  }

  function openPendingBeacon(geohash: string) {
    const existingBeacon = getBeacon(geohash);
    if (existingBeacon) {
      openBeacon(geohash);
      return;
    }

    setPendingBeacon({
      geohash,
      name: "",
      picture: "",
      about: "",
      tags: "",
      step: "prompt",
      pictureUploading: false,
      submitting: false,
      error: null
    });
    setSearchParams({});
    setIsNarrowBeaconOpen(false);
  }

  function focusBeaconOnMap(geohash: string) {
    setPendingBeacon(null);
    if (isNarrowViewport) {
      setSearchParams({});
      setIsNarrowBeaconOpen(false);
      return;
    }

    setSearchParams(buildBeaconMapSearch(geohash, createBeaconMapFocusKey()));
  }

  function closePendingBeacon() {
    setPendingBeacon(null);
  }

  function openBeaconCreationForm() {
    setPendingBeacon((current) =>
      current
        ? {
            ...current,
            step: "form",
            error: null
          }
        : current
    );
  }

  function updatePendingBeacon<K extends "name" | "picture" | "about" | "tags">(field: K, value: PendingBeaconDraft[K]) {
    setPendingBeacon((current) =>
      current
        ? {
            ...current,
            [field]: value,
            error: null
          }
        : current
    );
  }

  async function handlePendingBeaconPictureUpload(file: File | null) {
    if (!file || !pendingBeacon) {
      return;
    }

    const targetGeohash = pendingBeacon.geohash;
    setPendingBeacon((current) =>
      current && current.geohash === targetGeohash
        ? {
            ...current,
            pictureUploading: true,
            error: null
          }
        : current
    );

    try {
      const pictureURL = await uploadBeaconPicture(file);
      setPendingBeacon((current) =>
        current && current.geohash === targetGeohash
          ? {
              ...current,
              picture: pictureURL,
              pictureUploading: false,
              error: null
            }
          : current
      );
    } catch (error) {
      setPendingBeacon((current) =>
        current && current.geohash === targetGeohash
          ? {
              ...current,
              pictureUploading: false,
              error: error instanceof Error ? error.message : "Picture upload failed."
            }
          : current
      );
    }
  }

  async function handleSubmitPendingBeacon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pendingBeacon || pendingBeacon.submitting) {
      return;
    }

    const normalizedName = pendingBeacon.name.trim();
    if (!normalizedName) {
      setPendingBeacon((current) =>
        current
          ? {
              ...current,
              error: "Give this beacon a name before you light it."
            }
          : current
      );
      return;
    }

    const draft = pendingBeacon;
    setPendingBeacon((current) =>
      current
        ? {
            ...current,
            submitting: true,
            error: null
          }
        : current
    );

    try {
      const result = await createBeacon(draft.geohash, {
        name: draft.name,
        picture: draft.picture,
        about: draft.about,
        tags: parseBeaconTagInput(draft.tags)
      });
      openBeacon(result.beacon.geohash);
    } catch (error) {
      setPendingBeacon((current) =>
        current && current.geohash === draft.geohash
          ? {
              ...current,
              submitting: false,
              error: error instanceof Error ? error.message : "Unable to light this beacon right now."
            }
          : current
      );
    }
  }

  const mapPanel = shouldShowMap ? (
    <div className="world-route-map-panel">
      <MapPreview
        tiles={filteredBeaconTiles}
        selectedGeohash={selectedBeaconGeohash}
        focusRequestKey={mapFocusKey || undefined}
        activeGeohash={connectedActiveCall?.geohash}
        onSelectTile={openBeacon}
        pendingGeohash={pendingBeacon?.geohash}
        onBackgroundSelectTile={openPendingBeacon}
        onDismissPendingMarker={closePendingBeacon}
        markerCards={markerCards}
      >
        <>
          {pendingBeacon ? (
            <section className="world-sheet world-beacon-sheet" aria-label={`Light beacon ${pendingBeacon.geohash}`}>
              {pendingBeacon.step === "prompt" ? (
                <>
                  <div className="world-sheet-header">
                    <div>
                      <p className="muted">{worldBeaconExplainer}</p>
                    </div>
                  </div>

                  <div className="world-sheet-actions action-row">
                    <button className="secondary-button" type="button" onClick={closePendingBeacon}>
                      Cancel
                    </button>
                    <button className="primary-button" type="button" onClick={openBeaconCreationForm}>
                      Light Beacon
                    </button>
                  </div>
                </>
              ) : (
                <form className="metadata-form world-beacon-form" onSubmit={handleSubmitPendingBeacon}>
                  <label className="field-stack">
                    <span>Name</span>
                    <input
                      className="field-input"
                      type="text"
                      value={pendingBeacon.name}
                      onChange={(event) => updatePendingBeacon("name", event.target.value)}
                      placeholder="Lantern Point"
                      maxLength={120}
                      disabled={pendingBeacon.submitting || pendingBeacon.pictureUploading}
                    />
                  </label>

                  <div className="field-stack">
                    <span>Picture</span>
                    {pendingBeacon.picture ? (
                      <div className="world-beacon-picture-row">
                        <img
                          className="metadata-picture-preview"
                          src={pendingBeacon.picture}
                          alt="Beacon picture preview"
                        />
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => updatePendingBeacon("picture", "")}
                          disabled={pendingBeacon.submitting || pendingBeacon.pictureUploading}
                        >
                          Remove picture
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <label className="field-stack">
                    <span>Upload image</span>
                    <input
                      className="field-input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void handlePendingBeaconPictureUpload(file);
                        event.target.value = "";
                      }}
                      disabled={pendingBeacon.submitting || pendingBeacon.pictureUploading}
                    />
                  </label>

                  <label className="field-stack">
                    <span>About</span>
                    <textarea
                      className="field-input"
                      value={pendingBeacon.about}
                      onChange={(event) => updatePendingBeacon("about", event.target.value)}
                      placeholder="What should people know about this beacon?"
                      rows={3}
                      disabled={pendingBeacon.submitting || pendingBeacon.pictureUploading}
                    />
                  </label>

                  {pendingBeacon.error ? <p className="field-error">{pendingBeacon.error}</p> : null}

                  <div className="world-sheet-actions action-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={closePendingBeacon}
                      disabled={pendingBeacon.submitting || pendingBeacon.pictureUploading}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={pendingBeacon.submitting || pendingBeacon.pictureUploading}
                    >
                      {pendingBeacon.submitting ? "Lighting..." : "Light beacon"}
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : null}
        </>
      </MapPreview>
    </div>
  ) : null;

  const showWorldOverview = !isNarrowViewport && !selectedBeacon;
  const chatPanel = isChatVisible && (selectedBeacon || showWorldOverview) ? (
    <aside className="panel route-surface route-surface-chats world-route-chat-panel">
      {selectedBeacon ? (
        <BeaconThreadPanel
          beaconGeohash={selectedBeacon.geohash}
          relativeDateFilter={relativeDateFilter}
          avatarActionLabel={`Show ${selectedBeacon.name} on the map`}
          onActivateBeacon={focusBeaconOnMap}
        />
      ) : (
        <article className="thread-detail world-manifesto-panel" aria-label="World overview">
          <div className="feature-card world-manifesto-card">
            <div className="world-manifesto-copy">
              <div>
                <p className="section-label">Welcome to</p>
                <h3>
                  <a className="marker-card-title-link" href="https://synchrono.city" rel="noreferrer" target="_blank">
                    https://synchrono.city
                  </a>
                </h3>
              </div>
            </div>
            <div className="route-header-meta">
              <span className="thread-pill live">{liveBeaconTiles.length} live</span>
              <span className="thread-pill">{filteredBeaconTiles.length} beacons</span>
              <span className="thread-pill">{visibleNoteCount} notes</span>
            </div>
            <div className="world-manifesto-principles">
              <p className="muted">{worldOverviewParagraphs[0]}</p>
              <div className="world-stack-links" aria-label="Stack overview">
                {worldStackItems.map((item) => {
                  const isOpen = openStackExplainer?.label === item.label;

                  return (
                    <button
                      key={item.label}
                      className="secondary-link world-stack-link"
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`world-stack-explainer-${item.label.toLowerCase()}`}
                      onClick={() => setOpenStackExplainer(isOpen ? null : item)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              {openStackExplainer ? (
                <div
                  className="mini-card world-stack-explainer"
                  id={`world-stack-explainer-${openStackExplainer.label.toLowerCase()}`}
                >
                  <strong>{openStackExplainer.title}</strong>
                  <p>{openStackExplainer.description}</p>
                  <div className="world-stack-explainer-links">
                    {openStackExplainer.links.map((link) => (
                      <a
                        key={link.href}
                        className="world-stack-explainer-link"
                        href={link.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {link.href}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {worldOverviewParagraphs.slice(1).map((paragraph) => (
                <p key={paragraph} className="muted">
                  {paragraph}
                </p>
              ))}
              <p className="muted">to host your own, just run</p>
              <pre className="world-overview-code-block">
                <code>{`git clone\n./setup.sh`}</code>
              </pre>
              <p className="muted">
                There is geographic signal, so online relationships have a lower barrier to become in-person
                interactions, and end-to-end encrypted DMs when you want them.
              </p>
            </div>
          </div>
        </article>
      )}
    </aside>
  ) : null;

  let content: ReactNode;

  if (!isNarrowViewport && mapPanel && chatPanel) {
    content = (
      <ResizablePanels
        as="section"
        className="world-route world-route-split"
        storageKey="world-layout"
        defaultPrimarySize={defaultWorldPrimaryPanelSize}
        minPrimarySize={360}
        minSecondarySize={320}
        handleLabel="Resize world panels"
        primary={mapPanel}
        secondary={chatPanel}
      />
    );
  } else if (!chatPanel) {
    content = <section className="world-route">{mapPanel}</section>;
  } else {
    content = (
      <section className="world-route world-route-split">
        {mapPanel}
        {chatPanel}
      </section>
    );
  }

  return <>{content}</>;
}

function parseBeaconTagInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function resolveDefaultWorldPrimaryPanelSize(viewportWidth: number) {
  return Math.max(360, Math.round(viewportWidth * defaultDesktopWorldSplitRatio));
}

function truncateDetailLine(value: string, maxLength = 48) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}
