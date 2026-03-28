import { useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";

type MapTile = {
  geohash: string;
  name?: string;
  title?: string;
  roomID: string;
  latestNote: string;
  noteCount: number;
  participants: string[];
  avatarUrl?: string;
  live?: boolean;
};

type MapPreviewProps = {
  tiles: MapTile[];
  selectedGeohash?: string;
  focusRequestKey?: string;
  activeGeohash?: string | null;
  pendingGeohash?: string;
  onSelectTile?: (geohash: string) => void;
  onBackgroundSelectTile?: (geohash: string) => void;
  markerCards?: Array<{
    geohash: string;
    ariaLabel?: string;
    content: ReactNode;
  }>;
};

type MapboxModule = typeof import("mapbox-gl");
type MapboxMap = InstanceType<MapboxModule["default"]["Map"]>;
type MapInteractionTarget = {
  dispatchEvent: (event: Event) => boolean;
};

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
const geohashBase32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const defaultGeohashPrecision = 8;
const defaultMapCenter: [number, number] = [-122.4194, 37.7749];
const defaultMapZoom = 11.5;
const mapViewportStorageKey = "synchrono-city.world-map.viewport.v1";

type MapDataSource = {
  setData: (data: unknown) => void;
};

type MarkerCardPlacement = {
  left: string;
  top: string;
};

type MarkerPlacement = {
  left: string;
  top: string;
};

type StoredMapViewport = {
  bounds: {
    east: number;
    north: number;
    south: number;
    west: number;
  };
  center: [number, number];
  zoom: number;
};

const pairLayerStride = 3;

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function loadStoredMapViewport(): StoredMapViewport | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(mapViewportStorageKey);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredMapViewport> | null;
    const center = parsed?.center;
    const bounds = parsed?.bounds;

    if (
      !Array.isArray(center) ||
      center.length !== 2 ||
      !isFiniteCoordinate(center[0]) ||
      !isFiniteCoordinate(center[1]) ||
      !isFiniteCoordinate(parsed?.zoom) ||
      !bounds ||
      !isFiniteCoordinate(bounds.west) ||
      !isFiniteCoordinate(bounds.south) ||
      !isFiniteCoordinate(bounds.east) ||
      !isFiniteCoordinate(bounds.north)
    ) {
      return null;
    }

    return {
      center: [center[0], center[1]],
      zoom: parsed.zoom,
      bounds: {
        west: bounds.west,
        south: bounds.south,
        east: bounds.east,
        north: bounds.north
      }
    };
  } catch {
    return null;
  }
}

function saveMapViewport(map: MapboxMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const center = map.getCenter();
    const bounds = map.getBounds();
    if (!bounds) {
      return;
    }

    const nextViewport: StoredMapViewport = {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth()
      }
    };

    window.localStorage.setItem(mapViewportStorageKey, JSON.stringify(nextViewport));
  } catch {
    // Ignore storage failures so map interaction continues.
  }
}

function isScrollableOverflow(value: string) {
  return value === "auto" || value === "scroll" || value === "overlay";
}

function canConsumeWheelEvent(target: EventTarget | null, currentTarget: HTMLElement, deltaY: number) {
  if (!(target instanceof HTMLElement) || deltaY === 0) {
    return false;
  }

  let element: HTMLElement | null = target;

  while (element) {
    const overflowY = window.getComputedStyle(element).overflowY;
    const maxScrollTop = element.scrollHeight - element.clientHeight;

    if (
      isScrollableOverflow(overflowY) &&
      maxScrollTop > 0 &&
      ((deltaY < 0 && element.scrollTop > 0) || (deltaY > 0 && element.scrollTop < maxScrollTop))
    ) {
      return true;
    }

    if (element === currentTarget) {
      break;
    }

    element = element.parentElement;
  }

  return false;
}

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

function encodeGeohash(longitude: number, latitude: number, precision = defaultGeohashPrecision) {
  let geohash = "";
  let bit = 0;
  let characterValue = 0;
  let evenBit = true;
  const latRange = [-90, 90];
  const lngRange = [-180, 180];

  while (geohash.length < precision) {
    if (evenBit) {
      const midpoint = (lngRange[0] + lngRange[1]) / 2;
      if (longitude >= midpoint) {
        characterValue = (characterValue << 1) + 1;
        lngRange[0] = midpoint;
      } else {
        characterValue <<= 1;
        lngRange[1] = midpoint;
      }
    } else {
      const midpoint = (latRange[0] + latRange[1]) / 2;
      if (latitude >= midpoint) {
        characterValue = (characterValue << 1) + 1;
        latRange[0] = midpoint;
      } else {
        characterValue <<= 1;
        latRange[1] = midpoint;
      }
    }

    evenBit = !evenBit;
    bit += 1;

    if (bit === 5) {
      geohash += geohashBase32[characterValue];
      bit = 0;
      characterValue = 0;
    }
  }

  return geohash;
}

