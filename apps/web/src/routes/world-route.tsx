import { useState } from "react";

import { MapPreview } from "../components/map-preview";

const placeTiles = [
  {
    geohash: "9q8yyk",
    latestNote: "Sunset meetup is shifting to the east stairs.",
    noteCount: 6,
    participants: ["npub1aurora", "npub1jules", "npub1sol"]
  },
  {
    geohash: "9q8yym",
    latestNote: "Afterparty moved indoors. Audio room is live.",
    noteCount: 2,
    participants: ["npub1mika"]
  },
  {
    geohash: "9q8yyt",
    latestNote: "No new notes, but the room is still occupied.",
    noteCount: 0,
    participants: ["npub1river", "npub1nox"]
  }
];

function buildStoryExport() {
  return placeTiles
    .map(
      (tile) =>
        `# ${tile.geohash}\n` +
        `Latest note: ${tile.latestNote}\n` +
        `Notes: ${tile.noteCount}\n` +
        `Participants: ${tile.participants.join(", ")}`
    )
    .join("\n\n");
}

export function WorldRoute() {
  const [storyExport, setStoryExport] = useState("");

  return (
    <div className="route-grid">
      <MapPreview tiles={placeTiles} />

      <section className="panel">
        <p className="section-label">Scene health dashboard</p>
        <h2>Relay health score</h2>
        <div className="scene-health">
          <article>
            <span>74</span>
            <p>Health score</p>
            <small>Activity trend and moderation load are balanced.</small>
          </article>
          <article>
            <span>3</span>
            <p>Active tiles</p>
            <small>Three public geohash tiles have visible live state.</small>
          </article>
          <article>
            <span>12</span>
            <p>Open seats</p>
            <small>Estimated room capacity before the next operator review.</small>
          </article>
        </div>
      </section>

      <section className="panel">
        <p className="section-label">Places</p>
        <h2>Latest tiles</h2>
        <div className="tile-list">
          {placeTiles.map((tile) => (
            <article key={tile.geohash} className="tile-card">
              <header>
                <strong>{tile.geohash}</strong>
                <span>{tile.noteCount} notes</span>
              </header>
              <p>{tile.latestNote}</p>
              <small>{tile.participants.length} live participants</small>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="section-label">Export as story</p>
        <h2>Publishable operator snapshot</h2>
        <p className="muted">
          Generate a narrative export from the visible place state. This is a client-side
          placeholder for the roadmap&apos;s story export feature.
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
