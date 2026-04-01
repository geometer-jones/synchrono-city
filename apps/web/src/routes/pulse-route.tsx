import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAppState } from "../app-state";
import { buildCohortBeaconMetadata } from "../beacon-metadata";
import {
  buildCrossRelayFeedItemsFromNotes,
  buildPulseFeedItems,
  isConnectedLiveKitCall,
  isBeaconThreadNote,
  listPulseLocalNotes,
  mergeCrossRelayFeedItems,
  pulseFeedPageSize,
  type CrossRelayFeedItem,
  type GeoNote
} from "../data";
import { startPulseRelayRollup } from "../pulse-relay-rollup";

const pulseFeedOptions = ["For You", "Following"] as const;

type PulseFeedName = (typeof pulseFeedOptions)[number];
type PulseFeedWindowState = Record<PulseFeedName, string | null>;

export function PulseRoute() {
  const [searchParams] = useSearchParams();
  const [selectedFeed, setSelectedFeed] = useState<PulseFeedName>("For You");
  const [liveRelayNotesByUrl, setLiveRelayNotesByUrl] = useState<Record<string, GeoNote[]>>({});
  const [feedWindowTopByLane, setFeedWindowTopByLane] = useState<PulseFeedWindowState>({
    "For You": null,
    Following: null
  });
  const {
    activeCall,
    crossRelayItems,
    followedPubkeys,
    getNote,
    getPlace,
    getPlaceParticipants,
    getProfile,
    joinPlaceCall,
    listNotesByAuthor,
    notes,
    places,
    profiles,
    relayBootstrapReady,
    relayList,
    relayURL,
    relaySyntheses
  } = useAppState();
  const connectedActiveCall = isConnectedLiveKitCall(activeCall) ? activeCall : null;
  const readableRelays = useMemo(() => relayList.filter((relay) => relay.inbox), [relayList]);
  const readableRelaySignature = useMemo(
    () => readableRelays.map((relay) => `${relay.url}\u0000${relay.name}`).join("\u0001"),
    [readableRelays]
  );

  useEffect(() => {
    if (!relayBootstrapReady) {
      setLiveRelayNotesByUrl({});
      return;
    }

    if (readableRelays.length === 0) {
      setLiveRelayNotesByUrl({});
      return;
    }

    setLiveRelayNotesByUrl((current) => pruneRelayNoteMap(current, readableRelays));

    const rollup = startPulseRelayRollup({
      relays: readableRelays,
      currentRelayUrl: relayURL,
      onRelayNotes: (relay, notes) => {
        setLiveRelayNotesByUrl((current) => {
          const previousNotes = current[relay.url];
          if (areRelayNoteCollectionsEqual(previousNotes, notes)) {
            return current;
          }

          return {
            ...current,
            [relay.url]: notes
          };
        });
      }
    });

    return () => {
      rollup.stop();
    };
  }, [readableRelaySignature, readableRelays, relayBootstrapReady, relayURL]);

  const liveRelayItems = useMemo(() => {
    if (Object.keys(liveRelayNotesByUrl).length === 0) {
      return [];
    }

    const relaysByUrl = new Map(readableRelays.map((relay) => [relay.url, relay]));

    return mergeCrossRelayFeedItems(
      ...Object.entries(liveRelayNotesByUrl).flatMap(([relayUrl, relayNotes]) => {
        const relay = relaysByUrl.get(relayUrl);
        if (!relay) {
          return [];
        }

        const pulseNotes =
          relayUrl === relayURL ? relayNotes.filter((note) => !isBeaconThreadNote(note, places)) : relayNotes;

        return [
          buildCrossRelayFeedItemsFromNotes(relay, pulseNotes, places, profiles, {
            whyVisible:
              relayUrl === relayURL
                ? "Fetched live from the current relay."
                : "Fetched live from a configured relay."
          })
        ];
      })
    );
  }, [liveRelayNotesByUrl, places, profiles, readableRelays, relayURL]);

  const pulseFeedItems = useMemo(
    () => buildPulseFeedItems(mergeCrossRelayFeedItems(crossRelayItems, liveRelayItems), followedPubkeys),
    [crossRelayItems, followedPubkeys, liveRelayItems]
  );

  const note = getNote(searchParams.get("note") ?? "");
  const notePlace = note ? getPlace(note.geohash) : undefined;
  const noteStaysInWorld = note ? isBeaconThreadNote(note, places) : false;
  const noteAuthor = note ? getProfile(note.authorPubkey) : undefined;
  const profile = getProfile(searchParams.get("profile") ?? "");
  const profileNotes = profile ? listNotesByAuthor(profile.pubkey) : [];
  const profilePlace = profile?.homeGeohash ? getPlace(profile.homeGeohash) : undefined;
  const profileParticipants = profilePlace ? getPlaceParticipants(profilePlace.geohash) : [];
  const recentNotes = listPulseLocalNotes(places, notes);
  const laneFeedItems = pulseFeedItems.filter((item) => item.lane === selectedFeed);
  const selectedWindowTopId = feedWindowTopByLane[selectedFeed];
  const visibleFeedStartIndex = selectedWindowTopId
    ? Math.max(0, laneFeedItems.findIndex((item) => item.id === selectedWindowTopId))
    : 0;
  const visibleFeedItems = laneFeedItems.slice(visibleFeedStartIndex, visibleFeedStartIndex + pulseFeedPageSize);
  const visibleRelayCount = new Set(visibleFeedItems.map((item) => item.relayName)).size;
  const newerFeedCount = visibleFeedStartIndex;
  const olderFeedCount = Math.max(0, laneFeedItems.length - (visibleFeedStartIndex + visibleFeedItems.length));
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
          <span className="thread-pill">{pulseFeedItems.length} feed items</span>
          <span className="thread-pill live">{relaySyntheses.length} syntheses</span>
          <span className="thread-pill">{recentNotes.length} recent notes</span>
        </div>
      </div>

      <div className="pulse-feed-switcher" aria-label="Pulse feed selector">
        {pulseFeedOptions.map((feedOption) => (
          <button
            key={feedOption}
            className="secondary-button pulse-feed-button"
            type="button"
            aria-pressed={selectedFeed === feedOption}
            onClick={() => setSelectedFeed(feedOption)}
          >
            {feedOption}
          </button>
        ))}
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
                <small>{connectedActiveCall?.geohash === profilePlace.geohash ? "You are in this room." : "Room available."}</small>
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

      {visibleFeedItems.length > 0 ? (
        <section className="pulse-section">
          <div className="detail-header">
            <div>
              <p className="section-label">Pulse feed</p>
              <h3>{selectedFeed}</h3>
            </div>
            <span className="thread-pill">{visibleRelayCount} visible relays</span>
          </div>
          {newerFeedCount > 0 ? (
            <div className="pulse-feed-pagination pulse-feed-pagination-top">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const nextStartIndex = Math.max(0, visibleFeedStartIndex - pulseFeedPageSize);
                  setFeedWindowTopByLane((current) => ({
                    ...current,
                    [selectedFeed]: nextStartIndex === 0 ? null : laneFeedItems[nextStartIndex]?.id ?? null
                  }));
                }}
              >
                Show {Math.min(pulseFeedPageSize, newerFeedCount)} newer post
                {Math.min(pulseFeedPageSize, newerFeedCount) === 1 ? "" : "s"}
              </button>
            </div>
          ) : null}
          <div className="tile-list">
            {visibleFeedItems.map((item) => {
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
                    {item.postCount > 1 ? <span className="thread-pill">{item.postCount} posts</span> : null}
                  </header>
                  <p>{item.content}</p>
                  {item.posts.length > 1 ? (
                    <small>
                      Also in this burst: {item.posts.slice(1, 3).map((post) => post.content).join(" • ")}
                      {item.posts.length > 3 ? ` • +${item.posts.length - 3} more` : ""}
                    </small>
                  ) : null}
                  <small>
                    {item.sourceLabel} · {item.whyVisible}
                    {item.postCount > 1 ? ` Bundled from ${item.postCount} recent posts.` : ""} Published at{" "}
                    {item.publishedAt}.
                  </small>
                  <div className="action-row pulse-card-actions">
                    {matchingPlace ? (
                      <Link
                        className="secondary-link"
                        to={`/app?beacon=${encodeURIComponent(item.geohash)}`}
                      >
                        Compare local beacon
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
          {olderFeedCount > 0 ? (
            <div className="pulse-feed-pagination">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const nextStartIndex = visibleFeedStartIndex + pulseFeedPageSize;
                  setFeedWindowTopByLane((current) => ({
                    ...current,
                    [selectedFeed]: laneFeedItems[nextStartIndex]?.id ?? current[selectedFeed]
                  }));
                }}
              >
                Show {Math.min(pulseFeedPageSize, olderFeedCount)} older post
                {Math.min(pulseFeedPageSize, olderFeedCount) === 1 ? "" : "s"}
              </button>
            </div>
          ) : null}
        </section>
      ) : laneFeedItems.length > 0 ? (
        <article className="feature-card pulse-feed-empty-state">
          <p className="section-label">Pulse feed</p>
          <h3>No {selectedFeed.toLowerCase()} items yet.</h3>
          <p className="muted">Switch feeds to check the other lane.</p>
        </article>
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

      {!note &&
      !profile &&
      relaySyntheses.length === 0 &&
      pulseFeedItems.length === 0 &&
      pinnedNotes.length === 0 ? (
        <article className="feature-card">
          <p className="section-label">Pulse</p>
          <h3>No feed activity yet.</h3>
          <p className="muted">Profiles, syntheses, relay feed lanes, and editorial picks will appear here after the relay publishes them.</p>
        </article>
      ) : null}
    </section>
  );
}

function pruneRelayNoteMap(current: Record<string, GeoNote[]>, readableRelays: { url: string }[]) {
  const readableRelayUrls = new Set(readableRelays.map((relay) => relay.url));
  const nextEntries = Object.entries(current).filter(([relayUrl]) => readableRelayUrls.has(relayUrl));

  if (nextEntries.length === Object.keys(current).length) {
    return current;
  }

  return Object.fromEntries(nextEntries);
}

function areRelayNoteCollectionsEqual(left: GeoNote[] | undefined, right: GeoNote[]) {
  if (!left || left.length !== right.length) {
    return false;
  }

  return left.every((note, index) => {
    const other = right[index];
    return (
      note.id === other?.id &&
      note.geohash === other.geohash &&
      note.authorPubkey === other.authorPubkey &&
      note.content === other.content &&
      note.createdAt === other.createdAt &&
      note.replies === other.replies
    );
  });
}
