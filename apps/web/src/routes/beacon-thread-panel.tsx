import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";

import { grantRoomPermission } from "../admin-client";
import { useAppState } from "../app-state";
import { ActiveCallMediaStreams } from "../components/call-overlay";
import { createFallbackParticipantProfile, sortNotesChronologically, type GeoNote, type ParticipantProfile } from "../data";
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
const emojiReactionOptions = ["👍", "❤️", "😂", "🔥", "🎯"] as const;

function joinClassNames(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
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
  const {
    activeCall,
    currentUser,
    createPlaceNote,
    getBeacon,
    getBeaconParticipants,
    getNote,
    getProfile,
    joinBeaconCall,
    leaveBeaconCall,
    listBeaconThreads,
    listNotesForBeacon,
    reactToPlaceNote,
    relayOperatorPubkey
  } = useAppState();

  const [draftNote, setDraftNote] = useState("");
  const [replyTargetNoteId, setReplyTargetNoteId] = useState<string | null>(null);
  const [openReactionNoteId, setOpenReactionNoteId] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const noteComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousListStateRef = useRef<{ geohash: string; tailNoteId?: string }>({
    geohash: "",
    tailNoteId: undefined
  });

  const beacon = getBeacon(beaconGeohash);
  const selectedBeaconThread = listBeaconThreads().find((thread) => thread.geohash === beaconGeohash);
  const selectedPinnedNote = beacon?.pinnedNoteId ? getNote(beacon.pinnedNoteId) : undefined;
  const selectedPinnedAuthor = selectedPinnedNote ? getProfile(selectedPinnedNote.authorPubkey) : undefined;
  const selectedParticipants = beacon ? getBeaconParticipants(beacon.geohash) : [];
  const selectedNotes = listNotesForBeacon(beaconGeohash).filter((note) =>
    matchesRelativeDateFilter(note, relativeDateFilter)
  );
  const orderedNotes = sortNotesChronologically(selectedNotes);
  const noteGroups = useMemo(() => buildMessageGroups(selectedNotes), [selectedNotes]);
  const tailNoteId = orderedNotes.at(-1)?.id;
  const replyTargetNote = replyTargetNoteId ? getNote(replyTargetNoteId) : undefined;
  const replyTargetAuthor = replyTargetNote ? getProfile(replyTargetNote.authorPubkey) : undefined;
  const isRelayOperator = currentUser.pubkey === relayOperatorPubkey;
  const isSelectedBeaconInActiveCall = Boolean(beacon && activeCall?.geohash === beacon.geohash);
  const selectedBeaconActiveRoomID =
    beacon && activeCall?.geohash === beacon.geohash ? activeCall.roomID : beacon?.roomID;
  const connectedRoomParticipants =
    beacon && activeCall?.geohash === beacon.geohash
      ? activeCall.participantStates
          .filter((participant) => participant.pubkey !== currentUser.pubkey)
          .map((participant) => getProfile(participant.pubkey) ?? createFallbackParticipantProfile(participant.pubkey))
      : [];

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
    }
  }

  function handleNoteComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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
    noteComposerRef.current?.focus();
  }

  function handleToggleReactionPicker(messageID: string) {
    setOpenReactionNoteId((current) => (current === messageID ? null : messageID));
  }

  function handleReactToMessage(message: GeoNote, emoji: string) {
    reactToPlaceNote(message.id, emoji);
    setOpenReactionNoteId(null);
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
  }, [beaconGeohash]);

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
          <Link
            className="call-control-button world-chat-settings-button"
            to="/app/settings"
            aria-label="Open settings"
            title="Open settings"
          >
            <span className="call-control-icon" aria-hidden="true">
              <SettingsIcon />
            </span>
          </Link>
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

                    return (
                      <div
                        key={message.id}
                        className={index === 0 ? "world-chat-message" : "world-chat-message is-grouped"}
                        title={index === 0 ? undefined : formatAbsoluteTime(message.createdAt)}
                        tabIndex={0}
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
