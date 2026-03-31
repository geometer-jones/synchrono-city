import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAppState } from "../app-state";
import { ResizablePanels } from "../components/resizable-panels";
import { compareDescendingTimestamps } from "../data";
import { useNarrowViewport } from "../hooks/use-viewport";
import { BeaconAvatar, BeaconThreadPanel } from "./beacon-thread-panel";

type InboxItem =
  | {
      id: string;
      kind: "beacon";
      title: string;
      summary: string;
      unread: boolean;
      activeCall: boolean;
      geohash: string;
      avatarUrl?: string;
      cohort: boolean;
    }
  | {
      id: string;
      kind: "dm" | "group_dm";
      title: string;
      summary: string;
      unread: boolean;
      activeCall: boolean;
      participants: Array<{
        pubkey: string;
        label: string;
        picture?: string;
      }>;
    };

function beaconItemID(geohash: string) {
  return `beacon:${geohash}`;
}

function isBeaconInboxItem(item: InboxItem): item is Extract<InboxItem, { kind: "beacon" }> {
  return item.kind === "beacon";
}

function isPrivateInboxItem(item: InboxItem): item is Extract<InboxItem, { kind: "dm" | "group_dm" }> {
  return item.kind === "dm" || item.kind === "group_dm";
}

function formatParticipantCount(count: number) {
  return `${count} participant${count === 1 ? "" : "s"}`;
}

function formatThreadPreview(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized || "No messages yet.";
}