function buildFeatureCollection(
  tiles: MapTile[],
  selectedGeohash?: string,
  activeGeohash?: string | null
) {
  return {
    type: "FeatureCollection" as const,
    features: tiles
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
            title: tile.name ?? tile.title ?? tile.geohash,
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
      data: { type: "FeatureCollection", features: [] }
    });
  }
}

function getFallbackPlacement(tiles: MapTile[], geohash: string): MarkerCardPlacement | null {
  const visibleTiles = tiles;
  const index = visibleTiles.findIndex((tile) => tile.geohash === geohash);
  if (index < 0) {
    return null;
  }

  const position = markerPositions[index % markerPositions.length];
  return {
    top: `calc(${position.top} + 23px)`,
    left: `calc(${position.left} + 23px)`
  };
}

function getFallbackMarkerPlacements(tiles: MapTile[]) {
  const visibleTiles = tiles;

  return Object.fromEntries(
    visibleTiles.map((tile, index) => {
      const position = markerPositions[index % markerPositions.length];
      return [
        tile.geohash,
        {
          top: `calc(${position.top} + 23px)`,
          left: `calc(${position.left} + 23px)`
        } satisfies MarkerPlacement
      ];
    })
  ) as Record<string, MarkerPlacement>;
}

function buildPairLayers(visibleTiles: MapTile[]) {
  return Object.fromEntries(visibleTiles.map((tile, index) => [tile.geohash, index + 1])) as Record<string, number>;
}

