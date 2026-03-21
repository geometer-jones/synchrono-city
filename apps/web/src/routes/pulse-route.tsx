import { Link, useSearchParams } from "react-router-dom";

import { useAppState } from "../app-state";

export function PulseRoute() {
  const [searchParams] = useSearchParams();
  const {
    activeCall,
    feedSegments,
    getNote,
    getPlace,
    getPlaceParticipants,
    getProfile,
    joinPlaceCall,
    listNotesByAuthor,
    listRecentNotes,
    places,
    relaySyntheses
  } = useAppState();

  const note = getNote(searchParams.get("note") ?? "");
  const profile = getProfile(searchParams.get("profile") ?? "");
  const noteAuthor = note ? getProfile(note.authorPubkey) : undefined;
  const notePlace = note ? getPlace(note.geohash) : undefined;
  const profileNotes = profile ? listNotesByAuthor(profile.pubkey) : [];
  const profilePlace = profile?.homeGeohash ? getPlace(profile.homeGeohash) : undefined;
  const profileParticipants = profilePlace ? getPlaceParticipants(profilePlace.geohash) : [];
  const recentNotes = listRecentNotes();
  const pinnedNotes = places
    .map((place) => {
      const pinnedNote = place.pinnedNoteId ? getNote(place.pinnedNoteId) : undefined;
      if (!pinnedNote) {
        return null;
      }

      return {
        place,
        note: pinnedNote,
        author: getProfile(pinnedNote.authorPubkey)
      };
    })
    .filter((entry): entry is {
      place: typeof places[number];
      note: NonNullable<ReturnType<typeof getNote>>;
      author: ReturnType<typeof getProfile>;
    } => Boolean(entry));

  function describeFeedLane(name: string) {
    if (name === "Following") {
      return `${new Set(recentNotes.map((recentNote) => recentNote.authorPubkey)).size} active authors`;
    }
    if (name === "Local") {
      return `${recentNotes.length} relay notes in view`;
    }
    if (name === "For You") {
      return `${relaySyntheses.length} synthesis briefs ready`;
    }
    return "Explainable feed lane";
  }

  return (
    <section className="panel route-surface route-surface-pulse">
      <div className="route-header">
        <div>
          <p className="section-label">Pulse</p>
          <h2>Relay feed projection</h2>
          <p className="muted route-header-copy">
            Pulse is the profile, editorial, and synthesis layer that sits behind the visible scene.
          </p>
        </div>
        <div className="route-header-meta">
          <span className="thread-pill">{feedSegments.length} feed lanes</span>
          <span className="thread-pill live">{relaySyntheses.length} syntheses</span>
          <span className="thread-pill">{recentNotes.length} recent notes</span>
        </div>
      </div>

      {note ? (
        <article className="feature-card">
          <div className="detail-header">
            <div>
              <p className="section-label">Note context</p>
              <h3>{noteAuthor?.displayName ?? note.authorPubkey}</h3>
            </div>
            <Link
              className="secondary-link"
              to={`/app/chats?geohash=${encodeURIComponent(note.geohash)}`}
            >
              Back to {note.geohash}
            </Link>
          </div>
          <p>{note.content}</p>
          <small>
            {note.createdAt} · {note.replies} replies · {notePlace?.title ?? note.geohash}
          </small>
        </article>
      ) : null}

      {profile ? (
        <article className="feature-card">
          <div className="detail-header">
            <div>
              <p className="section-label">Profile</p>
              <h3>{profile.displayName}</h3>
            </div>
            {profilePlace ? (
              <Link
                className="secondary-link"
                to={`/app/chats?geohash=${encodeURIComponent(profilePlace.geohash)}`}
              >
                Open {profilePlace.geohash}
              </Link>
            ) : null}
          </div>
          <p>{profile.bio}</p>
          <small>
            {profile.role} · Mic {profile.mic ? "on" : "off"} · Cam {profile.cam ? "on" : "off"} ·
            Deafen {profile.deafen ? "on" : "off"}
          </small>

          {profilePlace ? (
            <div className="feature-grid">
              <article className="mini-card">
                <strong>Current place</strong>
                <p>
                  {profilePlace.title} · {profilePlace.neighborhood}
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => joinPlaceCall(profilePlace.geohash)}
                >
                  Join their room
                </button>
              </article>
              <article className="mini-card">
                <strong>Nearby roster</strong>
                <p>{profileParticipants.length} profiles visible in the same place thread.</p>
                <small>{activeCall?.geohash === profilePlace.geohash ? "You are in this room." : "Room available."}</small>
              </article>
            </div>
          ) : null}

          <div className="note-list">
            {profileNotes.map((profileNote) => (
              <article key={profileNote.id} className="tile-card">
                <header>
                  <strong>{getPlace(profileNote.geohash)?.title ?? profileNote.geohash}</strong>
                  <Link
                    className="secondary-link"
                    to={`/app/chats?geohash=${encodeURIComponent(profileNote.geohash)}`}
                  >
                    Open chat
                  </Link>
                </header>
                <p>{profileNote.content}</p>
              </article>
            ))}
          </div>
        </article>
      ) : null}

      {relaySyntheses.length > 0 ? (
        <section className="pulse-section">
          <div className="detail-header">
            <div>
              <p className="section-label">Phase 5</p>
              <h3>AI synthesis</h3>
            </div>
            <span className="thread-pill live">{relaySyntheses.length} active briefs</span>
          </div>
          <div className="tile-list">
            {relaySyntheses.map((synthesis) => (
              <article key={synthesis.id} className="tile-card pulse-card">
                <header>
                  <div>
                    <strong>{synthesis.placeTitle}</strong>
                    <p className="tile-kicker">{synthesis.geohash}</p>
                  </div>
                  <span className="thread-pill">{synthesis.sourceNoteIds.length} cited notes</span>
                </header>
                <p>{synthesis.summary}</p>
                <small>
                  Generated from {synthesis.participantPubkeys.length} live participants at {synthesis.generatedAt}
                </small>
                <div className="action-row pulse-card-actions">
                  {synthesis.sourceNoteIds.map((sourceNoteId) => {
                    const sourceNote = getNote(sourceNoteId);
                    const sourceAuthor = sourceNote ? getProfile(sourceNote.authorPubkey) : undefined;

                    return sourceNote ? (
                      <Link
                        key={sourceNote.id}
                        className="secondary-link"
                        to={`/app/pulse?note=${encodeURIComponent(sourceNote.id)}`}
                      >
                        Cite {sourceAuthor?.displayName ?? sourceNote.authorPubkey}
                      </Link>
                    ) : null;
                  })}
                  <Link
                    className="secondary-link"
                    to={`/app/chats?geohash=${encodeURIComponent(synthesis.geohash)}`}
                  >
                    Open chat
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {pinnedNotes.length > 0 ? (
        <section className="pulse-section">
          <div className="detail-header">
            <div>
              <p className="section-label">Editorial</p>
              <h3>Operator pins</h3>
            </div>
            <span className="thread-pill">{pinnedNotes.length} active picks</span>
          </div>
          <div className="tile-list">
            {pinnedNotes.map((entry) => (
              <article key={entry.note.id} className="tile-card pulse-card">
                <header>
                  <div>
                    <strong>{entry.place.title}</strong>
                    <p className="tile-kicker">{entry.author?.displayName ?? entry.note.authorPubkey}</p>
                  </div>
                  <span className="thread-pill">Pinned</span>
                </header>
                <p>{entry.note.content}</p>
                <div className="action-row pulse-card-actions">
                  <Link
                    className="secondary-link"
                    to={`/app/pulse?note=${encodeURIComponent(entry.note.id)}`}
                  >
                    Review pin
                  </Link>
                  <Link
                    className="secondary-link"
                    to={`/app/chats?geohash=${encodeURIComponent(entry.place.geohash)}`}
                  >
                    Open chat
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="tile-list">
        {feedSegments.map((segment) => (
          <article key={segment.name} className="tile-card pulse-card">
            <header>
              <div>
                <strong>{segment.name}</strong>
                <p className="tile-kicker">{describeFeedLane(segment.name)}</p>
              </div>
            </header>
            <p>{segment.description}</p>
          </article>
        ))}
      </div>

      <div className="note-list">
        {recentNotes.map((recentNote) => {
          const author = getProfile(recentNote.authorPubkey);
          const place = getPlace(recentNote.geohash);

          return (
            <article key={recentNote.id} className="tile-card">
              <header>
                <div>
                  <strong>{author?.displayName ?? recentNote.authorPubkey}</strong>
                  <p className="tile-kicker">{place?.title ?? recentNote.geohash}</p>
                </div>
                <Link
                  className="secondary-link"
                  to={`/app/chats?geohash=${encodeURIComponent(recentNote.geohash)}`}
                >
                  Open chat
                </Link>
              </header>
              <p>{recentNote.content}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
