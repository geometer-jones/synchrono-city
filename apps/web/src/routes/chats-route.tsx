import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAppState } from "../app-state";
import { ResizablePanels } from "../components/resizable-panels";
import { useNarrowViewport } from "../hooks/use-viewport";

export function ChatsRoute() {
  const navigate = useNavigate();
  const { listChatThreads } = useAppState();
  const threads = listChatThreads();
  const isNarrowViewport = useNarrowViewport();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() => threads[0]?.id ?? null);
  const [isNarrowThreadOpen, setIsNarrowThreadOpen] = useState(false);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;
  const shouldShowThreadList = !isNarrowViewport || !isNarrowThreadOpen;
  const shouldShowThreadDetail = !isNarrowViewport || isNarrowThreadOpen;

  useEffect(() => {
    if (!isNarrowViewport) {
      setIsNarrowThreadOpen(false);
    }
  }, [isNarrowViewport]);

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedThreadId(null);
      setIsNarrowThreadOpen(false);
      return;
    }

    if (!selectedThreadId || !threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  function handleSelectThread(threadId: string) {
    setSelectedThreadId(threadId);

    if (isNarrowViewport) {
      setIsNarrowThreadOpen(true);
    }
  }

  const threadListPanel = shouldShowThreadList ? (
    <div className="thread-scroll-panel thread-scroll-panel-list">
      <div className="thread-list" role="list" aria-label="Private chat threads">
        {threads.length > 0 ? (
          threads.map((thread) => (
            <button
              key={thread.id}
              className={thread.id === selectedThread?.id ? "thread-button active" : "thread-button"}
              type="button"
              onClick={() => handleSelectThread(thread.id)}
            >
              <span className="thread-button-top">
                <strong>{thread.title}</strong>
                {thread.unread ? <span className="thread-pill">Unread</span> : null}
              </span>
              <span>{thread.kind === "dm" ? "Direct message" : "Group DM"}</span>
              <small>{thread.summary}</small>
            </button>
          ))
        ) : (
          <article className="feature-card thread-detail">
            <p className="section-label">No chats</p>
            <h3>No private chats yet.</h3>
            <p className="muted">
              Chats now only holds direct messages and group DMs. Public place conversation stays in World and Pulse.
            </p>
          </article>
        )}
      </div>
    </div>
  ) : null;

  const threadDetailPanel = shouldShowThreadDetail ? (
    <div className="thread-scroll-panel thread-scroll-panel-detail">
      {selectedThread ? (
        <article className="feature-card thread-detail">
          <div className="detail-header">
            <div>
              <p className="section-label">Private inbox</p>
              <h3>{selectedThread.title}</h3>
            </div>
            {isNarrowViewport ? (
              <button className="secondary-button" type="button" onClick={() => setIsNarrowThreadOpen(false)}>
                Back to chats
              </button>
            ) : null}
          </div>
          <p className="thread-detail-copy muted">
            {selectedThread.kind === "dm" ? "Direct message" : "Group DM"}
            {" · "}
            {selectedThread.participants.length} participant{selectedThread.participants.length === 1 ? "" : "s"}
          </p>
          <p className="muted">{selectedThread.summary}</p>
          <p className="muted">
            Message history is not loaded in this client session yet, but the narrow layout now opens a dedicated
            thread view instead of splitting the screen.
          </p>
          <div className="action-row">
            <button className="secondary-button" type="button" onClick={() => navigate("/app")}>
              Open World
            </button>
          </div>
        </article>
      ) : (
        <article className="feature-card thread-detail">
          <p className="section-label">Private inbox</p>
          <h3>DMs and group DMs land here.</h3>
          <p className="muted">
            There are no private threads loaded in this client session yet. Place-based notes and room activity remain
            on the map.
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
