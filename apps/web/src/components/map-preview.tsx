import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

type PlaceTile = {
  geohash: string;
  title: string;
  roomID: string;
  latestNote: string;
  noteCount: number;
  participants: string[];
};

type MapPreviewProps = {
  tiles: PlaceTile[];
  selectedGeohash?: string;
  activeGeohash?: string | null;
  onSelectTile?: (geohash: string) => void;
};

type MapboxModule = typeof import("mapbox-gl");
type MapboxMap = InstanceType<MapboxModule["default"]["Map"]>;

const hasMapboxConfig = Boolean(
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN && import.meta.env.VITE_MAPBOX_STYLE_URL
);
const shouldLoadMapbox = hasMapboxConfig && import.meta.env.MODE !== "test";

const markerPositions = [
  { top: "16%", left: "20%" },
  { top: "41%", left: "58%" },
  { top: "66%", left: "34%" },
  { top: "28%", left: "76%" },
  { top: "73%", left: "72%" }
] as const;

const mapSourceID = "place-tiles";
const clusterCircleLayerID = "place-clusters";
const clusterCountLayerID = "place-cluster-count";
const pointCircleLayerID = "place-points";
const pointCountLayerID = "place-point-count";
const geohashBase32 = "0123456789bcdefghjkmnpqrstuvwxyz";

type MapDataSource = {
  setData: (data: unknown) => void;
  getClusterExpansionZoom?: (
    clusterId: number,
    callback: (error: Error | null, zoom?: number | null) => void
  ) => void;
};

function decodeGeohashCenter(geohash: string): [number, number] | null {
  let evenBit = true;
  const latitude = [-90, 90];
  const longitude = [-180, 180];

  for (const character of geohash.toLowerCase()) {
    const value = geohashBase32.indexOf(character);
    if (value < 0) {
      return null;
    }

    for (const mask of [16, 8, 4, 2, 1]) {
      if (evenBit) {
        const midpoint = (longitude[0] + longitude[1]) / 2;
        if (value & mask) {
          longitude[0] = midpoint;
        } else {
          longitude[1] = midpoint;
        }
      } else {
        const midpoint = (latitude[0] + latitude[1]) / 2;
        if (value & mask) {
          latitude[0] = midpoint;
        } else {
          latitude[1] = midpoint;
        }
      }
      evenBit = !evenBit;
    }
  }

  return [(longitude[0] + longitude[1]) / 2, (latitude[0] + latitude[1]) / 2];
}

function buildFeatureCollection(
  tiles: PlaceTile[],
  selectedGeohash?: string,
  activeGeohash?: string | null
) {
  return {
    type: "FeatureCollection" as const,
    features: tiles
      .filter((tile) => tile.noteCount > 0 || tile.participants.length > 0)
      .map((tile) => {
        const center = decodeGeohashCenter(tile.geohash);
        if (!center) {
          return null;
        }

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: center
          },
          properties: {
            geohash: tile.geohash,
            title: tile.title,
            noteCount: tile.noteCount,
            liveCount: tile.participants.length,
            isSelected: tile.geohash === selectedGeohash,
            isActive: tile.geohash === activeGeohash
          }
        };
      })
      .filter((feature): feature is NonNullable<typeof feature> => Boolean(feature))
  };
}

