import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import { grantRoomPermission } from "../admin-client";
import { MapPreview } from "../components/map-preview";
import { ResizablePanels } from "../components/resizable-panels";
import { useAppState } from "../app-state";
import { buildBeaconMapSearch, createBeaconMapFocusKey, readBeaconMapFocusKey } from "../beacon-map-focus";
import { createFallbackParticipantProfile, sortNotesChronologically, type GeoNote, type ParticipantProfile } from "../data";
import { useNarrowViewport } from "../hooks/use-viewport";
import { CohortBeaconPanel, CohortHostControls } from "./cohort-panels";
import { showToast } from "../toast";

type RelativeDateFilter = "hour" | "day" | "week" | "month" | "year" | "all";

type BeaconMessageGroup = {
  authorPubkey: string;
  messages: GeoNote[];
};

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

const relativeDateFilterOptions: Array<{ value: RelativeDateFilter; label: string; longLabel: string }> = [
  { value: "hour", label: "Last hour", longLabel: "Last hour" },
  { value: "day", label: "Day", longLabel: "Last day" },
  { value: "week", label: "Week", longLabel: "Last week" },
  { value: "month", label: "Month", longLabel: "Last month" },
  { value: "year", label: "Year", longLabel: "Last year" },
  { value: "all", label: "All time", longLabel: "All time" }
];

const relativeDateFilterWindowMs: Record<Exclude<RelativeDateFilter, "all">, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000
};

const messageGroupWindowMs = 5 * 60 * 1000;
const maxWorldChatInputHeightPx = 176;

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

function abbreviateBeaconChatPubkey(pubkey: string) {
  const trimmed = pubkey.trim();
  if (trimmed.startsWith("npub")) {
    return `npub${trimmed.slice(4, 12)}`;
  }

  return trimmed.slice(0, 8);
}

function formatMarkerLiveLabel(participantCount: number, duration?: string | null) {
  if (duration) {
    return `${participantCount} LIVE - ${duration}`;
  }

  return `${participantCount} LIVE`;
}