function arePairLayersEqual(left: Record<string, number>, right: Record<string, number>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

export function MapPreview({
  tiles,
  selectedGeohash,
  focusRequestKey,
  activeGeohash,
  pendingGeohash,
  onSelectTile,
  onBackgroundSelectTile,
  markerCards,
  children
}: PropsWithChildren<MapPreviewProps>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxRef = useRef<MapboxModule["default"] | null>(null);
  const mapLoadedRef = useRef(false);
  const fittedBoundsRef = useRef(false);
  const onSelectTileRef = useRef(onSelectTile);
  const onBackgroundSelectTileRef = useRef(onBackgroundSelectTile);
  const pendingGeohashRef = useRef(pendingGeohash);
  const markerCardsRef = useRef(markerCards);
  const updateMarkerCardPlacementsRef = useRef<() => void>(() => {});
  const updateMarkerPlacementsRef = useRef<() => void>(() => {});
  const updatePendingPlacementRef = useRef<() => void>(() => {});
  const visibleTiles = useMemo(() => tiles, [tiles]);
  const [mapError, setMapError] = useState<string | null>(null);
  const [markerCardPlacements, setMarkerCardPlacements] = useState<Record<string, MarkerCardPlacement>>({});
  const [markerPlacements, setMarkerPlacements] = useState<Record<string, MarkerPlacement>>({});
  const [pendingPlacement, setPendingPlacement] = useState<MarkerPlacement | null>(null);
  const [pairLayers, setPairLayers] = useState<Record<string, number>>(() => buildPairLayers(visibleTiles));
  const visibleTilesRef = useRef(visibleTiles);
  const visibleMarkerCards = useMemo(
    () =>
      (markerCards ?? []).filter((card) =>
        visibleTiles.some((tile) => tile.geohash === card.geohash)
      ),
    [markerCards, visibleTiles]
  );
  const featureCollection = useMemo(
    () => buildFeatureCollection(tiles, selectedGeohash, activeGeohash),
    [tiles, selectedGeohash, activeGeohash]
  );
  const featureCollectionRef = useRef(featureCollection);
  const selectedViewportFocusSignatureRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onSelectTileRef.current = onSelectTile;
  }, [onSelectTile]);

  useEffect(() => {
    onBackgroundSelectTileRef.current = onBackgroundSelectTile;
  }, [onBackgroundSelectTile]);

  useEffect(() => {
    pendingGeohashRef.current = pendingGeohash;
  }, [pendingGeohash]);

  useEffect(() => {
    markerCardsRef.current = visibleMarkerCards;
  }, [visibleMarkerCards]);

  useEffect(() => {
    visibleTilesRef.current = visibleTiles;
  }, [visibleTiles]);

  useEffect(() => {
    featureCollectionRef.current = featureCollection;
  }, [featureCollection]);

  useEffect(() => {
    setPairLayers((current) => {
      const next: Record<string, number> = {};
      let maxLayer = 0;

      for (const tile of visibleTiles) {
        const existingLayer = current[tile.geohash];
        if (existingLayer == null) {
          continue;
        }

        next[tile.geohash] = existingLayer;
        maxLayer = Math.max(maxLayer, existingLayer);
      }

      for (const tile of visibleTiles) {
        if (next[tile.geohash] != null) {
          continue;
        }

        maxLayer += 1;
        next[tile.geohash] = maxLayer;
      }

      return arePairLayersEqual(current, next) ? current : next;
    });
  }, [visibleTiles]);

  useEffect(() => {
    if (shouldLoadMapbox) {
      return;
    }

    setMarkerPlacements(getFallbackMarkerPlacements(tiles));
    setPendingPlacement(pendingGeohash ? getFallbackPendingPlacement(pendingGeohash) : null);

    const placements = Object.fromEntries(
      visibleMarkerCards
        .map((card) => {
          const placement = getFallbackPlacement(tiles, card.geohash);
          return placement ? [card.geohash, placement] : null;
        })
        .filter((entry): entry is [string, MarkerCardPlacement] => Boolean(entry))
    );

    setMarkerCardPlacements(placements);
  }, [pendingGeohash, tiles, visibleMarkerCards]);

  useEffect(() => {
    if (!shouldLoadMapbox || !containerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;
    let resizeFrame = 0;
    let resizeObserver: ResizeObserver | null = null;

    void import("mapbox-gl")
      .then(({ default: mapboxgl }) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        setMapError(null);
        mapboxRef.current = mapboxgl;
        mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
        const storedViewport = loadStoredMapViewport();

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: import.meta.env.VITE_MAPBOX_STYLE_URL,
          center: storedViewport?.center ?? defaultMapCenter,
          zoom: storedViewport?.zoom ?? defaultMapZoom,
          attributionControl: false
        });

        mapRef.current = map;
        fittedBoundsRef.current = Boolean(storedViewport);

        if (typeof ResizeObserver === "function") {
          resizeObserver = new ResizeObserver(() => {
            window.cancelAnimationFrame(resizeFrame);
            resizeFrame = window.requestAnimationFrame(() => {
              map.resize();
            });
          });
          resizeObserver.observe(containerRef.current);
        }

        const updateMarkerPlacements = () => {
          const nextPlacements: Record<string, MarkerPlacement> = {};

          for (const tile of visibleTilesRef.current) {
            const center = decodeGeohashCenter(tile.geohash);
            if (!center) {
              continue;
            }

            const point = map.project(center as [number, number]);
            nextPlacements[tile.geohash] = {
              left: `${point.x}px`,
              top: `${point.y}px`
            };
          }

          setMarkerPlacements(nextPlacements);
        };

        const updateMarkerCardPlacements = () => {
          if (!containerRef.current || markerCardsRef.current == null) {
            setMarkerCardPlacements({});
            return;
          }

          const nextPlacements: Record<string, MarkerCardPlacement> = {};

          for (const card of markerCardsRef.current) {
            const center = decodeGeohashCenter(card.geohash);
            if (!center) {
              continue;
            }

            const point = map.project(center as [number, number]);
            nextPlacements[card.geohash] = {
              left: `${point.x}px`,
              top: `${point.y}px`
            };
          }

          setMarkerCardPlacements(nextPlacements);
        };

        const updatePendingPlacement = () => {
          const geohash = pendingGeohashRef.current?.trim();
          if (!geohash) {
            setPendingPlacement(null);
            return;
          }

          const center = decodeGeohashCenter(geohash);
          if (!center) {
            setPendingPlacement(null);
            return;
          }

          const point = map.project(center as [number, number]);
          setPendingPlacement({
            left: `${point.x}px`,
            top: `${point.y}px`
          });
        };

        updateMarkerPlacementsRef.current = updateMarkerPlacements;
        updateMarkerCardPlacementsRef.current = updateMarkerCardPlacements;
        updatePendingPlacementRef.current = updatePendingPlacement;

        const handleBackgroundClick = (event: mapboxgl.MapMouseEvent) => {
          fittedBoundsRef.current = true;
          const geohash = encodeGeohash(event.lngLat.lng, event.lngLat.lat, defaultGeohashPrecision);
          if (onBackgroundSelectTileRef.current) {
            onBackgroundSelectTileRef.current(geohash);
            return;
          }
          onSelectTileRef.current?.(geohash);
        };

        const setPointerCursor = () => {
          map.getCanvas().style.cursor = "pointer";
        };

        const resetPointerCursor = () => {
          map.getCanvas().style.cursor = "";
        };

        const persistViewport = () => {
          saveMapViewport(map);
        };

        map.on("load", () => {
          if (cancelled) {
            return;
          }

          mapLoadedRef.current = true;
          setMapReady(true);
          ensureMapLayers(mapboxgl, map);
          const source = map.getSource(mapSourceID) as MapDataSource;
          source.setData(featureCollectionRef.current);
          updateMarkerPlacements();
          updateMarkerCardPlacements();
          updatePendingPlacement();

          map.on("click", handleBackgroundClick);
          map.on("move", updateMarkerPlacements);
          map.on("move", updateMarkerCardPlacements);
          map.on("move", updatePendingPlacement);
          map.on("moveend", persistViewport);
          map.on("resize", updateMarkerPlacements);
          map.on("resize", updateMarkerCardPlacements);
          map.on("resize", updatePendingPlacement);
          map.getCanvas().addEventListener("mouseenter", setPointerCursor);
          map.getCanvas().addEventListener("mouseleave", resetPointerCursor);
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
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      mapLoadedRef.current = false;
      selectedViewportFocusSignatureRef.current = null;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      mapboxRef.current = null;
      fittedBoundsRef.current = false;
      updateMarkerPlacementsRef.current = () => {};
      updateMarkerCardPlacementsRef.current = () => {};
      updatePendingPlacementRef.current = () => {};
      setMarkerPlacements({});
      setMarkerCardPlacements({});
      setPendingPlacement(null);
    };
  }, []);

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

    updateMarkerPlacementsRef.current();
    updateMarkerCardPlacementsRef.current();
    updatePendingPlacementRef.current();
  }, [featureCollection, visibleMarkerCards]);

  useEffect(() => {
    updatePendingPlacementRef.current();
  }, [pendingGeohash]);

  useEffect(() => {
    if (!selectedGeohash || !visibleTiles.some((tile) => tile.geohash === selectedGeohash)) {
      return;
    }

    bringGeohashToFront(selectedGeohash);
  }, [focusRequestKey, selectedGeohash, visibleTiles]);

  useEffect(() => {
    const focusSignature = selectedGeohash ? `${selectedGeohash}:${focusRequestKey ?? ""}` : null;

    if (!mapReady) {
      return;
    }

    const map = mapRef.current;
    if (!map || !selectedGeohash) {
      selectedViewportFocusSignatureRef.current = null;
      return;
    }

    if (selectedViewportFocusSignatureRef.current === focusSignature) {
      return;
    }

    const center = decodeGeohashCenter(selectedGeohash);
    if (!center) {
      return;
    }

    map.easeTo({
      center,
      duration: 320,
      essential: true
    });
    selectedViewportFocusSignatureRef.current = focusSignature;
  }, [focusRequestKey, mapReady, selectedGeohash]);

  function forwardWheelToMap(event: React.WheelEvent<HTMLElement>) {
    if (!shouldLoadMapbox || !containerRef.current || !mapRef.current) {
      return;
    }

    if (canConsumeWheelEvent(event.target, event.currentTarget, event.deltaY)) {
      event.stopPropagation();
      return;
    }

    event.preventDefault();

    const interactionTarget =
      ((mapRef.current as MapboxMap & {
        getCanvasContainer?: () => MapInteractionTarget;
      }).getCanvasContainer?.() ??
        mapRef.current.getCanvas()) as MapInteractionTarget;

    interactionTarget.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaMode: event.deltaMode,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey
      })
    );
  }

  function bringGeohashToFront(geohash: string) {
    setPairLayers((current) => {
      const currentLayer = current[geohash];
      if (currentLayer == null) {
        return current;
      }

      const maxLayer = Math.max(...Object.values(current));
      if (currentLayer === maxLayer) {
        return current;
      }

      return {
        ...current,
        [geohash]: maxLayer + 1
      };
    });
  }

  function selectMarkerGeohash(geohash: string) {
    bringGeohashToFront(geohash);
    onSelectTile?.(geohash);
  }

  function handleMarkerPointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    geohash: string
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    selectMarkerGeohash(geohash);
  }

  function handleMarkerClick(event: React.MouseEvent<HTMLButtonElement>, geohash: string) {
    // Keyboard activation does not emit pointer events, so preserve it here
    // while pointer interactions select on pointer down before z-index changes
    // can interfere with the later click event.
    if (event.detail === 0) {
      selectMarkerGeohash(geohash);
    }
  }

  return (
    <section className="world-map" aria-label="World map">
      <div className="map-surface world-map-surface">
        <div ref={containerRef} className="mapbox-canvas" />
        {!shouldLoadMapbox ? <div className="map-grid" aria-hidden="true" /> : null}
        {visibleTiles.map((tile) => {
          const position = markerPlacements[tile.geohash];
          if (!position) {
            return null;
          }

          const isSelected = tile.geohash === selectedGeohash;
          const isActive = tile.geohash === activeGeohash;
          const label = tile.name ?? tile.title ?? tile.geohash;
          const pairLayer = pairLayers[tile.geohash] ?? visibleTiles.findIndex((entry) => entry.geohash === tile.geohash) + 1;
          const pairZBase = pairLayer * pairLayerStride;

          return (
            <button
              key={tile.geohash}
              className={[
                "tile-marker",
                tile.live || tile.participants.length > 0 ? "tile-marker-live" : "",
                isSelected ? "tile-marker-selected" : "",
                isActive ? "tile-marker-active" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              type="button"
              style={{
                ...position,
                zIndex: pairZBase + (isSelected || isActive ? 1 : 0)
              }}
              aria-pressed={isSelected}
              aria-label={`${label} ${tile.geohash} has ${tile.noteCount} notes and ${tile.participants.length} live participants`}
              onClick={(event) => handleMarkerClick(event, tile.geohash)}
              onFocus={() => bringGeohashToFront(tile.geohash)}
              onPointerDown={(event) => handleMarkerPointerDown(event, tile.geohash)}
              onWheel={forwardWheelToMap}
            >
              <span className="tile-marker-ring" aria-hidden="true" />
              {tile.avatarUrl ? (
                <img className="tile-marker-avatar" src={tile.avatarUrl} alt={label} loading="lazy" />
              ) : (
                <span className="tile-marker-fallback" aria-hidden="true">
                  {resolveMarkerInitials(label)}
                </span>
              )}
            </button>
          );
        })}
        {visibleMarkerCards.length > 0 ? (
          <div className="world-map-layer">
            {visibleMarkerCards.map((card) => {
              const placement = markerCardPlacements[card.geohash];
              if (!placement) {
                return null;
              }

              const pairLayer =
                pairLayers[card.geohash] ?? visibleTiles.findIndex((tile) => tile.geohash === card.geohash) + 1;

              return (
                <div
                  key={card.geohash}
                  className="marker-card-anchor"
                  style={{
                    left: placement.left,
                    top: placement.top,
                    zIndex: pairLayer * pairLayerStride - 1
                  }}
                  onWheel={forwardWheelToMap}
                >
                  <div
                    className="marker-card"
                    aria-label={card.ariaLabel}
                    onPointerDown={() => bringGeohashToFront(card.geohash)}
                  >
                    {card.content}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {pendingPlacement ? (
          <div
            className="map-pending-pin"
            style={{
              left: pendingPlacement.left,
              top: pendingPlacement.top
            }}
            aria-hidden="true"
          >
            <span className="map-pending-pin-ring" />
            <span className="map-pending-pin-core" />
          </div>
        ) : null}
        {children ? <div className="world-map-layer">{children}</div> : null}
        {mapError ? <p className="map-overlay map-error">{mapError}</p> : null}
      </div>
    </section>
  );
}

function resolveMarkerInitials(label: string) {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "B";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function getFallbackPendingPlacement(geohash: string): MarkerPlacement {
  const positionIndex =
    geohash.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % markerPositions.length;
  const position = markerPositions[positionIndex];

  return {
    top: `calc(${position.top} + 23px)`,
    left: `calc(${position.left} + 23px)`
  };
}
