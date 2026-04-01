import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

import { grantRoomPermission } from "../admin-client";
import { useAppState } from "../app-state";
import type { Beacon, BeaconThread } from "../beacon-projection";
import { ActiveCallMediaStreams } from "../components/call-overlay";
import {
  createFallbackParticipantProfile,
  isConnectedLiveKitCall,
  pulseNetworkGeohash,
  pulseNetworkPlaceTitle,
  sortNotesChronologically,
  type GeoNote,
  type ParticipantProfile
} from "../data";
import { useNarrowViewport } from "../hooks/use-viewport";
import { queryAuthorKindOneNotes, queryProfileMetadata, type ProfileMetadataContent } from "../nostr";
import { showToast } from "../toast";
import { CohortBeaconPanel, CohortHostControls } from "./cohort-panels";

type BeaconMessageGroup = {
  authorPubkey: string;
  messages: GeoNote[];
};

export type RelativeDateFilter = "hour" | "day" | "week" | "month" | "year" | "all";

type BeaconThreadPanelProps = {
  beaconGeohash: string;
  relativeDateFilter?: RelativeDateFilter;
  className?: string;
  avatarActionLabel: string;
  onActivateBeacon: (geohash: string) => void;
};

type BeaconAvatarProps = {
  picture?: string;
  label: string;
  fallbackLabel: string;
  className: string;
};

type ProfileMetadataDialogState = {
  pubkey: string;
  status: "loading" | "ready" | "error";
  metadata: ProfileMetadataContent | null;
  error: string | null;
  latestPostsStatus: "loading" | "ready" | "error";
  latestPosts: GeoNote[];
  latestPostsError: string | null;
};

type BeaconDialogState = "people" | "settings" | null;

