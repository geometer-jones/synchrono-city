import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAppState } from "../app-state";

export function ChatsRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftNote, setDraftNote] = useState("");
  const {
    createPlaceNote,
    getPlace,
    getPlaceParticipants,
    getProfile,
    joinPlaceCall,
    listNotesForPlace,
    listThreads
  } = useAppState();

  const threads = listThreads();
  const selectedGeohash = searchParams.get("geohash") ?? threads[0]?.geohash ?? "";
  const selectedThread = threads.find((thread) => thread.geohash === selectedGeohash) ?? threads[0];
  const selectedPlace = selectedThread ? getPlace(selectedThread.geohash) : undefined;
  const notes = selectedThread ? listNotesForPlace(selectedThread.geohash) : [];
  const participants = selectedThread ? getPlaceParticipants(selectedThread.geohash) : [];

  function selectThread(geohash: string) {
    setSearchParams({ geohash });
  }

  function openNote(noteID: string) {
    navigate(`/app/pulse?note=${encodeURIComponent(noteID)}`);
  }

  function openProfile(pubkey: string) {
    navigate(`/app/pulse?profile=${encodeURIComponent(pubkey)}`);
  }

  function handleSubmitNote() {
    if (!selectedThread) {
      return;
    }

    const nextNote = createPlaceNote(selectedThread.geohash, draftNote);
    if (nextNote) {
      setDraftNote("");
    }
  }

  return (
    <section className="panel route-surface route-surface-chats">
      <div className="route-header">
        <div>
          <p className="section-label">Chats</p>
          <h2>Place-scoped note stacks</h2>
          <p className="muted route-header-copy">
            Threads stay attached to specific geohash rooms, not to a generic inbox.
          </p>
        </div>
        <div className="route-header-meta">
          <span className="thread-pill">{threads.length} threads</span>
          {selectedThread?.activeCall ? <span className="thread-pill live">Room active</span> : null}
        </div>
      </div>

      <div className="route-columns route-columns-threads">
        <div className="thread-list" role="list" aria-label="Geo-chat threads">
          {threads.map((thread) => (
            <button
              key={thread.geohash}
              className={
                thread.geohash === selectedThread?.geohash ? "thread-button active" : "thread-button"
              }
              type="button"
              onClick={() => selectThread(thread.geohash)}
            >
              <span className="thread-button-top">
                <strong>{thread.geohash}</strong>
                {thread.unread ? <span className="thread-pill">Unread</span> : null}
              </span>
              <span>{thread.title}</span>
              <small>{thread.summary}</small>
            </button>
          ))}
        </div>

        {selectedThread && selectedPlace ? (
          <div className="thread-detail">
            <div className="detail-header">
              <div>
                <p className="section-label">Selected thread</p>
                <h3>
                  {selectedThread.title} · {selectedThread.geohash}
                </h3>
              </div>
              {selectedThread.activeCall ? <span className="thread-pill live">Active call</span> : null}
            </div>

            <p className="muted">
              {selectedPlace.neighborhood} · {selectedThread.roomID}
            </p>

            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => joinPlaceCall(selectedThread.geohash)}
              >
                Join room
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => navigate(`/app?place=${encodeURIComponent(selectedThread.geohash)}`)}
              >
                Open in World
              </button>
            </div>

            <div className="participant-roster">
              {participants.map((profile) => (
                <article key={profile.pubkey} className="mini-card">
                  <div>
                    <strong>{profile.displayName}</strong>
                    <p>{profile.role}</p>
                  </div>
                  <small>
                    Mic {profile.mic ? "on" : "off"} · Cam {profile.cam ? "on" : "off"} · Share{" "}
                    {profile.screenshare ? "on" : "off"}
                  </small>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => openProfile(profile.pubkey)}
                  >
                    View profile
                  </button>
                </article>
              ))}
            </div>

            <article className="feature-card">
              <p className="section-label">Write to place</p>
              <h3>Post into {selectedThread.title}</h3>
              <textarea
                className="note-input"
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="Add a place note for everyone in this tile."
              />
              <div className="action-row">
                <button className="primary-button" type="button" onClick={handleSubmitNote}>
                  Publish note
                </button>
              </div>
            </article>

            <div className="note-list">
              {notes.map((note) => {
                const author = getProfile(note.authorPubkey);

                return (
                  <article key={note.id} className="tile-card">
                    <header>
                      <div>
                        <strong>{author?.displayName ?? note.authorPubkey}</strong>
                        <p className="tile-kicker">{note.createdAt}</p>
                      </div>
                      {selectedThread.pinnedNoteId === note.id ? <span className="thread-pill">Pinned</span> : null}
                    </header>
                    <p>{note.content}</p>
                    <small>{note.replies} threaded replies</small>
                    <div className="action-row">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => openNote(note.id)}
                      >
                        Open in Pulse
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
