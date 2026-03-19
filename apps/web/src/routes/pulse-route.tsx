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
    listRecentNotes
  } = useAppState();

  const note = getNote(searchParams.get("note") ?? "");
  const profile = getProfile(searchParams.get("profile") ?? "");
  const noteAuthor = note ? getProfile(note.authorPubkey) : undefined;
  const notePlace = note ? getPlace(note.geohash) : undefined;
  const profileNotes = profile ? listNotesByAuthor(profile.pubkey) : [];
  const profilePlace = profile?.homeGeohash ? getPlace(profile.homeGeohash) : undefined;
  const profileParticipants = profilePlace ? getPlaceParticipants(profilePlace.geohash) : [];

  return (
    <section className="panel">
      <p className="section-label">Pulse</p>
      <h2>Relay feed projection</h2>

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

      <div className="tile-list">
        {feedSegments.map((segment) => (
          <article key={segment.name} className="tile-card">
            <header>
              <strong>{segment.name}</strong>
            </header>
            <p>{segment.description}</p>
          </article>
        ))}
      </div>

      <div className="note-list">
        {listRecentNotes().map((recentNote) => {
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
