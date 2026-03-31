import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { MapPreview } from "../components/map-preview";
import { ResizablePanels } from "../components/resizable-panels";
import { useAppState } from "../app-state";
import { buildBeaconMapSearch, createBeaconMapFocusKey, readBeaconMapFocusKey } from "../beacon-map-focus";
import type { GeoNote } from "../data";
import { useNarrowViewport } from "../hooks/use-viewport";
import { BeaconAvatar, BeaconThreadPanel, type RelativeDateFilter } from "./beacon-thread-panel";

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
const worldManifestoIntro =
  "Amid exploding sovereign debt, the relentless advance of AI, fresh wars in the Middle East, the lingering fractures of pandemic response, and the deep erosion of public trust laid bare by institutional scandals, the old centralized systems are visibly straining. Platforms that once promised connection now flood us with synthetic noise. Institutions that once claimed legitimacy increasingly reveal capture and fragility. In this moment of abundance and instability, real value shifts back to what cannot be endlessly replicated: embodied human connection in physical places, built and governed by the people who actually inhabit them.";
const worldManifestoSummary =
  "These principles outline a new foundation for social technology: one that turns digital signals into durable real-world publics, prioritizes sovereignty over surveillance, and equips local stewards to endure when distant powers falter.";
const worldManifestoPrinciples = [
  {
    title: "1. Human connection is the scarce good",
    body: "In a world of infinite synthetic content, real value comes from repeated in-person encounters. The system turns online signals into actual meetups, shared rituals, and durable relationships."
  },
  {
    title: "2. Place is a first-class social primitive",
    body: "Neighborhoods, venues, routes, and corners are the substrate of publics. Beacons make geography an active coordination layer for social life."
  },
  {
    title: "3. Presence must be chosen and intentional",
    body: "Presence is explicit, reversible, purpose-bound, and privacy-preserving. People decide when they are discoverable, never extracted through continuous tracking."
  },
  {
    title: "4. Sovereignty begins with ownership of identity, memory, and infrastructure",
    body: "Portable keys, portable records, and self-hostable components are the basis of continuity when platforms fail."
  },
  {
    title: "5. Governance must be self-sovereign and sustainable",
    body: "Communities own the rules and roles they can inspect, enforce, and carry with them. Reliable stewardship requires aligned incentives that support local operators without extraction or central control."
  },
  {
    title: "6. AI creates leverage, not legitimacy",
    body: "AI lowers the cost of matching, organizing, and sustaining connection, but never becomes the intermediary or replaces the relationships it enables."
  },
  {
    title: "7. Success is measured in real-world publics",
    body: "Adoption grows through low friction and visible fruit: durable relationships, thriving scenes, and resilient neighborhoods that outlast any single point of failure."
  }
] as const;

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
  const isCreationSheetVisible = Boolean(pendingBeacon);
  // Keep the desktop chat rail mounted while the pending beacon sheet is open.
  // Swapping out the split layout remounts MapPreview and forces a full map reload.
  const isChatVisible = !isNarrowViewport || (!isCreationSheetVisible && isNarrowBeaconOpen);
  const shouldShowMap = isCreationSheetVisible || !isNarrowViewport || !isNarrowBeaconOpen;
  const activeCallDuration = formatCallDuration(activeCall?.startedAt, callTimerNow);
  const defaultWorldPrimaryPanelSize = resolveDefaultWorldPrimaryPanelSize(
    typeof window === "undefined" ? 1280 : window.innerWidth
  );

  const markerCards = useMemo(() => {
    return filteredBeaconTiles.map((tile) => {
      const liveParticipantCount = tile.participants.length;
      const showCallTimer = activeCall?.geohash === tile.geohash && Boolean(activeCallDuration);
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
  }, [activeCall?.geohash, activeCallDuration, filteredBeaconTiles]);

  useEffect(() => {
    if (!activeCall?.startedAt) {
      return undefined;
    }

    setCallTimerNow(Date.now());

    const timer = window.setInterval(() => {
      setCallTimerNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeCall?.startedAt]);

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
    setSearchParams(buildBeaconMapSearch(geohash, createBeaconMapFocusKey()));
    if (isNarrowViewport) {
      setIsNarrowBeaconOpen(false);
    }
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
        activeGeohash={activeCall?.geohash}
        onSelectTile={openBeacon}
        pendingGeohash={pendingBeacon?.geohash}
        onBackgroundSelectTile={openPendingBeacon}
        onDismissPendingMarker={closePendingBeacon}
        markerCards={markerCards}
      >
        <>
          {pendingBeacon ? (
            <section className="world-sheet world-beacon-sheet" aria-label={`Light beacon ${pendingBeacon.geohash}`}>
              <div className="world-sheet-header">
                <div>
                  <p className="muted">{worldBeaconExplainer}</p>
                </div>
              </div>

              {pendingBeacon.step === "prompt" ? (
                <div className="world-sheet-actions action-row">
                  <button className="secondary-button" type="button" onClick={closePendingBeacon}>
                    Cancel
                  </button>
                  <button className="primary-button" type="button" onClick={openBeaconCreationForm}>
                    Light Beacon
                  </button>
                </div>
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

                  <label className="field-stack">
                    <span>Picture</span>
                    {pendingBeacon.picture ? (
                      <img
                        className="metadata-picture-preview"
                        src={pendingBeacon.picture}
                        alt="Beacon picture preview"
                      />
                    ) : null}
                    <p className={pendingBeacon.picture ? "metadata-readonly-value" : "metadata-readonly-value muted"}>
                      {pendingBeacon.picture ||
                        (pendingBeacon.pictureUploading ? "Uploading picture..." : "No picture uploaded yet.")}
                    </p>
                  </label>

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

                  <div className="action-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => updatePendingBeacon("picture", "")}
                      disabled={
                        pendingBeacon.submitting ||
                        pendingBeacon.pictureUploading ||
                        pendingBeacon.picture.length === 0
                      }
                    >
                      Remove picture
                    </button>
                  </div>

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

                  <label className="field-stack">
                    <span>Tags</span>
                    <input
                      className="field-input"
                      type="text"
                      value={pendingBeacon.tags}
                      onChange={(event) => updatePendingBeacon("tags", event.target.value)}
                      placeholder="cohort, curriculum:zero-to-hero, level:beginner, hybrid"
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

  const chatPanel = isChatVisible ? (
    <aside className="panel route-surface route-surface-chats world-route-chat-panel">
      {selectedBeacon ? (
        <BeaconThreadPanel
          beaconGeohash={selectedBeacon.geohash}
          relativeDateFilter={relativeDateFilter}
          avatarActionLabel={`Show ${selectedBeacon.name} on the map`}
          onActivateBeacon={focusBeaconOnMap}
        />
      ) : (
        <article className="thread-detail world-manifesto-panel" aria-label="Synchrono City manifesto">
          <div className="world-manifesto-copy">
            <div>
              <p className="section-label">Manifesto</p>
              <h3>Synchrono City</h3>
            </div>
            <p className="muted">{worldManifestoIntro}</p>
            <p className="muted">{worldManifestoSummary}</p>
          </div>
          <div className="world-manifesto-principles">
            {worldManifestoPrinciples.map((principle) => (
              <article key={principle.title} className="world-manifesto-principle">
                <h4>{principle.title}</h4>
                <p className="muted">{principle.body}</p>
              </article>
            ))}
          </div>
        </article>
      )}
    </aside>
  ) : null;

  if (!isNarrowViewport && mapPanel && chatPanel) {
    return (
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
  }

  return (
    <section className="world-route world-route-split">
      {mapPanel}
      {chatPanel}
    </section>
  );
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
