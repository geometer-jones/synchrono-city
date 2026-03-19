import { useEffect, useRef, useState } from "react";

type PlaceTile = {
  geohash: string;
  latestNote: string;
  noteCount: number;
  participants: string[];
};

type MapPreviewProps = {
  tiles: PlaceTile[];
};

const hasMapboxConfig = Boolean(
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN && import.meta.env.VITE_MAPBOX_STYLE_URL
);

export function MapPreview({ tiles }: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasMapboxConfig || !containerRef.current) {
      return;
    }

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        setMapError(null);
        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: import.meta.env.VITE_MAPBOX_STYLE_URL,
          center: [-122.4194, 37.7749],
          zoom: 11.5,
          attributionControl: false
        });

        map.on("error", () => {
          if (!cancelled) {
            setMapError("Map failed to load.");
          }
        });

        cleanup = () => map.remove();
      })
      .catch(() => {
        if (!cancelled) {
          setMapError("Map failed to load.");
        }
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <section className="map-card" aria-label="World map preview">
      <div className="map-card-header">
        <div>
          <p className="section-label">World</p>
          <h2>Geohash-scoped live activity</h2>
        </div>
        <span className={hasMapboxConfig ? "config-pill ready" : "config-pill"}>
          {hasMapboxConfig ? "Mapbox configured" : "Mapbox token required"}
        </span>
      </div>

      <div className="map-surface">
        <div ref={containerRef} className="mapbox-canvas" />
        <div className="map-grid" aria-hidden="true" />
        {tiles.map((tile, index) => (
          <button
            key={tile.geohash}
            className={`tile-marker marker-${index + 1}`}
            type="button"
            aria-label={`${tile.geohash} has ${tile.noteCount} notes and ${tile.participants.length} live participants`}
          >
            {tile.noteCount}
          </button>
        ))}
        <div className="map-overlay">
          <p>Canonical public precision: geohash6</p>
          <p>Markers show note count. Call presence remains visible at zero notes.</p>
        </div>
        {mapError ? <p className="map-overlay">{mapError}</p> : null}
      </div>
    </section>
  );
}