export function ChatsRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCall, currentUser, getProfile, listBeaconThreads, listChatThreads, listNotesForBeacon } = useAppState();
  const threads = listChatThreads();
  const beaconThreads = listBeaconThreads();
  const isNarrowViewport = useNarrowViewport();
  const requestedBeaconGeohash = searchParams.get("beacon") ?? "";
  const beaconThreadsForInbox = useMemo(() => {
    const memberThreads = beaconThreads.filter((thread) => {
      const ownsBeacon = thread.ownerPubkey === currentUser.pubkey;
      const hasExplicitMembership = thread.memberPubkeys?.includes(currentUser.pubkey) ?? false;
      const authoredInBeacon = listNotesForBeacon(thread.geohash).some((note) => note.authorPubkey === currentUser.pubkey);
      const joinedCall = activeCall?.geohash === thread.geohash && activeCall.participantPubkeys.includes(currentUser.pubkey);

      return ownsBeacon || hasExplicitMembership || thread.participants.includes(currentUser.pubkey) || authoredInBeacon || joinedCall;
    });
    const sortedMemberThreads = [...memberThreads].sort((left, right) => {
      const leftLatestActivity = listNotesForBeacon(left.geohash)[0]?.createdAt ?? left.createdAt;
      const rightLatestActivity = listNotesForBeacon(right.geohash)[0]?.createdAt ?? right.createdAt;
      const activityOrder = compareDescendingTimestamps(leftLatestActivity, rightLatestActivity);

      if (activityOrder !== 0) {
        return activityOrder;
      }

      return left.name.localeCompare(right.name);
    });

    const requestedThread = requestedBeaconGeohash
      ? beaconThreads.find((thread) => thread.geohash === requestedBeaconGeohash)
      : undefined;

    if (requestedThread && !sortedMemberThreads.some((thread) => thread.geohash === requestedThread.geohash)) {
      return [requestedThread, ...sortedMemberThreads];
    }

    return sortedMemberThreads;
  }, [activeCall, beaconThreads, currentUser.pubkey, listNotesForBeacon, requestedBeaconGeohash]);
  const inboxItems = useMemo<InboxItem[]>(() => {
    const beaconItems: InboxItem[] = beaconThreadsForInbox.map((thread) => ({
      id: beaconItemID(thread.geohash),
      kind: "beacon",
      title: thread.name,
      summary: formatThreadPreview(listNotesForBeacon(thread.geohash)[0]?.content ?? thread.cohort?.summary ?? thread.about),
      unread: thread.unread,
      activeCall: thread.activeCall,
      geohash: thread.geohash,
      avatarUrl: thread.avatarUrl,
      cohort: Boolean(thread.cohort)
    }));

    const dmItems: InboxItem[] = threads.map((thread) => ({
      id: thread.id,
      kind: thread.kind,
      title: thread.title,
      summary: thread.summary,
      unread: thread.unread,
      activeCall: thread.activeCall,
      participants: thread.participants.map((pubkey) => {
        const profile = getProfile(pubkey);
        return {
          pubkey,
          label: profile?.displayName || profile?.name || pubkey,
          picture: profile?.picture
        };
      })
    }));

    return [...beaconItems, ...dmItems];
  }, [beaconThreadsForInbox, getProfile, listNotesForBeacon, threads]);
  const requestedSelectionId = requestedBeaconGeohash ? beaconItemID(requestedBeaconGeohash) : null;
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => {
    if (requestedSelectionId && inboxItems.some((item) => item.id === requestedSelectionId)) {
      return requestedSelectionId;
    }

    return inboxItems[0]?.id ?? null;
  });
  const [isNarrowThreadOpen, setIsNarrowThreadOpen] = useState(false);
  const selectedItem = inboxItems.find((item) => item.id === selectedThreadId) ?? inboxItems[0] ?? null;
  const shouldShowThreadList = !isNarrowViewport || !isNarrowThreadOpen;
  const shouldShowThreadDetail = !isNarrowViewport || isNarrowThreadOpen;

  useEffect(() => {
    if (!isNarrowViewport) {
      setIsNarrowThreadOpen(false);
    }
  }, [isNarrowViewport]);

  useEffect(() => {
    if (inboxItems.length === 0) {
      setSelectedThreadId(null);
      setIsNarrowThreadOpen(false);
      return;
    }

    if (!selectedThreadId || !inboxItems.some((item) => item.id === selectedThreadId)) {
      if (requestedSelectionId && inboxItems.some((item) => item.id === requestedSelectionId)) {
        setSelectedThreadId(requestedSelectionId);
        return;
      }

      setSelectedThreadId(inboxItems[0].id);
    }
  }, [inboxItems, requestedSelectionId, selectedThreadId]);

  function handleSelectThread(item: InboxItem) {
    setSelectedThreadId(item.id);

    if (item.kind === "beacon") {
      setSearchParams({ beacon: item.geohash });
    }

    if (isNarrowViewport) {
      setIsNarrowThreadOpen(true);
    }
  }

  const threadListPanel = shouldShowThreadList ? (
    <div className="thread-scroll-panel thread-scroll-panel-list">
      <div className="thread-list" role="list" aria-label="Chat inbox">
        {inboxItems.length > 0 ? (
          <>
            {beaconThreadsForInbox.length > 0 ? (
              <section className="thread-list-section" aria-label="Beacon chats">
                {inboxItems
                  .filter(isBeaconInboxItem)
                  .map((item) => (
                    <button
                      key={item.id}
                      className={item.id === selectedItem?.id ? "thread-button active" : "thread-button"}
                      type="button"
                      onClick={() => handleSelectThread(item)}
                    >
                      <span className="thread-button-row">
                        <span className="thread-button-identity">
                          <BeaconAvatar
                            picture={item.avatarUrl}
                            label={item.title}
                            fallbackLabel={item.title}
                            className="thread-button-avatar"
                          />
                          <span className="thread-button-copy">
                            <span className="thread-button-top">
                              <strong>{item.title}</strong>
                              <span className="thread-button-pills">
                                {item.unread ? <span className="thread-pill">Unread</span> : null}
                                {item.activeCall ? <span className="thread-pill live">Live</span> : null}
                              </span>
                            </span>
                            <small className="thread-button-preview muted marker-note-preview">{item.summary}</small>
                          </span>
                        </span>
                      </span>
                    </button>
                  ))}
              </section>
            ) : null}

            {threads.length > 0 ? (
              <section className="thread-list-section" aria-label="Direct messages">
                <p className="thread-list-section-label">Direct messages</p>
                {inboxItems
                  .filter(isPrivateInboxItem)
                  .map((item) => (
                    <button
                      key={item.id}
                      className={item.id === selectedItem?.id ? "thread-button active" : "thread-button"}
                      type="button"
                      onClick={() => handleSelectThread(item)}
                    >
                      <span className="thread-button-top">
                        <strong>{item.title}</strong>
                        <span className="thread-button-pills">
                          {item.unread ? <span className="thread-pill">Unread</span> : null}
                          {item.activeCall ? <span className="thread-pill live">Live</span> : null}
                        </span>
                      </span>
                      <span>{item.kind === "dm" ? "Direct message" : "Group DM"}</span>
                      <small>{item.summary}</small>
                    </button>
                  ))}
              </section>
            ) : null}
          </>
        ) : (
          <article className="feature-card thread-detail">
            <p className="section-label">No chats</p>
            <h3>No beacon or private chats yet.</h3>
            <p className="muted">
              Joined beacon rooms and private messages will appear here. Public map context still lives in World.
            </p>
          </article>
        )}
      </div>
    </div>
  ) : null;

  const narrowBackButton = isNarrowViewport ? (
    <div className="action-row thread-detail-toolbar">
      <button className="secondary-button" type="button" onClick={() => setIsNarrowThreadOpen(false)}>
        Back to chats
      </button>
    </div>
  ) : null;

  const threadDetailPanel = shouldShowThreadDetail ? (
    <div className="thread-scroll-panel thread-scroll-panel-detail">
      {selectedItem ? (
        selectedItem.kind === "beacon" ? (
          <div className="thread-detail-stack">
            {narrowBackButton}
            <BeaconThreadPanel
              beaconGeohash={selectedItem.geohash}
              avatarActionLabel={`Open ${selectedItem.title} in World`}
              onActivateBeacon={(geohash) =>
                navigate({ pathname: "/app", search: `?beacon=${encodeURIComponent(geohash)}` })
              }
            />
          </div>
        ) : (
          <article className="feature-card thread-detail">
            <div className="detail-header">
              <div>
                <p className="section-label">Private inbox</p>
                <h3>{selectedItem.title}</h3>
              </div>
              {isNarrowViewport ? (
                <button className="secondary-button" type="button" onClick={() => setIsNarrowThreadOpen(false)}>
                  Back to chats
                </button>
              ) : null}
            </div>
            <p className="thread-detail-copy muted">
              {selectedItem.kind === "dm" ? "Direct message" : "Group DM"}
              {" · "}
              {formatParticipantCount(selectedItem.participants.length)}
            </p>
            <div className="thread-participant-list">
              {selectedItem.participants.map((participant) => (
                <Link
                  key={participant.pubkey}
                  className="mini-card marker-participant-card thread-participant-card"
                  to={`/app/pulse?profile=${encodeURIComponent(participant.pubkey)}`}
                >
                  <div className="marker-participant-identity">
                    <BeaconAvatar
                      picture={participant.picture}
                      label={participant.label}
                      fallbackLabel={participant.label}
                      className="participant-avatar"
                    />
                    <div className="marker-participant-meta">
                      <strong>{participant.label}</strong>
                      <p className="tile-kicker">{participant.pubkey}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <p className="muted">{selectedItem.summary}</p>
            <p className="muted">
              Private message history is still placeholder data in this client session, so beacon chats now get the
              full right-panel experience while DMs keep a lighter detail view.
            </p>
            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  navigate({
                    pathname: "/app",
                    search: searchParams.toString() ? `?${searchParams.toString()}` : ""
                  })
                }
              >
                Open World
              </button>
            </div>
          </article>
        )
      ) : (
        <article className="feature-card thread-detail">
          <p className="section-label">Chat inbox</p>
          <h3>Beacon rooms and DMs land here.</h3>
          <p className="muted">
            There are no joined beacon rooms or private threads loaded in this client session yet. Place-based notes
            and room activity remain on the map.
          </p>
          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => navigate("/app")}>
              Open World
            </button>
          </div>
        </article>
      )}
    </div>
  ) : null;

  const threadLayout =
    !isNarrowViewport && threadListPanel && threadDetailPanel ? (
      <ResizablePanels
        className="route-columns route-columns-threads"
        storageKey="chats"
        defaultPrimarySize={320}
        minPrimarySize={240}
        minSecondarySize={320}
        handleLabel="Resize chats panels"
        primary={threadListPanel}
        secondary={threadDetailPanel}
      />
    ) : (
      <div className="route-columns route-columns-threads">
        {threadListPanel}
        {threadDetailPanel}
      </div>
    );

  return <section className="panel route-surface route-surface-chats route-surface-split">{threadLayout}</section>;
}