function ensureMapLayers(mapboxgl: MapboxModule["default"], map: MapboxMap) {
  if (!map.getSource(mapSourceID)) {
    map.addSource(mapSourceID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      cluster: true,
      clusterRadius: 56,
      clusterMaxZoom: 13,
      clusterProperties: {
        noteSum: ["+", ["get", "noteCount"]],
        liveSum: ["+", ["get", "liveCount"]]
      }
    });
  }

  if (!map.getLayer(clusterCircleLayerID)) {
    map.addLayer({
      id: clusterCircleLayerID,
      type: "circle",
      source: mapSourceID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "case",
          [">", ["coalesce", ["get", "liveSum"], 0], 0],
          "#2e8f6d",
          "#de5d3d"
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "noteSum"], 0],
          0,
          22,
          4,
          26,
          12,
          32
        ],
        "circle-stroke-color": "rgba(246, 243, 234, 0.78)",
        "circle-stroke-width": 1.5
      }
    });
  }

  if (!map.getLayer(clusterCountLayerID)) {
    map.addLayer({
      id: clusterCountLayerID,
      type: "symbol",
      source: mapSourceID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["coalesce", ["get", "noteSum"], 0]],
        "text-size": 13,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"]
      },
      paint: {
        "text-color": "#f6f3ea"
      }
    });
  }

  if (!map.getLayer(pointCircleLayerID)) {
    map.addLayer({
      id: pointCircleLayerID,
      type: "circle",
      source: mapSourceID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": [
          "case",
          ["get", "isSelected"],
          "#f6f3ea",
          [">", ["coalesce", ["get", "liveCount"], 0], 0],
          "#f6a56f",
          "#de5d3d"
        ],
        "circle-radius": [
          "case",
          ["get", "isSelected"],
          34,
          31
        ],
        "circle-stroke-color": [
          "case",
          ["get", "isSelected"],
          "#ffffff",
          [">", ["coalesce", ["get", "liveCount"], 0], 0],
          "#67d69e",
          "rgba(246, 243, 234, 0.46)"
        ],
        "circle-stroke-width": [
          "case",
          ["get", "isSelected"],
          3,
          [">", ["coalesce", ["get", "liveCount"], 0], 0],
          2,
          1.25
        ]
      }
    });
  }

  if (!map.getLayer(pointCountLayerID)) {
    map.addLayer({
      id: pointCountLayerID,
      type: "symbol",
      source: mapSourceID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["to-string", ["get", "noteCount"]],
        "text-size": 13,
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"]
      },
      paint: {
        "text-color": [
          "case",
          ["get", "isSelected"],
          "#091018",
          "#091018"
        ]
      }
    });
  }
}