type BeaconPerson = {
  pubkey: string;
  label: string;
  picture?: string;
  isOwner: boolean;
  isLive: boolean;
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
const maxBeaconChatInputHeightPx = 176;
const mobileMessageLongPressMs = 450;
const mobileMessageLongPressCancelDistancePx = 10;
const emojiReactionOptions = ["👍", "❤️", "😂", "🔥", "🎯"] as const;

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function dedupePubkeys(pubkeys: Array<string | undefined>) {
  return Array.from(new Set(pubkeys.map((pubkey) => pubkey?.trim() ?? "").filter(Boolean)));
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

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
    if (trimmed.length <= 12) {
      return trimmed;
    }

    return `npub${trimmed.slice(4, 12)}...`;
  }

  return trimmed.slice(0, 8);
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

function truncateReplyPreview(content: string, maxLength = 72) {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function resolveBeaconChatAuthorLabel(author: ParticipantProfile | undefined, pubkey: string) {
  return author?.displayName || author?.name || abbreviateBeaconChatPubkey(pubkey);
}

function useDialogEscape(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);
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

export function BeaconThreadPanel({
  beaconGeohash,
  relativeDateFilter = "all",
  className,
  avatarActionLabel,
  onActivateBeacon
}: BeaconThreadPanelProps) {
  const isNarrowViewport = useNarrowViewport();
  const {
    activeCall,
    currentUser,
    createPlaceNote,
    getBeacon,
    getBeaconParticipants,
    getNote,
    getProfile,
    isPubkeyFollowed,
    joinBeaconCall,
    leaveBeaconCall,
    listBeaconThreads,
    listNotesForBeacon,
    reactToPlaceNote,
    relayOperatorPubkey,
    relayURL,
    setPubkeyFollowed
  } = useAppState();

  const [draftNote, setDraftNote] = useState("");
  const [replyTargetNoteId, setReplyTargetNoteId] = useState<string | null>(null);
  const [openReactionNoteId, setOpenReactionNoteId] = useState<string | null>(null);
  const [openMessageActionNoteId, setOpenMessageActionNoteId] = useState<string | null>(null);
  const [openBeaconDialog, setOpenBeaconDialog] = useState<BeaconDialogState>(null);
  const [profileMetadataDialog, setProfileMetadataDialog] = useState<ProfileMetadataDialogState | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const noteComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingMessageLongPressRef = useRef<{
    noteId: string;
    originX: number;
    originY: number;
    timeoutId: number;
  } | null>(null);
  const previousListStateRef = useRef<{ geohash: string; tailNoteId?: string }>({
    geohash: "",
    tailNoteId: undefined
  });

  const beacon = getBeacon(beaconGeohash);
  const connectedActiveCall = isConnectedLiveKitCall(activeCall) ? activeCall : null;
  const selectedBeaconThread = listBeaconThreads().find((thread) => thread.geohash === beaconGeohash);
  const selectedPinnedNote = beacon?.pinnedNoteId ? getNote(beacon.pinnedNoteId) : undefined;
  const selectedPinnedAuthor = selectedPinnedNote ? getProfile(selectedPinnedNote.authorPubkey) : undefined;
  const selectedParticipants = beacon ? getBeaconParticipants(beacon.geohash) : [];
  const explicitMemberPubkeys = dedupePubkeys([
    selectedBeaconThread?.ownerPubkey,
    ...(selectedBeaconThread?.memberPubkeys ?? [])
  ]);
  const fallbackPeoplePubkeys = dedupePubkeys(selectedParticipants.map((participant) => participant.pubkey));
  const beaconPeoplePubkeys = explicitMemberPubkeys.length > 0 ? explicitMemberPubkeys : fallbackPeoplePubkeys;
  const beaconPeopleUsesLiveFallback = explicitMemberPubkeys.length === 0 && beaconPeoplePubkeys.length > 0;
  const selectedNotes = listNotesForBeacon(beaconGeohash).filter((note) =>
    matchesRelativeDateFilter(note, relativeDateFilter)
  );
  const orderedNotes = sortNotesChronologically(selectedNotes);
  const noteGroups = useMemo(() => buildMessageGroups(selectedNotes), [selectedNotes]);
  const tailNoteId = orderedNotes.at(-1)?.id;
  const replyTargetNote = replyTargetNoteId ? getNote(replyTargetNoteId) : undefined;
  const replyTargetAuthor = replyTargetNote ? getProfile(replyTargetNote.authorPubkey) : undefined;
  const selectedMetadataPubkey = profileMetadataDialog?.pubkey ?? null;
  const selectedMetadataAuthor = selectedMetadataPubkey ? getProfile(selectedMetadataPubkey) : undefined;
  const canFollowSelectedMetadata = Boolean(
    selectedMetadataPubkey && selectedMetadataPubkey.trim() !== currentUser.pubkey.trim()
  );
  const isSelectedMetadataFollowed = selectedMetadataPubkey ? isPubkeyFollowed(selectedMetadataPubkey) : false;
  const isRelayOperator = currentUser.pubkey === relayOperatorPubkey;
  const isSelectedBeaconInActiveCall = Boolean(beacon && connectedActiveCall?.geohash === beacon.geohash);
  const selectedBeaconActiveRoomID =
    beacon && connectedActiveCall?.geohash === beacon.geohash ? connectedActiveCall.roomID : beacon?.roomID;
  const liveParticipantPubkeys = new Set([
    ...selectedParticipants.map((participant) => participant.pubkey),
    ...(beacon && connectedActiveCall?.geohash === beacon.geohash
      ? connectedActiveCall.participantStates.map((participant) => participant.pubkey)
      : [])
  ]);
  const beaconPeople = beaconPeoplePubkeys
    .map<BeaconPerson>((pubkey) => {
      const participant = selectedParticipants.find((candidate) => candidate.pubkey === pubkey);
      const profile = getProfile(pubkey) ?? participant ?? createFallbackParticipantProfile(pubkey);
      const label = resolveBeaconChatAuthorLabel(profile, pubkey);
      const isOwner = selectedBeaconThread?.ownerPubkey?.trim() === pubkey;

      return {
        pubkey,
        label,
        picture: profile.picture,
        isOwner,
        isLive: liveParticipantPubkeys.has(pubkey)
      };
    })
    .sort((left, right) => {
      if (left.isOwner !== right.isOwner) {
        return left.isOwner ? -1 : 1;
      }

      return left.label.localeCompare(right.label);
    });
  const beaconOwner = beaconPeople.find((person) => person.isOwner);
  const connectedRoomParticipants =
    beacon && connectedActiveCall?.geohash === beacon.geohash
      ? connectedActiveCall.participantStates
          .filter((participant) => participant.pubkey !== currentUser.pubkey)
          .map((participant) => getProfile(participant.pubkey) ?? createFallbackParticipantProfile(participant.pubkey))
      : [];

  function clearPendingMessageLongPress() {
    const pendingLongPress = pendingMessageLongPressRef.current;
    if (!pendingLongPress) {
      return;
    }

    window.clearTimeout(pendingLongPress.timeoutId);
    pendingMessageLongPressRef.current = null;
  }

  function handleSubmitNote() {
    if (!beaconGeohash) {
      return;
    }

    const nextNote = replyTargetNote
      ? createPlaceNote(beaconGeohash, draftNote, { replyTo: replyTargetNote })
      : createPlaceNote(beaconGeohash, draftNote);
    if (nextNote) {
      setDraftNote("");
      setReplyTargetNoteId(null);
      setOpenReactionNoteId(null);
      setOpenMessageActionNoteId(null);
    }
  }

  function handleNoteComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    handleSubmitNote();
  }

  function handleReplyToMessage(message: GeoNote) {
    if (!/^[0-9a-f]{64}$/i.test(message.id.trim()) && import.meta.env.MODE !== "test") {
      showToast("Wait for this note to sync from the relay before sending a tagged reply.", "info");
      return;
    }

    setReplyTargetNoteId((current) => (current === message.id ? null : message.id));
    setOpenReactionNoteId(null);
    setOpenMessageActionNoteId(null);
    noteComposerRef.current?.focus();
  }

  function handleToggleReactionPicker(messageID: string) {
    setOpenReactionNoteId((current) => (current === messageID ? null : messageID));
    if (isNarrowViewport) {
      setOpenMessageActionNoteId(messageID);
    }
  }

  function handleReactToMessage(message: GeoNote, emoji: string) {
    reactToPlaceNote(message.id, emoji);
    setOpenReactionNoteId(null);
    setOpenMessageActionNoteId(null);
  }

  function handleMessagePointerDown(messageID: string, event: ReactPointerEvent<HTMLDivElement>) {
    if (!isNarrowViewport || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".world-chat-message-actions, .world-chat-reaction-picker")) {
      return;
    }

    clearPendingMessageLongPress();
    pendingMessageLongPressRef.current = {
      noteId: messageID,
      originX: event.clientX,
      originY: event.clientY,
      timeoutId: window.setTimeout(() => {
        setOpenReactionNoteId((current) => (current && current !== messageID ? null : current));
        setOpenMessageActionNoteId((current) => (current === messageID ? null : messageID));
        pendingMessageLongPressRef.current = null;
      }, mobileMessageLongPressMs)
    };
  }

  function handleMessagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pendingLongPress = pendingMessageLongPressRef.current;
    if (!pendingLongPress) {
      return;
    }

    if (
      pendingLongPress.noteId !== event.currentTarget.dataset.noteId ||
      Math.abs(event.clientX - pendingLongPress.originX) > mobileMessageLongPressCancelDistancePx ||
      Math.abs(event.clientY - pendingLongPress.originY) > mobileMessageLongPressCancelDistancePx
    ) {
      clearPendingMessageLongPress();
    }
  }

  function handleOpenProfileMetadata(pubkey: string) {
    setProfileMetadataDialog({
      pubkey,
      status: "loading",
      metadata: null,
      error: null,
      latestPostsStatus: "loading",
      latestPosts: [],
      latestPostsError: null
    });
  }

  async function handleSetParticipantSpeakerMode(pubkey: string, mode: "speaker" | "listener") {
    if (!selectedBeaconActiveRoomID) {
      return;
    }

    try {
      const record = await grantRoomPermission(pubkey, selectedBeaconActiveRoomID, {
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
    const nextHeight = Math.min(composer.scrollHeight, maxBeaconChatInputHeightPx);
    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY = composer.scrollHeight > maxBeaconChatInputHeightPx ? "auto" : "hidden";
  }, [draftNote, beaconGeohash]);

  useLayoutEffect(() => {
    const messageList = messageListRef.current;
    const previousState = previousListStateRef.current;
    const geohashChanged = previousState.geohash !== beaconGeohash;
    const tailNoteChanged = previousState.tailNoteId !== tailNoteId;

    if (messageList && (geohashChanged || (tailNoteChanged && shouldStickToBottomRef.current))) {
      messageList.scrollTop = messageList.scrollHeight;
      shouldStickToBottomRef.current = true;
    }

    previousListStateRef.current = {
      geohash: beaconGeohash,
      tailNoteId
    };
  }, [beaconGeohash, tailNoteId]);

  useEffect(() => {
    setReplyTargetNoteId(null);
    setOpenReactionNoteId(null);
    setOpenMessageActionNoteId(null);
    setOpenBeaconDialog(null);
    clearPendingMessageLongPress();
  }, [beaconGeohash]);

  useEffect(() => {
    if (!isNarrowViewport) {
      clearPendingMessageLongPress();
      setOpenMessageActionNoteId(null);
    }
  }, [isNarrowViewport]);

  useEffect(() => {
    return () => {
      clearPendingMessageLongPress();
    };
  }, []);

  useEffect(() => {
    if (!selectedMetadataPubkey) {
      return;
    }

    let cancelled = false;

    void queryProfileMetadata(relayURL, [selectedMetadataPubkey])
      .then((metadataByPubkey) => {
        if (cancelled) {
          return;
        }

        setProfileMetadataDialog((current) =>
          current && current.pubkey === selectedMetadataPubkey
            ? {
                pubkey: selectedMetadataPubkey,
                status: "ready",
                metadata: metadataByPubkey.get(selectedMetadataPubkey) ?? null,
                error: null,
                latestPostsStatus: current.latestPostsStatus,
                latestPosts: current.latestPosts,
                latestPostsError: current.latestPostsError
              }
            : current
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setProfileMetadataDialog((current) =>
          current && current.pubkey === selectedMetadataPubkey
            ? {
                pubkey: selectedMetadataPubkey,
                status: "error",
                metadata: null,
                error: error instanceof Error ? error.message : "Unable to load kind 0 metadata.",
                latestPostsStatus: current.latestPostsStatus,
                latestPosts: current.latestPosts,
                latestPostsError: current.latestPostsError
              }
            : current
        );
      });

    void queryAuthorKindOneNotes(relayURL, selectedMetadataPubkey, { limit: 3 })
      .then((latestPosts) => {
        if (cancelled) {
          return;
        }

        setProfileMetadataDialog((current) =>
          current && current.pubkey === selectedMetadataPubkey
            ? {
                ...current,
                latestPostsStatus: "ready",
                latestPosts,
                latestPostsError: null
              }
            : current
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setProfileMetadataDialog((current) =>
          current && current.pubkey === selectedMetadataPubkey
            ? {
                ...current,
                latestPostsStatus: "error",
                latestPosts: [],
                latestPostsError: error instanceof Error ? error.message : "Unable to load recent kind 1 posts."
              }
            : current
        );
      });

    return () => {
      cancelled = true;
    };
  }, [relayURL, selectedMetadataPubkey]);

  if (!beacon) {
    return null;
  }

  return (
    <div className={joinClassNames("thread-detail world-chat-thread", className)}>
      <div className="detail-header world-chat-header">
        <div className="world-chat-header-main">
          <button
            className="beacon-avatar-button"
            type="button"
            aria-label={avatarActionLabel}
            onClick={() => onActivateBeacon(beacon.geohash)}
          >
            <BeaconAvatar
              picture={beacon.avatarUrl}
              label={beacon.name}
              fallbackLabel={beacon.name}
              className="beacon-avatar"
            />
          </button>
        </div>
        <div className="world-chat-header-actions">
          <button
            className="call-control-button world-chat-people-button"
            type="button"
            aria-label="Open people"
            title="Open people"
            onClick={() => setOpenBeaconDialog("people")}
          >
            <span className="call-control-icon" aria-hidden="true">
              <PeopleIcon />
            </span>
          </button>
          <button
            className="call-control-button world-chat-settings-button"
            type="button"
            aria-label="Open beacon settings"
            title="Open beacon settings"
            onClick={() => setOpenBeaconDialog("settings")}
          >
            <span className="call-control-icon" aria-hidden="true">
              <SettingsIcon />
            </span>
          </button>
          <button
            className={
              isSelectedBeaconInActiveCall
                ? "call-control-button danger world-chat-leave-button"
                : "call-control-button world-chat-call-button"
            }
            type="button"
            aria-label={isSelectedBeaconInActiveCall ? "Leave call" : beacon.cohort ? "Join as listener" : "Join call"}
            title={isSelectedBeaconInActiveCall ? "Leave call" : beacon.cohort ? "Join as listener" : "Join call"}
            onClick={() => (isSelectedBeaconInActiveCall ? leaveBeaconCall() : joinBeaconCall(beacon.geohash))}
          >
            <span className="call-control-icon" aria-hidden="true">
              {isSelectedBeaconInActiveCall ? <LeaveCallIcon /> : <JoinCallIcon />}
            </span>
          </button>
        </div>
      </div>

      {isSelectedBeaconInActiveCall ? (
        <section className="world-chat-live-stage" aria-label="Beacon live media section">
          <ActiveCallMediaStreams className="call-stream-grid world-chat-stream-grid" includeLocal regionLabel="Beacon call media streams" />
        </section>
      ) : null}

      {beacon.cohort ? (
        <CohortBeaconPanel
          metadata={beacon.cohort}
          pinnedNote={selectedPinnedNote}
          pinnedAuthor={selectedPinnedAuthor}
          participantCount={selectedParticipants.length}
        />
      ) : null}

      {beacon.cohort && isRelayOperator && isSelectedBeaconInActiveCall && selectedBeaconActiveRoomID ? (
        <CohortHostControls
          roomID={selectedBeaconActiveRoomID}
          participants={connectedRoomParticipants}
          onSetSpeakerMode={handleSetParticipantSpeakerMode}
        />
      ) : null}

      <div
        ref={messageListRef}
        className="note-list world-chat-messages"
        onScroll={(event) => {
          clearPendingMessageLongPress();
          shouldStickToBottomRef.current = isScrolledToBottom(event.currentTarget);
        }}
      >
        {noteGroups.length === 0 && relativeDateFilter !== "all" ? (
          <p className="world-chat-empty-state muted">
            No messages in the{" "}
            {relativeDateFilterOptions.find((option) => option.value === relativeDateFilter)?.longLabel.toLowerCase()}.
          </p>
        ) : null}
        {noteGroups.map((group) => {
          const author = getProfile(group.authorPubkey);
          const authorLabel = resolveBeaconChatAuthorLabel(author, group.authorPubkey);
          const firstMessage = group.messages[0];

          return (
            <article key={firstMessage.id} className="world-chat-message-group">
              <header className="world-chat-message-group-header">
                <button
                  className="world-chat-message-author world-chat-message-author-link"
                  type="button"
                  onClick={() => handleOpenProfileMetadata(group.authorPubkey)}
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
                </button>
                <div className="world-chat-message-meta">
                  <p className="tile-kicker">{formatRelativeTime(firstMessage.createdAt)}</p>
                </div>
                {selectedBeaconThread?.pinnedNoteId && selectedBeaconThread.pinnedNoteId === firstMessage.id ? (
                  <span className="thread-pill">Pinned</span>
                ) : null}
              </header>
              <div className="world-chat-message-stack">
                {group.messages.map((message, index) => (
                  (() => {
                    const repliedToNote = message.replyTargetId ? getNote(message.replyTargetId) : undefined;
                    const repliedToAuthor = repliedToNote ? getProfile(repliedToNote.authorPubkey) : undefined;
                    const repliedToLabel = repliedToNote
                      ? resolveBeaconChatAuthorLabel(repliedToAuthor, repliedToNote.authorPubkey)
                      : "earlier message";
                    const isMessageActionOpen = openMessageActionNoteId === message.id || openReactionNoteId === message.id;

                    return (
                      <div
                        key={message.id}
                        className={joinClassNames(
                          index === 0 ? "world-chat-message" : "world-chat-message is-grouped",
                          isMessageActionOpen ? "is-actions-open" : undefined
                        )}
                        title={index === 0 ? undefined : formatAbsoluteTime(message.createdAt)}
                        tabIndex={0}
                        data-note-id={message.id}
                        onPointerDown={(event) => handleMessagePointerDown(message.id, event)}
                        onPointerMove={handleMessagePointerMove}
                        onPointerUp={clearPendingMessageLongPress}
                        onPointerCancel={clearPendingMessageLongPress}
                        onPointerLeave={clearPendingMessageLongPress}
                      >
                        <div className="world-chat-message-content">
                          {message.replyTargetId ? (
                            <small className="world-chat-message-context">
                              Replying to {repliedToLabel}
                              {repliedToNote ? ` · ${truncateReplyPreview(repliedToNote.content)}` : ""}
                            </small>
                          ) : null}
                          <p>{message.content}</p>
                          {message.reactions && message.reactions.length > 0 ? (
                            <div className="world-chat-reaction-row" aria-label={`Emoji reactions for ${authorLabel}`}>
                              {message.reactions.map((reaction) => (
                                <span key={`${message.id}-${reaction.emoji}`} className="world-chat-reaction-pill">
                                  <span aria-hidden="true">{reaction.emoji}</span>
                                  <small>{reaction.count}</small>
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {message.replies > 0 ? <small>{message.replies} threaded replies</small> : null}
                        </div>
                        <div className="world-chat-message-actions" role="group" aria-label={`Message actions for ${authorLabel}`}>
                          <button
                            className="world-chat-message-action"
                            type="button"
                            onClick={() => handleToggleReactionPicker(message.id)}
                          >
                            React
                          </button>
                          <button
                            className="world-chat-message-action"
                            type="button"
                            onClick={() => handleReplyToMessage(message)}
                          >
                            Reply
                          </button>
                        </div>
                        {openReactionNoteId === message.id ? (
                          <div className="world-chat-reaction-picker" role="group" aria-label={`React to ${authorLabel}`}>
                            {emojiReactionOptions.map((emoji) => (
                              <button
                                key={`${message.id}-${emoji}`}
                                className="world-chat-reaction-option"
                                type="button"
                                aria-label={`React with ${emoji}`}
                                onClick={() => handleReactToMessage(message, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
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
        {replyTargetNote ? (
          <div className="world-chat-reply-banner" aria-label="Reply target">
            <div className="world-chat-reply-banner-copy">
              <strong>Replying to {resolveBeaconChatAuthorLabel(replyTargetAuthor, replyTargetNote.authorPubkey)}</strong>
              <p>{truncateReplyPreview(replyTargetNote.content)}</p>
            </div>
            <button
              className="world-chat-reply-cancel"
              type="button"
              onClick={() => setReplyTargetNoteId(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}
        <textarea
          ref={noteComposerRef}
          className="note-input world-chat-input"
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
          onKeyDown={handleNoteComposerKeyDown}
          placeholder={`Message ${beacon.name}`}
          rows={1}
        />
      </form>

      {profileMetadataDialog ? (
        <ProfileMetadataDialog
          author={selectedMetadataAuthor}
          dialogState={profileMetadataDialog}
          canFollow={canFollowSelectedMetadata}
          isFollowed={isSelectedMetadataFollowed}
          onToggleFollow={() => {
            if (!selectedMetadataPubkey) {
              return;
            }

            setPubkeyFollowed(selectedMetadataPubkey, !isSelectedMetadataFollowed);
          }}
          onClose={() => setProfileMetadataDialog(null)}
        />
      ) : null}
      {openBeaconDialog === "people" ? (
        <BeaconPeopleDialog
          beacon={beacon}
          people={beaconPeople}
          usingLiveFallback={beaconPeopleUsesLiveFallback}
          onClose={() => setOpenBeaconDialog(null)}
        />
      ) : null}
      {openBeaconDialog === "settings" ? (
        <BeaconSettingsDialog
          beacon={beacon}
          thread={selectedBeaconThread}
          owner={beaconOwner}
          pinnedNote={selectedPinnedNote}
          peopleCount={beaconPeople.length}
          usingLiveFallback={beaconPeopleUsesLiveFallback}
          liveParticipantCount={selectedParticipants.length}
          onClose={() => setOpenBeaconDialog(null)}
        />
      ) : null}
    </div>
  );
}

type ProfileMetadataDialogProps = {
  author?: ParticipantProfile;
  dialogState: ProfileMetadataDialogState;
  canFollow: boolean;
  isFollowed: boolean;
  onToggleFollow: () => void;
  onClose: () => void;
};

function ProfileMetadataDialog({
  author,
  dialogState,
  canFollow,
  isFollowed,
  onToggleFollow,
  onClose
}: ProfileMetadataDialogProps) {
  const authorLabel = resolveBeaconChatAuthorLabel(author, dialogState.pubkey);
  const metadataJSON = dialogState.metadata ? JSON.stringify(dialogState.metadata, null, 2) : null;

  useDialogEscape(onClose);

  return (
    <div className="profile-metadata-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="profile-metadata-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-metadata-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-header profile-metadata-dialog-header">
          <div className="profile-metadata-dialog-identity">
            <BeaconAvatar
              picture={author?.picture}
              label={authorLabel}
              fallbackLabel={authorLabel}
              className="participant-avatar"
            />
            <div className="marker-participant-meta">
              <h3 id="profile-metadata-title">{authorLabel}</h3>
              <p className="tile-kicker">{dialogState.pubkey}</p>
            </div>
          </div>
        </div>

        <div className="profile-metadata-dialog-body">
          {canFollow ? (
            <div className="action-row profile-metadata-dialog-actions">
              <button
                className="secondary-button"
                type="button"
                aria-pressed={isFollowed}
                onClick={onToggleFollow}
              >
                {isFollowed ? "Following" : "Follow"}
              </button>
            </div>
          ) : null}

          {dialogState.status === "loading" ? (
            <p className="muted">Loading kind 0 metadata from the current relay.</p>
          ) : null}

          {dialogState.status === "error" ? (
            <p className="muted">{dialogState.error ?? "Unable to load kind 0 metadata."}</p>
          ) : null}

          {dialogState.status === "ready" && !dialogState.metadata ? (
            <p className="muted">No kind 0 metadata found for this pubkey on the current relay.</p>
          ) : null}

          {dialogState.status === "ready" && dialogState.metadata ? (
            <>
              <div className="profile-metadata-dialog-grid">
                {typeof dialogState.metadata.name === "string" && dialogState.metadata.name.trim() ? (
                  <article className="mini-card">
                    <strong>Name</strong>
                    <p>{dialogState.metadata.name}</p>
                  </article>
                ) : null}
                {typeof dialogState.metadata.picture === "string" && dialogState.metadata.picture.trim() ? (
                  <article className="mini-card">
                    <strong>Picture</strong>
                    <p>{dialogState.metadata.picture}</p>
                  </article>
                ) : null}
                {typeof dialogState.metadata.about === "string" && dialogState.metadata.about.trim() ? (
                  <article className="mini-card">
                    <strong>About</strong>
                    <p>{dialogState.metadata.about}</p>
                  </article>
                ) : null}
              </div>
              <pre className="profile-metadata-dialog-json">{metadataJSON}</pre>
            </>
          ) : null}

          <section className="profile-metadata-dialog-posts">
            <div className="detail-header">
              <div>
                <h4>Latest kind 1 posts</h4>
              </div>
            </div>

            {dialogState.latestPostsStatus === "loading" ? (
              <p className="muted">Loading latest kind 1 posts from the current relay.</p>
            ) : null}

            {dialogState.latestPostsStatus === "error" ? (
              <p className="muted">{dialogState.latestPostsError ?? "Unable to load recent kind 1 posts."}</p>
            ) : null}

            {dialogState.latestPostsStatus === "ready" && dialogState.latestPosts.length === 0 ? (
              <p className="muted">No recent kind 1 posts found for this pubkey on the current relay.</p>
            ) : null}

            {dialogState.latestPostsStatus === "ready" && dialogState.latestPosts.length > 0 ? (
              <div className="note-list">
                {dialogState.latestPosts.map((post) => (
                  <article key={post.id} className="mini-card">
                    <p>{post.content}</p>
                    <small>
                      {formatRelativeTime(post.createdAt)} ·{" "}
                      {post.geohash === pulseNetworkGeohash ? pulseNetworkPlaceTitle : post.geohash}
                    </small>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

type BeaconPeopleDialogProps = {
  beacon: Beacon;
  people: BeaconPerson[];
  usingLiveFallback: boolean;
  onClose: () => void;
};

function BeaconPeopleDialog({ beacon, people, usingLiveFallback, onClose }: BeaconPeopleDialogProps) {
  useDialogEscape(onClose);

  return (
    <div className="thread-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="thread-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beacon-people-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-header thread-modal-header">
          <div className="thread-modal-identity">
            <BeaconAvatar
              picture={beacon.avatarUrl}
              label={beacon.name}
              fallbackLabel={beacon.name}
              className="beacon-avatar-large"
            />
            <div className="marker-participant-meta">
              <p className="section-label">People</p>
              <h3 id="beacon-people-title">People in {beacon.name}</h3>
              <p className="tile-kicker">{beacon.geohash}</p>
            </div>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="thread-modal-body">
          <p className="muted">
            {usingLiveFallback
              ? "No explicit member roster is published for this beacon yet. Showing the people currently present."
              : `${formatCountLabel(people.length, "person", "people")} in this beacon.`}
          </p>

          {people.length > 0 ? (
            <ul className="beacon-people-list">
              {people.map((person) => (
                <li key={person.pubkey} className="mini-card beacon-person-row">
                  <div className="beacon-person-identity">
                    <BeaconAvatar
                      picture={person.picture}
                      label={person.label}
                      fallbackLabel={person.label}
                      className="participant-avatar"
                    />
                    <div className="beacon-person-copy">
                      <strong>{person.label}</strong>
                      <p className="tile-kicker">{person.pubkey}</p>
                    </div>
                  </div>
                  <div className="beacon-person-pills">
                    {person.isOwner ? <span className="thread-pill">Owner</span> : null}
                    {!usingLiveFallback && !person.isOwner ? <span className="thread-pill">Member</span> : null}
                    {person.isLive ? <span className="thread-pill live">Live</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No beacon members are listed yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

type BeaconSettingsDialogProps = {
  beacon: Beacon;
  thread?: BeaconThread;
  owner?: BeaconPerson;
  pinnedNote?: GeoNote;
  peopleCount: number;
  usingLiveFallback: boolean;
  liveParticipantCount: number;
  onClose: () => void;
};

function BeaconSettingsDialog({
  beacon,
  thread,
  owner,
  pinnedNote,
  peopleCount,
  usingLiveFallback,
  liveParticipantCount,
  onClose
}: BeaconSettingsDialogProps) {
  useDialogEscape(onClose);

  return (
    <div className="thread-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="thread-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="beacon-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-header thread-modal-header">
          <div className="thread-modal-identity">
            <BeaconAvatar
              picture={beacon.avatarUrl}
              label={beacon.name}
              fallbackLabel={beacon.name}
              className="beacon-avatar-large"
            />
            <div className="marker-participant-meta">
              <p className="section-label">Beacon settings</p>
              <h3 id="beacon-settings-title">Beacon settings for {beacon.name}</h3>
              <p className="tile-kicker">{beacon.geohash}</p>
            </div>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="thread-modal-body">
          <div className="beacon-settings-grid">
            <article className="mini-card">
              <strong>Name</strong>
              <p>{beacon.name}</p>
            </article>
            <article className="mini-card">
              <strong>Geohash</strong>
              <p>{beacon.geohash}</p>
            </article>
            <article className="mini-card">
              <strong>Room</strong>
              <p>{beacon.roomID}</p>
            </article>
            <article className="mini-card">
              <strong>People</strong>
              <p>{formatCountLabel(peopleCount, "person", "people")}</p>
              <small>{usingLiveFallback ? "Live participants" : "Published member roster"}</small>
            </article>
            <article className="mini-card">
              <strong>Live now</strong>
              <p>{formatCountLabel(liveParticipantCount, "person", "people")}</p>
            </article>
            <article className="mini-card">
              <strong>Messages</strong>
              <p>{formatCountLabel(thread?.noteCount ?? 0, "message")}</p>
            </article>
            {owner ? (
              <article className="mini-card">
                <strong>Owner</strong>
                <p>{owner.label}</p>
                <small>{owner.pubkey}</small>
              </article>
            ) : null}
            {thread?.createdAt ? (
              <article className="mini-card">
                <strong>Created</strong>
                <p>{formatAbsoluteTime(thread.createdAt)}</p>
              </article>
            ) : null}
          </div>

          <article className="mini-card beacon-settings-panel">
            <strong>About</strong>
            <p>{beacon.about}</p>
          </article>

          <article className="mini-card beacon-settings-panel">
            <strong>Pinned note</strong>
            <p>{pinnedNote ? truncateReplyPreview(pinnedNote.content, 160) : "No pinned note set."}</p>
          </article>

          {beacon.cohort ? (
            <article className="mini-card beacon-settings-panel">
              <strong>Cohort mode</strong>
              <p>{beacon.cohort.summary}</p>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BeaconAvatar({ picture, label, fallbackLabel, className }: BeaconAvatarProps) {
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

function JoinCallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.87 19.87 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.87 19.87 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.89.33 1.76.63 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.15a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.6.63A2 2 0 0 1 22 16.92Z" />
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

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.5 1.5 0 0 0 .3 1.65l.05.05a1.8 1.8 0 0 1 0 2.55 1.8 1.8 0 0 1-2.55 0l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37V20.5a1.8 1.8 0 0 1-1.8 1.8 1.8 1.8 0 0 1-1.8-1.8v-.08a1.5 1.5 0 0 0-.97-1.4 1.5 1.5 0 0 0-1.65.3l-.05.05a1.8 1.8 0 0 1-2.55 0 1.8 1.8 0 0 1 0-2.55l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H3.5a1.8 1.8 0 0 1-1.8-1.8 1.8 1.8 0 0 1 1.8-1.8h.08a1.5 1.5 0 0 0 1.4-.97 1.5 1.5 0 0 0-.3-1.65l-.05-.05a1.8 1.8 0 0 1 0-2.55 1.8 1.8 0 0 1 2.55 0l.05.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .83-1.37V3.5a1.8 1.8 0 0 1 1.8-1.8 1.8 1.8 0 0 1 1.8 1.8v.08a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05a1.8 1.8 0 0 1 2.55 0 1.8 1.8 0 0 1 0 2.55l-.05.05a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.83h.08a1.8 1.8 0 0 1 1.8 1.8 1.8 1.8 0 0 1-1.8 1.8h-.08a1.5 1.5 0 0 0-1.37.9Z" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
