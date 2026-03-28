import { Link, useSearchParams } from "react-router-dom";

import { useAppState } from "../app-state";
import { buildCohortBeaconMetadata } from "../beacon-metadata";
import { isBeaconThreadNote, listPulseLocalNotes } from "../data";

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
    notes,
    places,
    pulseFeedItems,
    relaySyntheses
  } = useAppState();

  const note = getNote(searchParams.get("note") ?? "");
  const notePlace = note ? getPlace(note.geohash) : undefined;
  const noteStaysInWorld = note ? isBeaconThreadNote(note, places) : false;
  const noteAuthor = note ? getProfile(note.authorPubkey) : undefined;
  const profile = getProfile(searchParams.get("profile") ?? "");
  const profileNotes = profile ? listNotesByAuthor(profile.pubkey) : [];
  const profilePlace = profile?.homeGeohash ? getPlace(profile.homeGeohash) : undefined;
  const profileParticipants = profilePlace ? getPlaceParticipants(profilePlace.geohash) : [];
  const recentNotes = listPulseLocalNotes(places, notes);
  const mergedFeedCount = pulseFeedItems.length;
  const visibleRelayCount = new Set(pulseFeedItems.map((item) => item.relayName)).size;
  const laneCounts = pulseFeedItems.reduce<Record<string, number>>((counts, item) => {
    counts[item.lane] = (counts[item.lane] ?? 0) + 1;
    return counts;
  }, {});
  const pinnedNotes = places
    .map((place) => {
      const pinnedNote = place.pinnedNoteId ? getNote(place.pinnedNoteId) : undefined;
      if (!pinnedNote) {
        return null;
      }

      return {
        place,
        note: pinnedNote,
        author: getProfile(pinnedNote.authorPubkey),
        cohort: buildCohortBeaconMetadata(
          place,
          pinnedNote,
          notes.filter((note) => note.geohash === place.geohash)
        )
      };
    })
    .filter((entry): entry is {
      place: typeof places[number];
      note: NonNullable<ReturnType<typeof getNote>>;
      author: ReturnType<typeof getProfile>;
      cohort: ReturnType<typeof buildCohortBeaconMetadata>;
    } => Boolean(entry));

  function describeFeedLane(name: string) {
    if (name === "Following") {
      return `${laneCounts.Following ?? 0} follow-sourced items`;
    }
    if (name === "Local") {
      return `${laneCounts.Local ?? 0} active relay items`;
    }
    if (name === "For You") {
      return `${laneCounts["For You"] ?? 0} discovered relay items`;
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
          <span className="thread-pill">{mergedFeedCount} merged items</span>
          <span className="thread-pill live">{relaySyntheses.length} syntheses</span>
          <span className="thread-pill">{recentNotes.length} recent notes</span>
        </div>
      </div>

      {note && noteStaysInWorld ? (
        <article className="feature-card">
          <div className="detail-header">
            <div>
              <p className="section-label">World</p>
              <h3>Beacon conversation stays in World</h3>
            </div>
            <Link
              className="secondary-link"
              to={`/app?beacon=${encodeURIComponent(note.geohash)}`}
            >
              Open beacon
            </Link>
          </div>
          <p>
            Pulse keeps profile and cross-relay context. Open {notePlace?.title ?? note.geohash} to read or reply to
            this beacon thread.
          </p>
          <div className="action-row pulse-card-actions">
            {noteAuthor ? (
              <Link
                className="secondary-link"
                to={`/app/pulse?profile=${encodeURIComponent(note.authorPubkey)}`}
              >
                View profile
              </Link>
            ) : null}
          </div>
        </article>
      ) : note ? (
        <article className="feature-card">
          <div className="detail-header">
            <div>
              <p className="section-label">Note context</p>
              <h3>{noteAuthor?.displayName ?? note.authorPubkey}</h3>
            </div>
            <Link
              className="secondary-link"
              to={`/app?beacon=${encodeURIComponent(note.geohash)}`}
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
                to={`/app?beacon=${encodeURIComponent(profilePlace.geohash)}`}
              >
                Open beacon
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
                    to={`/app?beacon=${encodeURIComponent(profileNote.geohash)}`}
                  >
                    Open beacon
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
                        to={`/app?beacon=${encodeURIComponent(sourceNote.geohash)}`}
                      >
                        Source beacon · {sourceAuthor?.displayName ?? sourceNote.authorPubkey}
                      </Link>
                    ) : null;
                  })}
                  <Link
                    className="secondary-link"
                    to={`/app?beacon=${encodeURIComponent(synthesis.geohash)}`}
                  >
                    Open beacon
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {pulseFeedItems.length > 0 ? (
        <section className="pulse-section">
          <div className="detail-header">
            <div>
              <p className="section-label">Phase 6</p>
              <h3>Cross-relay merge</h3>
            </div>
            <span className="thread-pill">{visibleRelayCount} visible relays</span>
          </div>
          <div className="tile-list">
            {pulseFeedItems.map((item) => {
              const matchingPlace = getPlace(item.geohash);
              const matchingProfile = getProfile(item.authorPubkey);

              return (
                <article key={item.id} className="tile-card pulse-card">
                  <header>
                    <div>
                      <strong>{item.authorName}</strong>
                      <p className="tile-kicker">
                        {item.relayName} · {item.placeTitle}
                      </p>
                    </div>
                    <span className="thread-pill">{item.sourceLabel}</span>
                  </header>
                  <p>{item.content}</p>
                  <small>
                    {item.sourceLabel} · {item.whyVisible} Published at {item.publishedAt}.
                  </small>
                  <div className="action-row pulse-card-actions">
                    <span className={item.local ? "thread-pill live" : "thread-pill"}>{item.lane}</span>
                    {!item.local ? (
                      <a className="secondary-link" href={item.relayUrl} target="_blank" rel="noreferrer">
                        Open relay
                      </a>
                    ) : null}
                    {item.noteId ? (
                      <Link
                        className="secondary-link"
                        to={`/app/pulse?note=${encodeURIComponent(item.noteId)}`}
                      >
                        Open note
                      </Link>
                    ) : null}
                    {matchingPlace ? (
                      <Link
                        className="secondary-link"
                        to={`/app?beacon=${encodeURIComponent(item.geohash)}`}
                      >
                        {item.local ? "Open beacon" : "Compare local beacon"}
                      </Link>
                    ) : null}
                    {matchingProfile ? (
                      <Link
                        className="secondary-link"
                        to={`/app/pulse?profile=${encodeURIComponent(item.authorPubkey)}`}
                      >
                        View local profile
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
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
                  <div className="route-header-meta">
                    <span className="thread-pill">Pinned</span>
                    {entry.cohort ? <span className="thread-pill">Cohort</span> : null}
                    {entry.cohort?.weekLabel ? <span className="thread-pill live">{entry.cohort.weekLabel}</span> : null}
                  </div>
                </header>
                {entry.cohort ? (
                  <>
                    <p>{entry.cohort.summary ?? entry.note.content}</p>
                    <small>
                      {entry.cohort.currentConcept ?? "Pinned note sets the current concept."}
                      {entry.cohort.nextSession ? ` Next: ${entry.cohort.nextSession}` : ""}
                    </small>
                  </>
                ) : (
                  <p>{entry.note.content}</p>
                )}
                <div className="action-row pulse-card-actions">
                  {entry.author ? (
                    <Link
                      className="secondary-link"
                      to={`/app/pulse?profile=${encodeURIComponent(entry.note.authorPubkey)}`}
                    >
                      View author
                    </Link>
                  ) : null}
                  <Link
                    className="secondary-link"
                    to={`/app?beacon=${encodeURIComponent(entry.place.geohash)}`}
                  >
                    Open beacon
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {feedSegments.length > 0 ? (
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
      ) : null}

      {!note &&
      !profile &&
      relaySyntheses.length === 0 &&
      pulseFeedItems.length === 0 &&
      pinnedNotes.length === 0 &&
      feedSegments.length === 0 ? (
        <article className="feature-card">
          <p className="section-label">Pulse</p>
          <h3>No feed activity yet.</h3>
          <p className="muted">Profiles, syntheses, relay feed lanes, and editorial picks will appear here after the relay publishes them.</p>
        </article>
      ) : null}
    </section>
  );
}