export function MapPreview({
  tiles,
  selectedGeohash,
  activeGeohash,
  onSelectTile,
  children
}: PropsWithChildren<MapPreviewProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxRef = useRef<MapboxModule["default"] | null>(null);
  const mapLoadedRef = useRef(false);
  const fittedBoundsRef = useRef(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const visibleTiles = useMemo(
    () => tiles.filter((tile) => tile.noteCount > 0 || tile.participants.length > 0),
    [tiles]
  );
  const featureCollection = useMemo(
    () => buildFeatureCollection(tiles, selectedGeohash, activeGeohash),
    [tiles, selectedGeohash, activeGeohash]
  );

  useEffect(() => {
    if (!shouldLoadMapbox || !containerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;

    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        setMapError(null);
        mapboxRef.current = mapboxgl;
        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: import.meta.env.VITE_MAPBOX_STYLE_URL,
          center: [-122.4194, 37.7749],
          zoom: 11.5,
          attributionControl: false
        });

        mapRef.current = map;

        const handlePointSelect = (event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
          const geohash = event.features?.[0]?.properties?.geohash;
          if (typeof geohash === "string") {
            onSelectTile?.(geohash);
          }
        };

        const handleClusterSelect = async (
          event: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }
        ) => {
          const clusterID = event.features?.[0]?.properties?.cluster_id;
          if (clusterID === undefined) {
            return;
          }

          const source = map.getSource(mapSourceID) as MapDataSource | undefined;
          if (!source || !source.getClusterExpansionZoom) {
            return;
          }

          source.getClusterExpansionZoom(Number(clusterID), (error, zoom) => {
            if (error || zoom == null) {
              return;
            }

            map.easeTo({
              center: (event.features?.[0]?.geometry as GeoJSON.Point).coordinates as [number, number],
              zoom
            });
          });
        };

        const setPointerCursor = () => {
          map.getCanvas().style.cursor = "pointer";
        };

        const resetPointerCursor = () => {
          map.getCanvas().style.cursor = "";
        };

        map.on("load", () => {
          if (cancelled) {
            return;
          }

          mapLoadedRef.current = true;
          ensureMapLayers(mapboxgl, map);
          const source = map.getSource(mapSourceID) as MapDataSource;
          source.setData(featureCollection);

          map.on("click", pointCircleLayerID, handlePointSelect);
          map.on("click", pointCountLayerID, handlePointSelect);
          map.on("click", clusterCircleLayerID, handleClusterSelect);
          map.on("click", clusterCountLayerID, handleClusterSelect);
          map.on("mouseenter", pointCircleLayerID, setPointerCursor);
          map.on("mouseleave", pointCircleLayerID, resetPointerCursor);
          map.on("mouseenter", pointCountLayerID, setPointerCursor);
          map.on("mouseleave", pointCountLayerID, resetPointerCursor);
          map.on("mouseenter", clusterCircleLayerID, setPointerCursor);
          map.on("mouseleave", clusterCircleLayerID, resetPointerCursor);
          map.on("mouseenter", clusterCountLayerID, setPointerCursor);
          map.on("mouseleave", clusterCountLayerID, resetPointerCursor);
        });

        map.on("error", () => {
          if (!cancelled) {
            setMapError("Map failed to load.");
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setMapError("Map failed to load.");
        }
      });

    return () => {
      cancelled = true;
      mapLoadedRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
      fittedBoundsRef.current = false;
    };
  }, [featureCollection, onSelectTile]);

  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mapboxRef.current;
    if (!map || !mapboxgl || !mapLoadedRef.current) {
      return;
    }

    ensureMapLayers(mapboxgl, map);
    const source = map.getSource(mapSourceID) as MapDataSource | undefined;
    source?.setData(featureCollection);

    if (!fittedBoundsRef.current && featureCollection.features.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      for (const feature of featureCollection.features) {
        bounds.extend(feature.geometry.coordinates as [number, number]);
      }
      map.fitBounds(bounds, {
        padding: 80,
        duration: 0,
        maxZoom: 13.5
      });
      fittedBoundsRef.current = true;
    }
  }, [featureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedGeohash) {
      return;
    }

    const selectedFeature = featureCollection.features.find(
      (feature) => feature.properties.geohash === selectedGeohash
    );
    if (!selectedFeature) {
      return;
    }

    map.easeTo({
      center: selectedFeature.geometry.coordinates as [number, number],
      duration: 450,
      zoom: Math.max(map.getZoom(), 12.5)
    });
  }, [featureCollection, selectedGeohash]);

  return (
    <section className="world-map" aria-label="World map">
      <div className="map-surface world-map-surface">
        <div ref={containerRef} className="mapbox-canvas" />
        {!shouldLoadMapbox ? <div className="map-grid" aria-hidden="true" /> : null}
        {!shouldLoadMapbox
          ? visibleTiles.map((tile, index) => {
              const position = markerPositions[index % markerPositions.length];
              const isSelected = tile.geohash === selectedGeohash;
              const isActive = tile.geohash === activeGeohash;

              return (
                <button
                  key={tile.geohash}
                  className={[
                    "tile-marker",
                    tile.participants.length > 0 ? "tile-marker-live" : "",
                    isSelected ? "tile-marker-selected" : "",
                    isActive ? "tile-marker-active" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  type="button"
                  style={position}
                  aria-pressed={isSelected}
                  aria-label={`${tile.title} ${tile.geohash} has ${tile.noteCount} notes and ${tile.participants.length} live participants`}
                  onClick={() => onSelectTile?.(tile.geohash)}
                >
                  <span className="tile-marker-ring" aria-hidden="true" />
                  <strong>{tile.noteCount}</strong>
                </button>
              );
            })
          : null}
        <div className="world-map-hud world-map-hud-top">
          <span className={hasMapboxConfig ? "config-pill ready" : "config-pill"}>
            {hasMapboxConfig ? "Mapbox configured" : "Mapbox token required"}
          </span>
          <div className="map-overlay">
            <p>Canonical public precision: geohash6</p>
            <p>Map stays pannable and zoomable. Marker clusters expand as you move in.</p>
          </div>
        </div>
        {children ? <div className="world-map-layer">{children}</div> : null}
        {mapError ? <p className="map-overlay map-error">{mapError}</p> : null}
      </div>
    </section>
  );
}
