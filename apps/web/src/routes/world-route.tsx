import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { MapPreview } from "../components/map-preview";
import { useAppState } from "../app-state";
import { MediaAuthError } from "../media-client";
import { showToast } from "../toast";

export function WorldRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [storyExport, setStoryExport] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [lastUploadedMediaName, setLastUploadedMediaName] = useState("");
  const uploadControllerRef = useRef<AbortController | null>(null);
  const {
    activeCall,
    buildStoryExport,
    createPlaceNote,
    getPlace,
    getPlaceParticipants,
    joinPlaceCall,
    listPlaceMedia,
    listNotesForPlace,
    listPlaceTiles,
    sceneHealth,
    uploadPlaceMedia
  } = useAppState();

  const placeTiles = listPlaceTiles();
  const selectedGeohash = searchParams.get("place") ?? "";
  const selectedTile = placeTiles.find((tile) => tile.geohash === selectedGeohash);
  const selectedPlace = selectedGeohash ? getPlace(selectedGeohash) : undefined;
  const selectedNotes = selectedPlace ? listNotesForPlace(selectedPlace.geohash).slice(0, 3) : [];
  const selectedParticipants = selectedPlace ? getPlaceParticipants(selectedPlace.geohash) : [];
  const selectedMedia = selectedPlace ? listPlaceMedia(selectedPlace.geohash) : [];
  const selectedPresenceActive = Boolean(selectedPlace && activeCall?.geohash === selectedPlace.geohash);

  useEffect(() => {
    setDraftNote("");
    setSelectedFile(null);
    setStoryExport("");
    setLastUploadedMediaName("");
  }, [selectedGeohash]);

  useEffect(
    () => () => {
      uploadControllerRef.current?.abort();
    },
    []
  );

  function selectPlace(geohash: string) {
    setSearchParams({ place: geohash });
    joinPlaceCall(geohash);
  }

  function clearSelectedPlace() {
    setSearchParams({});
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

  async function handleMediaUpload() {
    if (!selectedPlace || !selectedFile || isUploadingMedia) {
      return;
    }

    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setIsUploadingMedia(true);

    try {
      const uploadedAsset = await uploadPlaceMedia(selectedPlace.geohash, selectedFile, controller.signal);
      if (uploadedAsset) {
        setLastUploadedMediaName(uploadedAsset.fileName);
      }
      setSelectedFile(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        showToast("Upload canceled before the blob completed.", "info");
      } else {
        showToast(
          error instanceof MediaAuthError || error instanceof Error
            ? error.message
            : "Upload failed.",
          "error"
        );
      }
    } finally {
      uploadControllerRef.current = null;
      setIsUploadingMedia(false);
    }
  }

  function handleCancelUpload() {
    uploadControllerRef.current?.abort();
  }

  return (
    <section className="world-route">
      <MapPreview
        tiles={placeTiles}
        selectedGeohash={selectedGeohash}
        activeGeohash={activeCall?.geohash}
        onSelectTile={selectPlace}
      >
        <div className="world-map-stack">
          <aside className="world-hud-card world-hud-card-top">
            <p className="section-label">World</p>
            <h2>Presence lives on the map</h2>
            <p className="muted">
              Tap a marker to set your place presence and join that tile immediately.
            </p>
            <div className="world-stat-row">
              <span className="thread-pill">{sceneHealth.healthScore} health</span>
              <span className="thread-pill">{sceneHealth.activeTiles} active tiles</span>
              <span className="thread-pill">{sceneHealth.openSeats} open seats</span>
            </div>
          </aside>

          {selectedPlace && selectedTile ? (
            <aside className="world-sheet" aria-label={`Selected place ${selectedPlace.title}`}>
              <div className="world-sheet-header">
                <div>
                  <p className="section-label">Selected place</p>
                  <h3>
                    {selectedPlace.title} · {selectedPlace.geohash}
                  </h3>
                  <p className="muted">
                    {selectedPlace.neighborhood} · {selectedPlace.description}
                  </p>
                </div>
                <button className="secondary-button" type="button" onClick={clearSelectedPlace}>
                  Close
                </button>
              </div>

              <div className="tag-row">
                <span className={selectedPresenceActive ? "thread-pill live" : "thread-pill"}>
                  {selectedPresenceActive ? "Presence active" : "Selected"}
                </span>
                <span className={selectedParticipants.length > 0 ? "thread-pill live" : "thread-pill"}>
                  {selectedParticipants.length > 0 ? `${selectedParticipants.length} live` : "Room idle"}
                </span>
                <span className="thread-pill">{selectedTile.noteCount} notes</span>
              </div>

              <div className="action-row world-sheet-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => openGeoChat(selectedPlace.geohash)}
                >
                  Open geo-chat
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => joinPlaceCall(selectedPlace.geohash)}
                >
                  Refresh room intent
                </button>
              </div>

              <div className="world-sheet-grid">
                <article className="feature-card world-detail-card">
                  <p className="section-label">Room</p>
                  <h3>{selectedTile.roomID}</h3>
                  <p>{selectedPlace.activitySummary}</p>
                  <small>{activeCall?.geohash === selectedPlace.geohash ? activeCall.statusMessage : "Tap marker to join this place."}</small>
                </article>

                <article className="feature-card world-detail-card">
                  <p className="section-label">Latest note</p>
                  <h3>{selectedTile.latestNote}</h3>
                  <div className="tag-row">
                    {selectedPlace.tags.map((tag) => (
                      <span key={tag} className="thread-pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              </div>

              <div className="world-sheet-grid">
                <article className="feature-card world-detail-card">
                  <p className="section-label">Participants</p>
                  <h3>{selectedParticipants.length} in room</h3>
                  <div className="participant-roster compact">
                    {selectedParticipants.length === 0 ? (
                      <p className="muted">No visible participants in this tile yet.</p>
                    ) : (
                      selectedParticipants.map((participant) => (
                        <div key={participant.pubkey} className="mini-card">
                          <strong>{participant.displayName}</strong>
                          <p>{participant.status}</p>
                          <small>
                            Mic {participant.mic ? "on" : "off"} · Cam {participant.cam ? "on" : "off"} · Share{" "}
                            {participant.screenshare ? "on" : "off"} · Deafen {participant.deafen ? "on" : "off"}
                          </small>
                        </div>
                      ))
                    )}
                  </div>
                </article>

                <article className="feature-card world-detail-card">
                  <p className="section-label">Publish note</p>
                  <h3>Post into {selectedPlace.title}</h3>
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
              </div>

              <div className="world-sheet-grid">
                <article className="feature-card world-detail-card">
                  <p className="section-label">Recent notes</p>
                  <h3>Latest place activity</h3>
                  <div className="note-list">
                    {selectedNotes.length === 0 ? <p className="muted">No notes yet for this tile.</p> : null}
                    {selectedNotes.map((note) => (
                      <article key={note.id} className="tile-card">
                        <p>{note.content}</p>
                        <small>{note.createdAt}</small>
                      </article>
                    ))}
                  </div>
                </article>

                <article className="feature-card world-detail-card">
                  <p className="section-label">Blossom media</p>
                  <h3>Place media bucket</h3>
                  <label className="field-stack">
                    <span>Select media</span>
                    <input
                      className="field-input"
                      type="file"
                      accept="image/*,audio/*,video/*,application/pdf"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <div className="action-row">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={handleMediaUpload}
                      disabled={!selectedFile || isUploadingMedia}
                    >
                      {isUploadingMedia ? "Uploading..." : "Upload to Blossom"}
                    </button>
                    {isUploadingMedia ? (
                      <button className="secondary-button" type="button" onClick={handleCancelUpload}>
                        Cancel upload
                      </button>
                    ) : null}
                  </div>
                  {lastUploadedMediaName ? <p className="muted">Latest upload: {lastUploadedMediaName}</p> : null}
                  <div className="media-list">
                    {selectedMedia.length === 0 ? <p className="muted">No media uploaded for this place yet.</p> : null}
                {selectedMedia.map((asset) => (
                  <article key={asset.id} className="mini-card media-card">
                    <strong>{asset.fileName}</strong>
                    <p>{asset.mimeType}</p>
                    {asset.mimeType.startsWith("image/") ? (
                      <img className="media-preview" src={asset.url} alt={asset.fileName} />
                    ) : null}
                    {asset.mimeType.startsWith("audio/") ? (
                      <audio className="media-preview" controls src={asset.url} />
                    ) : null}
                    {asset.mimeType.startsWith("video/") ? (
                      <video className="media-preview" controls src={asset.url} />
                    ) : null}
                    {asset.mimeType === "application/pdf" ? (
                      <a className="secondary-link" href={asset.url} target="_blank" rel="noreferrer">
                        Open PDF preview
                      </a>
                    ) : null}
                    <small>{asset.sha256}</small>
                    <a className="secondary-link" href={asset.url} target="_blank" rel="noreferrer">
                      Open blob
                    </a>
                  </article>
                    ))}
                  </div>
                </article>
              </div>

              <article className="feature-card world-detail-card">
                <div className="detail-header">
                  <div>
                    <p className="section-label">Operator snapshot</p>
                    <h3>Story export</h3>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setStoryExport(buildStoryExport())}
                  >
                    Generate story export
                  </button>
                </div>
                {storyExport ? <pre className="story-export">{storyExport}</pre> : null}
              </article>
            </aside>
          ) : (
            <aside className="world-hud-card world-hud-card-bottom">
              <p className="section-label">Select a place</p>
              <h3>Choose a live tile to step into its room.</h3>
              <p className="muted">
                Marker numbers show note count only. Active rooms remain visible even when they are at zero notes.
              </p>
            </aside>
          )}
        </div>
      </MapPreview>
    </section>
  );
}
