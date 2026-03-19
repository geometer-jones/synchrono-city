import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useAppState } from "../app-state";
import { MapPreview } from "../components/map-preview";

export function WorldRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [storyExport, setStoryExport] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const {
    buildStoryExport,
    createPlaceNote,
    getPlace,
    getPlaceParticipants,
    joinPlaceCall,
    listNotesForPlace,
    listPlaceTiles,
    sceneHealth
  } = useAppState();

  const placeTiles = listPlaceTiles();
  const selectedGeohash = searchParams.get("place") ?? placeTiles[0]?.geohash ?? "";
  const selectedPlace = getPlace(selectedGeohash) ?? getPlace(placeTiles[0]?.geohash ?? "");
  const selectedNotes = selectedPlace ? listNotesForPlace(selectedPlace.geohash).slice(0, 3) : [];
  const selectedParticipants = selectedPlace ? getPlaceParticipants(selectedPlace.geohash) : [];

  function selectPlace(geohash: string) {
    setSearchParams({ place: geohash });
  }

  function openGeoChat(geohash: string) {
    navigate(`/app/chats?geohash=${encodeURIComponent(geohash)}`);
  }

  function handleNoteSubmit() {
    if (!selectedPlace) {
      return;
    }

    const nextNote = createPlaceNote(selectedPlace.geohash, draftNote);
    if (nextNote) {
      setDraftNote("");
    }
  }

  return (
    <div className="route-grid">
      <MapPreview tiles={placeTiles} onSelectTile={openGeoChat} />

      <section className="panel">
        <p className="section-label">Scene health dashboard</p>
        <h2>Relay health score</h2>
        <div className="scene-health">
          <article>
            <span>{sceneHealth.healthScore}</span>
            <p>Health score</p>
            <small>Live room intent, note traffic, and place capacity are all in play.</small>
          </article>
          <article>
            <span>{sceneHealth.activeTiles}</span>
            <p>Application-defined places</p>
            <small>Each place carries its own room identity, tags, and local note stack.</small>
          </article>
          <article>
            <span>{sceneHealth.openSeats}</span>
            <p>Open seats</p>
            <small>Estimated room capacity before the current public places fill.</small>
          </article>
        </div>
      </section>

      <section className="panel">
        <p className="section-label">Places</p>
        <h2>World places</h2>
        <div className="tile-list">
          {placeTiles.map((tile) => {
            const place = getPlace(tile.geohash);

            return (
              <article key={tile.geohash} className="tile-card">
                <header>
                  <div>
                    <strong>{tile.geohash}</strong>
                    <p className="tile-kicker">{tile.title}</p>
                  </div>
                  <span>{tile.noteCount} notes</span>
                </header>
                <p>{place?.description ?? tile.latestNote}</p>
                <small>{tile.roomID}</small>
                <div className="tag-row">
                  {(place?.tags ?? []).map((tag) => (
                    <span key={tag} className="thread-pill">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="action-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => selectPlace(tile.geohash)}
                  >
                    Inspect place
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => joinPlaceCall(tile.geohash)}
                  >
                    Join room
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => openGeoChat(tile.geohash)}
                  >
                    Open geo-chat {tile.geohash}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedPlace ? (
        <section className="panel">
          <p className="section-label">Selected place</p>
          <h2>
            {selectedPlace.title} · {selectedPlace.geohash}
          </h2>
          <p className="muted">
            {selectedPlace.neighborhood} · {selectedPlace.description}
          </p>

          <div className="feature-grid">
            <article className="feature-card">
              <p className="section-label">Room resolution</p>
              <h3>{placeTiles.find((tile) => tile.geohash === selectedPlace.geohash)?.roomID}</h3>
              <p>{selectedPlace.activitySummary}</p>
              <div className="action-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => joinPlaceCall(selectedPlace.geohash)}
                >
                  Join call intent
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => openGeoChat(selectedPlace.geohash)}
                >
                  Open chat
                </button>
              </div>
            </article>

            <article className="feature-card">
              <p className="section-label">Current participants</p>
              <h3>{selectedParticipants.length} live participants</h3>
              <div className="participant-roster compact">
                {selectedParticipants.map((participant) => (
                  <div key={participant.pubkey} className="mini-card">
                    <strong>{participant.displayName}</strong>
                    <p>{participant.status}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <p className="section-label">Notes at place</p>
              <h3>Publish into {selectedPlace.title}</h3>
              <textarea
                className="note-input"
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="Post an operator-facing place note."
              />
              <div className="action-row">
                <button className="primary-button" type="button" onClick={handleNoteSubmit}>
                  Publish note
                </button>
              </div>
            </article>

            <article className="feature-card">
              <p className="section-label">Recent notes</p>
              <h3>Latest place activity</h3>
              <div className="note-list">
                {selectedNotes.map((note) => (
                  <article key={note.id} className="tile-card">
                    <p>{note.content}</p>
                    <small>{note.createdAt}</small>
                  </article>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <p className="section-label">Export as story</p>
        <h2>Publishable operator snapshot</h2>
        <p className="muted">
          Generate a narrative export from the visible place state. This stays client-side
          but now includes room IDs, application-defined places, and note activity.
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={() => setStoryExport(buildStoryExport())}
        >
          Generate story export
        </button>
        {storyExport ? <pre className="story-export">{storyExport}</pre> : null}
      </section>
    </div>
  );
}