function formatRelativeTime(timestamp: string) {
  const target = new Date(timestamp).getTime();

  if (!Number.isFinite(target)) {
    return timestamp;
  }

  const deltaSeconds = Math.max(0, Math.round((Date.now() - target) / 1000));

  if (deltaSeconds < 60) {
    return "just now";
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  if (deltaDays < 30) {
    return `${deltaDays}d ago`;
  }

  const deltaMonths = Math.floor(deltaDays / 30);
  if (deltaMonths < 12) {
    return `${deltaMonths}mo ago`;
  }

  return `${Math.floor(deltaMonths / 12)}y ago`;
}

function formatAbsoluteTime(timestamp: string) {
  const target = new Date(timestamp);

  if (Number.isNaN(target.getTime())) {
    return timestamp;
  }

  return target.toLocaleString();
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

function resolveBeaconChatAuthorLabel(author: ParticipantProfile | undefined, pubkey: string) {
  return author?.displayName || author?.name || abbreviateBeaconChatPubkey(pubkey);
}

function resolveBeaconChatAuthorInitials(author: ParticipantProfile | undefined, pubkey: string) {
  const label = resolveBeaconChatAuthorLabel(author, pubkey).trim();
  if (!label) {
    return pubkey.slice(0, 2).toUpperCase();
  }

  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function isScrolledToBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 24;
}

function buildMessageGroups(notes: GeoNote[]) {
  const orderedNotes = sortNotesChronologically(notes);
  const groups: BeaconMessageGroup[] = [];

  for (const note of orderedNotes) {
    const previousGroup = groups.at(-1);
    const previousMessage = previousGroup?.messages.at(-1);
    const currentTimestamp = Date.parse(note.createdAt);
    const previousTimestamp = previousMessage ? Date.parse(previousMessage.createdAt) : Number.NaN;

    const shouldAppendToPrevious =
      previousGroup &&
      previousGroup.authorPubkey === note.authorPubkey &&
      Number.isFinite(currentTimestamp) &&
      Number.isFinite(previousTimestamp) &&
      currentTimestamp - previousTimestamp <= messageGroupWindowMs;

    if (shouldAppendToPrevious) {
      previousGroup.messages.push(note);
      continue;
    }

    groups.push({
      authorPubkey: note.authorPubkey,
      messages: [note]
    });
  }

  return groups;
}

export function WorldRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftNote, setDraftNote] = useState("");
  const [relativeDateFilter, setRelativeDateFilter] = useState<RelativeDateFilter>("all");
  const isNarrowViewport = useNarrowViewport();
  const [isNarrowBeaconOpen, setIsNarrowBeaconOpen] = useState(false);
  const [pendingBeacon, setPendingBeacon] = useState<PendingBeaconDraft | null>(null);
  const [callTimerNow, setCallTimerNow] = useState(() => Date.now());
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const noteComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousListStateRef = useRef<{ geohash: string; tailNoteId?: string }>({
    geohash: "",
    tailNoteId: undefined
  });
  const {
    activeCall,
    currentUser,
    createBeacon,
    createPlaceNote,
    getBeacon,
    getBeaconParticipants,
    getNote,
    getProfile,
    joinBeaconCall,
    listBeaconThreads,
    listBeaconTiles,
    listNotesForBeacon,
    relayOperatorPubkey,
    refreshPlaceNotesFromRelay,
    uploadBeaconPicture
  } = useAppState();

  const beaconTiles = listBeaconTiles();
  const beaconThreads = listBeaconThreads();
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
  const selectedBeaconThread = beaconThreads.find((thread) => thread.geohash === selectedBeaconGeohash);
  const selectedPinnedNote = selectedBeacon?.pinnedNoteId ? getNote(selectedBeacon.pinnedNoteId) : undefined;
  const selectedPinnedAuthor = selectedPinnedNote ? getProfile(selectedPinnedNote.authorPubkey) : undefined;
  const selectedNotes = selectedBeaconGeohash
    ? listNotesForBeacon(selectedBeaconGeohash).filter((note) =>
        matchesRelativeDateFilter(note, relativeDateFilter)
      )
    : [];
  const orderedNotes = sortNotesChronologically(selectedNotes);
  const noteGroups = useMemo(() => buildMessageGroups(selectedNotes), [selectedNotes]);
  const tailNoteId = orderedNotes.at(-1)?.id;
  const isCreationSheetVisible = Boolean(pendingBeacon);
  // Keep the desktop chat rail mounted while the pending beacon sheet is open.
  // Swapping out the split layout remounts MapPreview and forces a full map reload.
  const isChatVisible = !isNarrowViewport || (!isCreationSheetVisible && isNarrowBeaconOpen);
  const shouldShowMap = isCreationSheetVisible || !isNarrowViewport || !isNarrowBeaconOpen;
  const activeCallDuration = formatCallDuration(activeCall?.startedAt, callTimerNow);
  const selectedParticipants = selectedBeacon ? getBeaconParticipants(selectedBeacon.geohash) : [];
  const isRelayOperator = currentUser.pubkey === relayOperatorPubkey;
  const connectedRoomParticipants =
    selectedBeacon && activeCall?.roomID === selectedBeacon.roomID
      ? activeCall.participantStates
          .filter((participant) => participant.pubkey !== currentUser.pubkey)
          .map((participant) => getProfile(participant.pubkey) ?? createFallbackParticipantProfile(participant.pubkey))
      : [];

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

  function handleSubmitNote() {
    if (!selectedBeaconGeohash) {
      return;
    }

    const nextNote = createPlaceNote(selectedBeaconGeohash, draftNote);
    if (nextNote) {
      setDraftNote("");
    }
  }

  function handleNoteComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    handleSubmitNote();
  }

  function handleMessageAction(action: "react" | "reply") {
    showToast(
      action === "react" ? "Message reactions are not wired yet." : "Threaded replies are not wired yet.",
      "info"
    );
  }

  async function handleSetParticipantSpeakerMode(pubkey: string, mode: "speaker" | "listener") {
    if (!selectedBeacon) {
      return;
    }

    try {
      const record = await grantRoomPermission(pubkey, selectedBeacon.roomID, {
        canJoin: true,
        canPublish: mode === "speaker",
        canSubscribe: true
      });
      showToast(
        mode === "speaker"
          ? `Speaker mode enabled for ${record.subject_pubkey}.`
          : `Listener-only mode enabled for ${record.subject_pubkey}.`,
        "info"
      );
      if (record.live_sync_warning) {
        showToast(`Live room update failed: ${record.live_sync_warning}`, "error");
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to update room permissions right now.",
        "error"
      );
    }
  }

  useLayoutEffect(() => {
    const composer = noteComposerRef.current;
    if (!composer) {
      return;
    }

    composer.style.height = "0px";
    const nextHeight = Math.min(composer.scrollHeight, maxWorldChatInputHeightPx);
    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY = composer.scrollHeight > maxWorldChatInputHeightPx ? "auto" : "hidden";
  }, [draftNote, selectedBeaconGeohash]);

  useLayoutEffect(() => {
    const messageList = messageListRef.current;
    const previousState = previousListStateRef.current;
    const geohashChanged = previousState.geohash !== selectedBeaconGeohash;
    const tailNoteChanged = previousState.tailNoteId !== tailNoteId;

    if (messageList && (geohashChanged || (tailNoteChanged && shouldStickToBottomRef.current))) {
      messageList.scrollTop = messageList.scrollHeight;
      shouldStickToBottomRef.current = true;
    }

    previousListStateRef.current = {
      geohash: selectedBeaconGeohash,
      tailNoteId
    };
  }, [selectedBeaconGeohash, tailNoteId]);

  useLayoutEffect(() => {
    if (!isChatVisible) {
      return;
    }

    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    messageList.scrollTop = messageList.scrollHeight;
    shouldStickToBottomRef.current = true;
  }, [isChatVisible]);

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
        markerCards={markerCards}
      >
        {pendingBeacon ? (
          <section className="world-sheet world-beacon-sheet" aria-label={`Light beacon ${pendingBeacon.geohash}`}>
            <div className="world-sheet-header">
              <div>
                <p className="tile-kicker">Chosen place {pendingBeacon.geohash}</p>
                <h3>{pendingBeacon.step === "prompt" ? "No beacon is lit here yet." : "Light a beacon here."}</h3>
                <p className="muted">
                  {pendingBeacon.step === "prompt"
                    ? "Light one to create a shared place tied to this exact tile."
                    : "Choose a clear name. This beacon will stay tied to this exact tile."}
                </p>
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
      </MapPreview>
    </div>
  ) : null;

  const chatPanel = isChatVisible ? (
    <aside className="panel route-surface route-surface-chats world-route-chat-panel">
      {selectedBeacon ? (
        <div className="thread-detail world-chat-thread">
          <div className="detail-header world-chat-header">
            <div className="world-chat-header-main">
              <button
                className="beacon-avatar-button"
                type="button"
                aria-label={`Show ${selectedBeacon.name} on the map`}
                onClick={() => focusBeaconOnMap(selectedBeacon.geohash)}
              >
                <BeaconAvatar
                  picture={selectedBeacon.avatarUrl}
                  label={selectedBeacon.name}
                  fallbackLabel={selectedBeacon.name}
                  className="beacon-avatar beacon-avatar-large"
                />
              </button>
              <div className="world-chat-header-title">
                <h3>
                  <Link className="world-chat-header-link" to={`?beacon=${encodeURIComponent(selectedBeacon.geohash)}`}>
                    {selectedBeacon.name}
                  </Link>
                </h3>
              </div>
              <div className="world-chat-header-balance" aria-hidden="true" />
            </div>
            <div className="world-chat-header-actions">
              <button
                className="call-control-button world-chat-call-button"
                type="button"
                aria-label={selectedBeacon.cohort ? "Join as listener" : "Join call"}
                title={selectedBeacon.cohort ? "Join as listener" : "Join call"}
                onClick={() => joinBeaconCall(selectedBeacon.geohash)}
              >
                <span className="call-control-icon" aria-hidden="true">
                  <JoinCallIcon />
                </span>
              </button>
            </div>
          </div>

          {selectedBeacon.cohort ? (
            <CohortBeaconPanel
              metadata={selectedBeacon.cohort}
              pinnedNote={selectedPinnedNote}
              pinnedAuthor={selectedPinnedAuthor}
              participantCount={selectedParticipants.length}
            />
          ) : null}

          {selectedBeacon.cohort && isRelayOperator && activeCall?.roomID === selectedBeacon.roomID ? (
            <CohortHostControls
              roomID={selectedBeacon.roomID}
              participants={connectedRoomParticipants}
              onSetSpeakerMode={handleSetParticipantSpeakerMode}
            />
          ) : null}

          <div
            ref={messageListRef}
            className="note-list world-chat-messages"
            onScroll={(event) => {
              shouldStickToBottomRef.current = isScrolledToBottom(event.currentTarget);
            }}
          >
            {noteGroups.length === 0 && relativeDateFilter !== "all" ? (
              <p className="world-chat-empty-state muted">
                No messages in the{" "}
                {relativeDateFilterOptions.find((option) => option.value === relativeDateFilter)?.longLabel.toLowerCase()}
                .
              </p>
            ) : null}
            {noteGroups.map((group) => {
              const author = getProfile(group.authorPubkey);
              const authorLabel = resolveBeaconChatAuthorLabel(author, group.authorPubkey);
              const firstMessage = group.messages[0];

              return (
                <article key={firstMessage.id} className="world-chat-message-group">
                  <header className="world-chat-message-group-header">
                    <Link
                      className="world-chat-message-author world-chat-message-author-link"
                      to={`/app/pulse?profile=${encodeURIComponent(group.authorPubkey)}`}
                    >
                      <BeaconAvatar
                        picture={author?.picture}
                        label={authorLabel}
                        fallbackLabel={authorLabel}
                        className="participant-avatar"
                      />
                      <div className="world-chat-message-author-meta">
                        <strong>{authorLabel}</strong>
                        <p className="tile-kicker">{abbreviateBeaconChatPubkey(group.authorPubkey)}</p>
                      </div>
                    </Link>
                    <div className="world-chat-message-meta">
                      <p className="tile-kicker">{formatRelativeTime(firstMessage.createdAt)}</p>
                    </div>
                    {selectedBeaconThread?.pinnedNoteId === firstMessage.id ? <span className="thread-pill">Pinned</span> : null}
                  </header>
                  <div className="world-chat-message-stack">
                    {group.messages.map((message, index) => (
                      <div
                        key={message.id}
                        className={index === 0 ? "world-chat-message" : "world-chat-message is-grouped"}
                        title={index === 0 ? undefined : formatAbsoluteTime(message.createdAt)}
                        tabIndex={0}
                      >
                        <div className="world-chat-message-content">
                          <p>{message.content}</p>
                          {message.replies > 0 ? <small>{message.replies} threaded replies</small> : null}
                        </div>
                        <div className="world-chat-message-actions" role="group" aria-label={`Message actions for ${authorLabel}`}>
                          <button
                            className="world-chat-message-action"
                            type="button"
                            onClick={() => handleMessageAction("react")}
                          >
                            React
                          </button>
                          <button
                            className="world-chat-message-action"
                            type="button"
                            onClick={() => handleMessageAction("reply")}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <form
            className="world-chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmitNote();
            }}
          >
            <textarea
              ref={noteComposerRef}
              className="note-input world-chat-input"
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              onKeyDown={handleNoteComposerKeyDown}
              placeholder={`Message ${selectedBeacon.name}`}
              rows={1}
            />
          </form>
        </div>
      ) : (
        <article className="feature-card">
          <h3>Select a beacon on the map.</h3>
          <p className="muted">Open a chosen-place beacon to see nearby conversation and join its live call.</p>
        </article>
      )}
    </aside>
  ) : null;

  if (!isNarrowViewport && mapPanel && chatPanel) {
    return (
      <ResizablePanels
        as="section"
        className="world-route world-route-split"
        storageKey="world"
        defaultPrimarySize={860}
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

type BeaconAvatarProps = {
  picture?: string;
  label: string;
  fallbackLabel: string;
  className: string;
};

function BeaconAvatar({ picture, label, fallbackLabel, className }: BeaconAvatarProps) {
  if (picture) {
    return <img className={className} src={picture} alt={label} loading="lazy" />;
  }

  const initials = fallbackLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className={`${className} participant-avatar-fallback`} aria-hidden="true">
      {initials || label.slice(0, 2).toUpperCase()}
    </div>
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

function truncateDetailLine(value: string, maxLength = 48) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

function JoinCallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.87 19.87 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.87 19.87 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.89.33 1.76.63 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.15a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.6.63A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
